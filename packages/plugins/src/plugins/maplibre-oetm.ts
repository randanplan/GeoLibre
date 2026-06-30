/**
 * ÖTM-Aufnahme-Plugin
 * ===================
 * GeoLibre-Plugin für das Ökologische Trassenmanagement (ÖTM).
 *
 * IMPLEMENTATION_PLAN-Referenz: Phasen 0.1 + 1 + 2
 */
import type {
  GeoLibreAppAPI,
  GeoLibrePlugin,
  GeoLibreToolbarMenu,
} from "../types";
import type {
  OetmLot,
  OetmMeasure,
  OetmPluginState,
  OetmSheetStatus,
} from "../oetm-types";
import { loadLot, mastsToGeoJson } from "../oetm-parser";
import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import { Popup as MaplibrePopup } from "maplibre-gl";
import {
  initMeasuresModule,
  buildMeasureSection,
  importMeasuresFromPdf,
} from "./maplibre-oetm-measures";

export const OETM_PLUGIN_ID = "oetm-workflow";
const PANEL_ID = "oetm-workbench";
const MENU_ID = "oetm-menu";

let lots: Record<string, OetmLot> = {};
let sheetStatus: Record<string, OetmSheetStatus> = {};
let maststandortpflegeStatus: Record<string, boolean> = {};
let measures: OetmMeasure[] = [];
let activeLotNumber: string | null = null;
let ui = {
  showControlledSheets: true,
  showMaststandortpflegeOnly: false,
};
/** Maps GeoLibre layer ID → { type: 'sheet' | 'mast', lotNumber } */
let layerRegistry: Map<string, { type: "sheet" | "mast"; lotNumber: string }> = new Map();

let unregisterPanel: (() => void) | null = null;
let unregisterMenu: (() => void) | null = null;
let appRef: GeoLibreAppAPI | null = null;

// ── Status-Farben ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<OetmSheetStatus, string> = {
  "offen": "#9CA3AF",
  "in-arbeit": "#F59E0B",
  "kontrolliert": "#10B981",
  "abgenommen": "#3B82F6",
};

function statusColor(status: OetmSheetStatus): string {
  return STATUS_COLORS[status] ?? "#9CA3AF";
}

// ── Helper ───────────────────────────────────────────────────────────────────

function buildPluginState(): OetmPluginState {
  return {
    version: 1,
    lots,
    sheetStatus,
    maststandortpflegeStatus,
    measures,
    activeLotNumber,
    ui,
  };
}

function restorePluginState(state: unknown): void {
  const s = state as OetmPluginState | undefined;
  if (!s || s.version !== 1) return;
  lots = s.lots ?? {};
  sheetStatus = s.sheetStatus ?? {};
  maststandortpflegeStatus = s.maststandortpflegeStatus ?? {};
  measures = s.measures ?? [];
  activeLotNumber = s.activeLotNumber ?? null;
  ui = s.ui ?? { showControlledSheets: true, showMaststandortpflegeOnly: false };
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// ── MapLibre Layer Naming ────────────────────────────────────────────────────
// GeoLibre names MapLibre sources/layers predictably:
//   source-{uuid}         → MapLibre source ID
//   layer-{uuid}-fill     → MapLibre fill layer (polygons)
//   layer-{uuid}-circle   → MapLibre circle layer (points)
//   layer-{uuid}-line     → MapLibre line layer (outline)

function mapLibreFillId(geoLibreLayerId: string): string {
  return `layer-${geoLibreLayerId}-fill`;
}

function mapLibreCircleId(geoLibreLayerId: string): string {
  return `layer-${geoLibreLayerId}-circle`;
}

// ── Layer Styling ────────────────────────────────────────────────────────────

function applySheetStatusStyling(map: maplibregl.Map, layerId: string) {
  const fillId = mapLibreFillId(layerId);
  if (!map.getLayer(fillId)) return;

  // Farbe anhand der status-Property
  map.setPaintProperty(fillId, "fill-color", [
    "match",
    ["get", "status"],
    "offen", STATUS_COLORS["offen"],
    "in-arbeit", STATUS_COLORS["in-arbeit"],
    "kontrolliert", STATUS_COLORS["kontrolliert"],
    "abgenommen", STATUS_COLORS["abgenommen"],
    STATUS_COLORS["offen"],
  ]);
  map.setPaintProperty(fillId, "fill-opacity", 0.5);
  map.setPaintProperty(fillId, "fill-outline-color", "#374151");

  // Line layer (Umrandung)
  const lineId = `layer-${layerId}-line`;
  if (map.getLayer(lineId)) {
    map.setPaintProperty(lineId, "line-color", "#374151");
    map.setPaintProperty(lineId, "line-width", 1);
  }
}

function applyMastStyling(map: maplibregl.Map, layerId: string) {
  const circleId = mapLibreCircleId(layerId);
  if (!map.getLayer(circleId)) return;

  map.setPaintProperty(circleId, "circle-radius", [
    "match",
    ["get", "isPortal"],
    true, 8,
    6,
  ]);
  map.setPaintProperty(circleId, "circle-color", [
    "case",
    ["get", "maststandortpflege"],
    "#10B981",
    "#6B7280",
  ]);
  map.setPaintProperty(circleId, "circle-stroke-color", "#FFFFFF");
  map.setPaintProperty(circleId, "circle-stroke-width", 1.5);
  map.setPaintProperty(circleId, "circle-opacity", [
    "case",
    ["get", "maststandortpflege"],
    1,
    0.7,
  ]);
}

function applyMastFilter(map: maplibregl.Map, layerId: string, onlyUnmaintained: boolean) {
  const circleId = mapLibreCircleId(layerId);
  if (!map.getLayer(circleId)) return;
  if (onlyUnmaintained) {
    map.setFilter(circleId, ["!=", ["get", "maststandortpflege"], true]);
  } else {
    map.setFilter(circleId, null);
  }
}

function applySheetFilter(map: maplibregl.Map, layerId: string, showControlled: boolean) {
  const fillId = mapLibreFillId(layerId);
  if (!map.getLayer(fillId)) return;
  if (!showControlled) {
    map.setFilter(fillId, ["!=", ["get", "status"], "kontrolliert"]);
  } else {
    map.setFilter(fillId, null);
  }
}

function updateAllFilters() {
  const map = appRef?.getMap?.();
  if (!map) return;
  for (const [geoLibreId, reg] of layerRegistry) {
    if (reg.type === "sheet") {
      applySheetFilter(map, geoLibreId, ui.showControlledSheets);
    } else if (reg.type === "mast") {
      applyMastFilter(map, geoLibreId, ui.showMaststandortpflegeOnly);
    }
  }
}

function updateAllStyling() {
  const map = appRef?.getMap?.();
  if (!map) return;
  for (const [geoLibreId, reg] of layerRegistry) {
    if (reg.type === "sheet") {
      applySheetStatusStyling(map, geoLibreId);
    } else if (reg.type === "mast") {
      applyMastStyling(map, geoLibreId);
    }
  }
}

// ── Klick-Interaktion ────────────────────────────────────────────────────────

function setupClickHandlers(map: maplibregl.Map) {
  for (const [geoLibreId, reg] of layerRegistry) {
    if (reg.type !== "sheet") continue;
    const fillId = mapLibreFillId(geoLibreId);
    if (!map.getLayer(fillId)) continue;

    map.on("click", fillId, (e) => {
      if (!e.features || e.features.length === 0) return;
      const feat = e.features[0];
      const props = feat.properties as Record<string, unknown> | null;
      if (!props) return;

      const sheetId = String(props.sheetId ?? "");
      const status = sheetStatus[sheetId] ?? "offen";
      const pdfName = String(props.pdfFileName ?? "");
      const mastCount = Number(props.mastCount ?? 0);

      const statusLabel: Record<string, string> = {
        "offen": "Offen",
        "in-arbeit": "In Arbeit",
        "kontrolliert": "Kontrolliert",
        "abgenommen": "Abgenommen",
      };

      const html = `
        <div style="font-family:system-ui;font-size:13px;max-width:280px">
          <div style="font-weight:600;margin-bottom:4px;">${pdfName}</div>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:2px 0;color:#6b7280">Blatt-ID</td><td style="padding:2px 0;text-align:right">${sheetId}</td></tr>
            <tr><td style="padding:2px 0;color:#6b7280">Status</td>
                <td style="padding:2px 0;text-align:right">
                  <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${statusColor(status as OetmSheetStatus)};margin-right:4px;"></span>
                  ${statusLabel[status] ?? status}
                </td></tr>
            <tr><td style="padding:2px 0;color:#6b7280">Maste</td><td style="padding:2px 0;text-align:right">${mastCount}</td></tr>
          </table>
        </div>
      `;

      new MaplibrePopup({ closeButton: true, closeOnClick: false, maxWidth: "300px" })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    });

    map.on("mouseenter", fillId, () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", fillId, () => {
      map.getCanvas().style.cursor = "";
    });
  }
}

// ── Layer-Management ─────────────────────────────────────────────────────────

function createSheetLayer(lot: OetmLot) {
  const app = appRef;
  if (!app || lot.sheets.length === 0) return;

  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (const sheet of lot.sheets) {
    if (!sheet.bbox) continue;
    const [w, s, e, n] = sheet.bbox;
    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
      },
      properties: {
        sheetId: sheet.sheetId,
        sheetNumber: sheet.sheetNumber,
        pdfFileName: sheet.pdfFileName,
        status: sheetStatus[sheet.sheetId] ?? "offen",
        mastCount: sheet.mastCount,
      },
    });
  }
  if (features.length === 0) return;

  const fc: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
    type: "FeatureCollection",
    features,
  };

  const geoLibreId = app.addGeoJsonLayer(`ÖTM-Blattschnitte ${lot.label}`, fc);
  layerRegistry.set(geoLibreId, { type: "sheet", lotNumber: lot.lotNumber });

  // Styling auf die Map anwenden (sobald Layouterstellung abgeschlossen)
  const map = app.getMap?.();
  if (map) {
    // setTimeout 0 damit MapLibre den Layer fertig registriert hat
    setTimeout(() => {
      applySheetStatusStyling(map, geoLibreId);
      applySheetFilter(map, geoLibreId, ui.showControlledSheets);
    }, 0);
  }
}

function createMastLayer(lot: OetmLot) {
  const app = appRef;
  if (!app || lot.masts.length === 0) return;

  const fc = mastsToGeoJson(lot.masts);
  const geoLibreId = app.addGeoJsonLayer(`ÖTM-Strommasten ${lot.label}`, fc);
  layerRegistry.set(geoLibreId, { type: "mast", lotNumber: lot.lotNumber });

  const map = app.getMap?.();
  if (map) {
    setTimeout(() => {
      applyMastStyling(map, geoLibreId);
      applyMastFilter(map, geoLibreId, ui.showMaststandortpflegeOnly);
    }, 0);
  }
}

function fitMapToLot(lot: OetmLot) {
  const app = appRef;
  if (!app) return;
  const allCoords = lot.masts.map((m) => m.coordinates).filter((c) => c[0] !== 0 && c[1] !== 0);
  if (allCoords.length === 0) return;
  const lngs = allCoords.map((c) => c[0]);
  const lats = allCoords.map((c) => c[1]);
  const bounds: [number, number, number, number] = [
    Math.min(...lngs), Math.min(...lats),
    Math.max(...lngs), Math.max(...lats),
  ];
  const padLng = (bounds[2] - bounds[0]) * 0.1 || 0.01;
  const padLat = (bounds[3] - bounds[1]) * 0.1 || 0.01;
  bounds[0] -= padLng;
  bounds[1] -= padLat;
  bounds[2] += padLng;
  bounds[3] += padLat;
  app.fitBounds?.(bounds);
}

function removeAllLayers() {
  // GeoLibre verwaltet Layer intern — wir können sie nicht einfach entfernen.
  // Stattdessen leeren wir das Registry und setzen es beim nächsten Laden neu.
  layerRegistry.clear();
}

function ensureLotLayers(lot: OetmLot) {
  removeAllLayers();
  createSheetLayer(lot);
  createMastLayer(lot);
  fitMapToLot(lot);
  const map = appRef?.getMap?.();
  if (map) {
    setTimeout(() => setupClickHandlers(map), 50);
  }
}

// ── Los-Lade-Flow ────────────────────────────────────────────────────────────

async function handleLoadLot() {
  const app = appRef;
  if (!app) return;

  try {
    // Ein Schritt: alle Dateien auf einmal auswählen.
    // Der Benutzer wählt: Mengengerüst.xlsx + Log_*.log + alle ÖTM-*.PDFs
    const allFiles = await pickFiles(".xlsx,.log,.pdf,.txt");
    if (!allFiles || allFiles.length === 0) return;

    const fileArray = Array.from(allFiles);

    // Mengengerüst-Excel finden
    const mengengeruestFile = fileArray.find((f) => /mengengerüst/i.test(f.name));
    if (!mengengeruestFile) {
      alert("Keine Mengengerüst-Excel ausgewählt. Bitte wähle die Datei 'Mengengerüst_*.xlsx'.");
      return;
    }
    const mengengeruestData = await readFileAsArrayBuffer(mengengeruestFile);

    const fileNameMatch = mengengeruestFile.name.match(/Mengengerüst_(\d{4})_(.+)\.xlsx/i);
    let lotNumber = fileNameMatch ? fileNameMatch[1] : "";
    let lotName = fileNameMatch ? fileNameMatch[2] : "";
    if (!lotNumber) {
      alert("Los-Nummer nicht aus Dateinamen ableitbar: " + mengengeruestFile.name);
      return;
    }

    // Log-Datei finden
    const logFile = fileArray.find((f) => /log_/i.test(f.name) && /\.log$|\.txt$/i.test(f.name));
    let logText: string | null = null;
    if (logFile) logText = await readFileAsText(logFile);

    // PDFs filtern (nur ÖTM-*)
    const pdfFileNames = fileArray
      .filter((f) => /\.pdf$/i.test(f.name) && /^ÖTM-/i.test(f.name))
      .map((f) => f.name);

    const lot = loadLot(lotNumber, lotName, "2026-27", "westnetz", mengengeruestData, logText, pdfFileNames);
    lots[lot.lotNumber] = lot;
    activeLotNumber = lot.lotNumber;
    for (const sheet of lot.sheets) {
      if (!(sheet.sheetId in sheetStatus)) sheetStatus[sheet.sheetId] = "offen";
    }

    ensureLotLayers(lot);
    initMeasuresModule(appRef!, () => activeLotNumber, () => activeLotNumber && lots[activeLotNumber] ? lots[activeLotNumber].sheets : [], () => { reRenderWorkbench(); });
    reRenderWorkbench();
    console.log(`[ÖTM] Los ${lot.label} geladen: ${lot.sheets.length} Blätter, ${lot.masts.length} Maste`);
  } catch (err) {
    console.error("[ÖTM] Fehler:", err);
    alert("Fehler: " + (err as Error).message);
  }
}

function pickFiles(accept: string): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const files = input.files;
      document.body.removeChild(input);
      resolve(files);
    });
    input.addEventListener("cancel", () => {
      document.body.removeChild(input);
      resolve(null);
    });
    input.click();
  });
}

// ── Status-Management ────────────────────────────────────────────────────────

function setSheetStatus(sheetId: string, status: OetmSheetStatus) {
  sheetStatus[sheetId] = status;
  // GeoJSON-Properties updaten via MapLibre
  const map = appRef?.getMap?.();
  if (map) {
    for (const [geoLibreId, reg] of layerRegistry) {
      if (reg.type !== "sheet") continue;
      const sourceId = `source-${geoLibreId}`;
      const source = map.getSource(sourceId) as GeoJSONSource | undefined;
      if (source) {
        // GeoJSONSource has setData() — update the in-memory geojson
        const currentData = (source as unknown as { _data?: GeoJSON.FeatureCollection })._data;
        if (currentData) {
          for (const feat of currentData.features) {
            if (feat.properties?.sheetId === sheetId) {
              feat.properties.status = status;
            }
          }
          source.setData(currentData);
        }
      }
      applySheetStatusStyling(map, geoLibreId);
      applySheetFilter(map, geoLibreId, ui.showControlledSheets);
    }
  }
  reRenderWorkbench();
}

function batchSetStatus(status: OetmSheetStatus) {
  if (!activeLotNumber || !lots[activeLotNumber]) return;
  for (const sheet of lots[activeLotNumber].sheets) {
    sheetStatus[sheet.sheetId] = status;
  }
  // Komplett-Neuaufbau der Layer
  ensureLotLayers(lots[activeLotNumber]);
  reRenderWorkbench();
}

function toggleMastFilter() {
  ui.showMaststandortpflegeOnly = !ui.showMaststandortpflegeOnly;
  updateAllFilters();
  reRenderWorkbench();
}

function toggleSheetFilter() {
  ui.showControlledSheets = !ui.showControlledSheets;
  updateAllFilters();
  reRenderWorkbench();
}

// ── Panel-Rendering ──────────────────────────────────────────────────────────

function reRenderWorkbench() {
  const existing = document.getElementById("oetm-panel-content");
  if (existing) {
    existing.innerHTML = "";
    buildWorkbenchDOM(existing);
  }
}

function buildWorkbenchDOM(container: HTMLElement) {
  const wrapper = document.createElement("div");
  wrapper.style.padding = "16px";
  wrapper.style.fontFamily = "system-ui, sans-serif";
  wrapper.style.fontSize = "14px";
  wrapper.style.color = "var(--color-text, #1f2937)";

  // Header
  const title = document.createElement("h3");
  title.textContent = "ÖTM-Workbench";
  title.style.margin = "0 0 12px 0";
  title.style.fontSize = "16px";
  title.style.fontWeight = "600";
  wrapper.appendChild(title);

  // Los laden Button + Hinweis
  const loadBtn = document.createElement("button");
  loadBtn.textContent = Object.keys(lots).length === 0 ? "Los laden" : "Weiteres Los laden";
  loadBtn.style.padding = "8px 16px";
  loadBtn.style.backgroundColor = "var(--color-primary, #2563eb)";
  loadBtn.style.color = "#fff";
  loadBtn.style.border = "none";
  loadBtn.style.borderRadius = "6px";
  loadBtn.style.cursor = "pointer";
  loadBtn.style.fontSize = "14px";
  loadBtn.style.width = "100%";
  loadBtn.style.marginBottom = "4px";
  loadBtn.onclick = () => handleLoadLot();
  wrapper.appendChild(loadBtn);

  if (Object.keys(lots).length === 0) {
    const hint = document.createElement("div");
    hint.textContent = "Wähle: Mengengerüst_*.xlsx + Log_*.log + ÖTM-*.PDFs (Mehrfachauswahl)";
    hint.style.fontSize = "11px";
    hint.style.color = "var(--color-text-muted, #9ca3af)";
    hint.style.marginBottom = "16px";
    wrapper.appendChild(hint);
  }

  // Filter-Sektion
  if (activeLotNumber && lots[activeLotNumber]) {
    const filterSection = document.createElement("div");
    filterSection.style.marginBottom = "16px";
    filterSection.style.padding = "8px 12px";
    filterSection.style.backgroundColor = "var(--color-surface, #f9fafb)";
    filterSection.style.borderRadius = "6px";

    const filterTitle = document.createElement("div");
    filterTitle.textContent = "Filter";
    filterTitle.style.fontWeight = "500";
    filterTitle.style.marginBottom = "8px";
    filterSection.appendChild(filterTitle);

    // Checkbox: Kontrollierte ausblenden
    const hideControlled = document.createElement("label");
    hideControlled.style.display = "flex";
    hideControlled.style.alignItems = "center";
    hideControlled.style.gap = "6px";
    hideControlled.style.marginBottom = "4px";
    hideControlled.style.fontSize = "12px";
    hideControlled.style.cursor = "pointer";

    const hideCheckbox = document.createElement("input");
    hideCheckbox.type = "checkbox";
    hideCheckbox.checked = !ui.showControlledSheets;
    hideCheckbox.onchange = () => toggleSheetFilter();
    hideControlled.appendChild(hideCheckbox);
    hideControlled.appendChild(document.createTextNode("Kontrollierte ausblenden"));
    filterSection.appendChild(hideControlled);

    // Checkbox: Nur Maste ohne Standortpflege
    const onlyUnmaintained = document.createElement("label");
    onlyUnmaintained.style.display = "flex";
    onlyUnmaintained.style.alignItems = "center";
    onlyUnmaintained.style.gap = "6px";
    onlyUnmaintained.style.fontSize = "12px";
    onlyUnmaintained.style.cursor = "pointer";

    const mastCheckbox = document.createElement("input");
    mastCheckbox.type = "checkbox";
    mastCheckbox.checked = ui.showMaststandortpflegeOnly;
    mastCheckbox.onchange = () => toggleMastFilter();
    onlyUnmaintained.appendChild(mastCheckbox);
    onlyUnmaintained.appendChild(document.createTextNode("Nur Maste ohne Standortpflege"));
    filterSection.appendChild(onlyUnmaintained);

    wrapper.appendChild(filterSection);
  }

  // Status: Geladene Lose
  const lotSection = document.createElement("div");
  lotSection.style.marginBottom = "16px";

  const lotLabel = document.createElement("div");
  lotLabel.textContent = `Geladene Lose: ${Object.keys(lots).length}`;
  lotLabel.style.fontWeight = "500";
  lotLabel.style.marginBottom = "4px";
  lotSection.appendChild(lotLabel);

  if (activeLotNumber && lots[activeLotNumber]) {
    const lot = lots[activeLotNumber];
    const lotInfo = document.createElement("div");
    lotInfo.textContent = `Aktiv: ${lot.label}  (${lot.sheets.length} Blätter · ${lot.masts.length} Maste)`;
    lotInfo.style.color = "var(--color-text-muted, #6b7280)";
    lotInfo.style.fontSize = "12px";
    lotSection.appendChild(lotInfo);
  }
  wrapper.appendChild(lotSection);

  // Blattschnitt-Liste
  const sheetSection = document.createElement("div");
  sheetSection.style.marginBottom = "16px";

  const sheetHeader = document.createElement("div");
  sheetHeader.style.display = "flex";
  sheetHeader.style.justifyContent = "space-between";
  sheetHeader.style.alignItems = "center";
  sheetHeader.style.marginBottom = "8px";

  const sheetLabel = document.createElement("div");
  const totalSheets = Object.keys(sheetStatus).length;
  const controlled = Object.values(sheetStatus).filter((s) => s === "kontrolliert" || s === "abgenommen").length;
  sheetLabel.textContent = `Blattschnitte: ${controlled}/${totalSheets}`;
  sheetLabel.style.fontWeight = "500";
  sheetHeader.appendChild(sheetLabel);

  // Batch-Button
  const batchBtn = document.createElement("button");
  batchBtn.textContent = "Alle auf kontrolliert";
  batchBtn.style.fontSize = "11px";
  batchBtn.style.padding = "3px 8px";
  batchBtn.style.borderRadius = "4px";
  batchBtn.style.border = "1px solid var(--color-border, #d1d5db)";
  batchBtn.style.backgroundColor = "transparent";
  batchBtn.style.cursor = "pointer";
  batchBtn.onclick = () => batchSetStatus("kontrolliert");
  sheetHeader.appendChild(batchBtn);

  sheetSection.appendChild(sheetHeader);

  if (activeLotNumber && lots[activeLotNumber]) {
    const sheetList = document.createElement("div");
    sheetList.style.maxHeight = "250px";
    sheetList.style.overflowY = "auto";
    sheetList.style.fontSize = "12px";
    sheetList.style.border = "1px solid var(--color-border, #e5e7eb)";
    sheetList.style.borderRadius = "4px";

    for (const s of lots[activeLotNumber].sheets) {
      const row = document.createElement("div");
      const currentStatus = sheetStatus[s.sheetId] ?? "offen";
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.padding = "5px 8px";
      row.style.borderBottom = "1px solid var(--color-border, #e5e7eb)";
      row.style.backgroundColor = currentStatus === "kontrolliert" || currentStatus === "abgenommen"
        ? "rgba(16, 185, 129, 0.05)" : "transparent";

      // Status-Dot + Name
      const nameWrapper = document.createElement("div");
      nameWrapper.style.display = "flex";
      nameWrapper.style.alignItems = "center";
      nameWrapper.style.gap = "6px";
      nameWrapper.style.flex = "1";
      nameWrapper.style.overflow = "hidden";

      const dot = document.createElement("span");
      dot.style.display = "inline-block";
      dot.style.width = "8px";
      dot.style.height = "8px";
      dot.style.borderRadius = "50%";
      dot.style.backgroundColor = statusColor(currentStatus);
      dot.style.flexShrink = "0";
      nameWrapper.appendChild(dot);

      const name = document.createElement("span");
      name.textContent = s.pdfFileName;
      name.style.overflow = "hidden";
      name.style.textOverflow = "ellipsis";
      name.style.whiteSpace = "nowrap";
      nameWrapper.appendChild(name);
      row.appendChild(nameWrapper);

      // Status-Dropdown
      const statusSelect = document.createElement("select");
      statusSelect.style.fontSize = "11px";
      statusSelect.style.padding = "2px 4px";
      statusSelect.style.borderRadius = "4px";
      statusSelect.style.border = "1px solid var(--color-border, #d1d5db)";
      statusSelect.style.flexShrink = "0";

      const statuses: OetmSheetStatus[] = ["offen", "in-arbeit", "kontrolliert", "abgenommen"];
      for (const st of statuses) {
        const opt = document.createElement("option");
        opt.value = st;
        opt.textContent = st;
        if (st === currentStatus) opt.selected = true;
        statusSelect.appendChild(opt);
      }
      statusSelect.onchange = () => setSheetStatus(s.sheetId, statusSelect.value as OetmSheetStatus);
      row.appendChild(statusSelect);

      sheetList.appendChild(row);
    }
    sheetSection.appendChild(sheetList);
  }
  wrapper.appendChild(sheetSection);

  // Maste-Info
  const mastSection = document.createElement("div");
  mastSection.style.marginBottom = "16px";

  if (activeLotNumber && lots[activeLotNumber]) {
    const totalMasts = lots[activeLotNumber].masts.length;
    const pflegeMasts = lots[activeLotNumber].masts.filter((m) => m.maststandortpflege).length;
    const mastLabel = document.createElement("div");
    mastLabel.textContent = `Maste: ${pflegeMasts}/${totalMasts} mit Standortpflege`;
    mastLabel.style.fontWeight = "500";
    mastSection.appendChild(mastLabel);

    const portalMasts = lots[activeLotNumber].masts.filter((m) => m.isPortal).length;
    if (portalMasts > 0) {
      const portalInfo = document.createElement("div");
      portalInfo.textContent = `davon ${portalMasts} Portalmasten (größere Symbole)`;
      portalInfo.style.fontSize = "12px";
      portalInfo.style.color = "var(--color-text-muted, #6b7280)";
      mastSection.appendChild(portalInfo);
    }
  }
  wrapper.appendChild(mastSection);

  // Maßnahmen (inkl. Zeichenwerkzeuge)
  if (activeLotNumber && lots[activeLotNumber]) {
    buildMeasureSection(wrapper);
  } else {
    const measureSection = document.createElement("div");
    measureSection.style.marginBottom = "16px";
    const measureLabel = document.createElement("div");
    measureLabel.textContent = `Maßnahmen: ${measures.length}`;
    measureLabel.style.fontWeight = "500";
    measureSection.appendChild(measureLabel);
    wrapper.appendChild(measureSection);
  }

  container.appendChild(wrapper);
}

function renderWorkbench(container: HTMLElement): () => void {
  container.innerHTML = "";
  container.id = "oetm-panel-content";
  buildWorkbenchDOM(container);
  return () => {};
}

// ── Toolbar-Menu ─────────────────────────────────────────────────────────────

function buildToolbarMenu(): GeoLibreToolbarMenu {
  return {
    id: MENU_ID,
    label: "ÖTM",
    items: [
      {
        id: "load-lot",
        label: "Los laden",
        onSelect: () => handleLoadLot(),
      },
      {
        id: "status-overview",
        label: "Statusübersicht",
        onSelect: () => appRef?.openRightPanel?.(PANEL_ID),
      },
      {
        id: "toggle-masts",
        label: "Masten-Filter",
        onSelect: () => toggleMastFilter(),
      },
      { type: "separator" as const },
      {
        id: "import-pdf",
        label: "Maßnahmen aus PDF importieren",
        onSelect: () => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".pdf";
          input.style.display = "none";
          document.body.appendChild(input);
          input.addEventListener("change", async () => {
            const file = input.files?.[0];
            if (!file) return;
            document.body.removeChild(input);
            const imported = await importMeasuresFromPdf(file);
            if (imported > 0) {
              reRenderWorkbench();
              alert(`${imported} Maßnahmen aus PDF importiert`);
            }
          });
          input.click();
        },
      },
      {
        id: "export",
        label: "Export",
        onSelect: () => console.log("[ÖTM] Export angefordert"),
      },
    ],
  };
}

// ── Plugin-Definition ────────────────────────────────────────────────────────

export const maplibreOetmPlugin: GeoLibrePlugin = {
  id: OETM_PLUGIN_ID,
  name: "ÖTM-Aufnahme",
  version: "0.2.0",
  activeByDefault: false,

  activate(app: GeoLibreAppAPI) {
    appRef = app;
    unregisterMenu = app.registerToolbarMenu?.(buildToolbarMenu()) ?? null;
    unregisterPanel =
      app.registerRightPanel?.({
        id: PANEL_ID,
        title: "ÖTM-Workbench",
        dock: "replace-style",
        defaultWidth: 380,
        render: (container) => renderWorkbench(container),
      }) ?? null;
    app.openRightPanel?.(PANEL_ID);
  },

  deactivate(app: GeoLibreAppAPI) {
    app.closeRightPanel?.(PANEL_ID);
    unregisterPanel?.();
    unregisterPanel = null;
    unregisterMenu?.();
    unregisterMenu = null;
    appRef = null;
  },

  getProjectState: (): OetmPluginState | undefined => {
    if (Object.keys(lots).length === 0 && Object.keys(sheetStatus).length === 0 && measures.length === 0) {
      return undefined;
    }
    return buildPluginState();
  },

  applyProjectState: (app: GeoLibreAppAPI, state: unknown): boolean => {
    restorePluginState(state);
    if (Object.keys(lots).length > 0 || Object.keys(sheetStatus).length > 0) {
      app.openRightPanel?.(PANEL_ID);
      return true;
    }
    return false;
  },
};
