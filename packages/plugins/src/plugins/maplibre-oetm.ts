/**
 * ÖTM-Aufnahme-Plugin
 * ===================
 * GeoLibre-Plugin für das Ökologische Trassenmanagement (ÖTM).
 *
 * Registriert ein Toolbar-Menü "ÖTM" und ein Right-Panel "ÖTM-Workbench"
 * als primäre Arbeitsfläche. Verwaltet Los-Ladeprozess, Blattschnitt-Status,
 * Mast-Visualisierung und Maßnahmen-Export.
 *
 * IMPLEMENTATION_PLAN-Referenz: Phasen 0.1 + 1.1–1.4
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

// ── Plugin-Identität ─────────────────────────────────────────────────────────

export const OETM_PLUGIN_ID = "oetm-workflow";
const PANEL_ID = "oetm-workbench";
const MENU_ID = "oetm-menu";
const SHEET_LAYER_ID_PREFIX = "oetm-sheets-";
const MAST_LAYER_ID_PREFIX = "oetm-masts-";

// ── Plugin-State ─────────────────────────────────────────────────────────────

let lots: Record<string, OetmLot> = {};
let sheetStatus: Record<string, OetmSheetStatus> = {};
let maststandortpflegeStatus: Record<string, boolean> = {};
let measures: OetmMeasure[] = [];
let activeLotNumber: string | null = null;
let ui = {
  showControlledSheets: true,
  showMaststandortpflegeOnly: false,
};
let activeLayerIds: string[] = [];

// ── Registrierungs-Cleanup-Referenzen ────────────────────────────────────────

let unregisterPanel: (() => void) | null = null;
let unregisterMenu: (() => void) | null = null;
let appRef: GeoLibreAppAPI | null = null;

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

// ── Layer-Management ─────────────────────────────────────────────────────────

function ensureLayerPrefix(prefix: string, lotNumber: string): string {
  return `${prefix}${lotNumber}`;
}

function removeOldLayers() {
  for (const id of activeLayerIds) {
    // GeoLibre doesn't expose removeGeoJsonLayer directly, but
    // registerExternalNativeLayer with empty data can clear it.
    // For now we rely on the layer being replaced by the next addGeoJsonLayer call.
  }
  activeLayerIds = [];
}

function createSheetLayer(lot: OetmLot) {
  const app = appRef;
  if (!app || lot.sheets.length === 0) return;

  // Erzeuge GeoJSON-Polygone aus Blattschnitt-BBOX
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (const sheet of lot.sheets) {
    if (!sheet.bbox) continue;
    const [w, s, e, n] = sheet.bbox;
    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [w, s], [e, s], [e, n], [w, n], [w, s],
        ]],
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

  const layerId = app.addGeoJsonLayer(
    `ÖTM-Blattschnitte ${lot.label}`,
    fc,
  );
  activeLayerIds.push(layerId);
}

function createMastLayer(lot: OetmLot) {
  const app = appRef;
  if (!app || lot.masts.length === 0) return;

  const fc = mastsToGeoJson(lot.masts);

  const layerId = app.addGeoJsonLayer(
    `ÖTM-Strommasten ${lot.label}`,
    fc,
  );
  activeLayerIds.push(layerId);
}

function fitMapToLot(lot: OetmLot) {
  const app = appRef;
  if (!app) return;

  // Berechne Gesamt-BBOX über alle Maste
  const allCoords = lot.masts.map((m) => m.coordinates).filter((c) => c[0] !== 0 && c[1] !== 0);
  if (allCoords.length === 0) return;

  const lngs = allCoords.map((c) => c[0]);
  const lats = allCoords.map((c) => c[1]);
  const bounds: [number, number, number, number] = [
    Math.min(...lngs), Math.min(...lats),
    Math.max(...lngs), Math.max(...lats),
  ];

  // Etwas Padding
  const padLng = (bounds[2] - bounds[0]) * 0.1 || 0.01;
  const padLat = (bounds[3] - bounds[1]) * 0.1 || 0.01;
  bounds[0] -= padLng;
  bounds[1] -= padLat;
  bounds[2] += padLng;
  bounds[3] += padLat;

  app.fitBounds?.(bounds);
}

function ensureLotLayers(lot: OetmLot) {
  removeOldLayers();
  createSheetLayer(lot);
  createMastLayer(lot);
  fitMapToLot(lot);
}

// ── Los-Lade-Flow ────────────────────────────────────────────────────────────

async function handleLoadLot() {
  const app = appRef;
  if (!app) return;

  // Erstelle versteckte File-Inputs für den Datei-Dialog
  // (funktioniert in Web und Tauri gleichermaßen)
  const pickFile = (accept: string): Promise<File | null> => {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.style.display = "none";
      document.body.appendChild(input);
      input.addEventListener("change", () => {
        const file = input.files?.[0] ?? null;
        document.body.removeChild(input);
        resolve(file);
      });
      input.addEventListener("cancel", () => {
        document.body.removeChild(input);
        resolve(null);
      });
      input.click();
    });
  };

  try {
    // Schritt 1: Mengengerüst-Excel
    const mengengeruestFile = await pickFile(".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    if (!mengengeruestFile) return;

    const mengengeruestData = await readFileAsArrayBuffer(mengengeruestFile);
    console.log("[ÖTM] Mengengerüst geladen:", mengengeruestFile.name);

    // Schritt 2: Lot-Nummer + Name aus Dateinamen extrahieren
    // Erwartetes Format: "Mengengerüst_2006_Köln.xlsx" oder "Mengengeruest_2006_Köln.xlsx"
    const fileNameMatch = mengengeruestFile.name.match(/Mengengerüst_(\d{4})_(.+)\.xlsx/i);
    let lotNumber = fileNameMatch ? fileNameMatch[1] : "";
    let lotName = fileNameMatch ? fileNameMatch[2] : "";

    // Wenn Regex nicht matched, nach Los-Info fragen (TODO: UI-Dialog)
    if (!lotNumber) {
      alert("Bitte Los-Nummer und -Namen aus dem Dateinamen ableiten: " + mengengeruestFile.name);
      return;
    }

    // Schritt 3: Log-Datei
    const logFile = await pickFile(".log,.txt");
    let logText: string | null = null;
    if (logFile) {
      logText = await readFileAsText(logFile);
      console.log("[ÖTM] Log geladen:", logFile.name);
    }

    // Schritt 4: PDF-Dateien (Pläne-Ordner)
    const pdfFiles = await pickFiles(".pdf,application/pdf");
    let pdfFileNames: string[] = [];
    if (pdfFiles) {
      pdfFileNames = Array.from(pdfFiles).map((f) => f.name).filter((n) => /^ÖTM-/i.test(n));
      console.log("[ÖTM] PDFs gefunden:", pdfFileNames.length);
    }

    // Schritt 5: Los laden
    const lot = loadLot(
      lotNumber,
      lotName,
      "2026-27",
      "westnetz",
      mengengeruestData,
      logText,
      pdfFileNames,
    );

    // Schritt 6: Speichere Los im Plugin-State
    lots[lot.lotNumber] = lot;
    activeLotNumber = lot.lotNumber;

    // Initialisiere Blattschnitt-Status
    for (const sheet of lot.sheets) {
      if (!(sheet.sheetId in sheetStatus)) {
        sheetStatus[sheet.sheetId] = "offen";
      }
    }

    // Schritt 7: Kartenlayer erzeugen
    ensureLotLayers(lot);

    // Schritt 8: Panel neu rendern
    reRenderWorkbench();

    console.log(`[ÖTM] Los ${lot.label} geladen: ${lot.sheets.length} Blattschnitte, ${lot.masts.length} Maste`);

  } catch (err) {
    console.error("[ÖTM] Fehler beim Los laden:", err);
    alert("Fehler beim Laden des Loses: " + (err as Error).message);
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
  reRenderWorkbench();
}

function getLotSheets(): { sheetId: string; pdfFileName: string; status: OetmSheetStatus; mastCount: number }[] {
  if (!activeLotNumber || !lots[activeLotNumber]) return [];
  return lots[activeLotNumber].sheets.map((s) => ({
    sheetId: s.sheetId,
    pdfFileName: s.pdfFileName,
    status: sheetStatus[s.sheetId] ?? "offen",
    mastCount: s.mastCount,
  }));
}

// ── Panel-Rendering ──────────────────────────────────────────────────────────

function reRenderWorkbench() {
  // Da render nur einmal aufgerufen wird, parsen wir neu.
  // Der Container bleibt gemountet — wir updaten den DOM direkt.
  // TODO: saubereres Re-Rendering via Event-Bus

  // Since we can't easily re-trigger render, we find the container by id.
  const containerId = `oetm-panel-content`;
  const existing = document.getElementById(containerId);
  if (existing) {
    existing.innerHTML = "";
    buildWorkbenchDOM(existing);
  }
}

// Globaler Container-Ref für DOM-Updates
let workbenchContainer: HTMLElement | null = null;

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

  // Los laden Button
  const loadSection = document.createElement("div");
  loadSection.style.marginBottom = "16px";

  const loadBtn = document.createElement("button");
  loadBtn.textContent = "Los laden";
  loadBtn.style.padding = "8px 16px";
  loadBtn.style.backgroundColor = "var(--color-primary, #2563eb)";
  loadBtn.style.color = "#fff";
  loadBtn.style.border = "none";
  loadBtn.style.borderRadius = "6px";
  loadBtn.style.cursor = "pointer";
  loadBtn.style.fontSize = "14px";
  loadBtn.style.width = "100%";
  loadBtn.onclick = () => handleLoadLot();
  loadSection.appendChild(loadBtn);

  wrapper.appendChild(loadSection);

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
    lotInfo.textContent = `Aktiv: ${lot.label} (${lot.sheets.length} Blattschnitte, ${lot.masts.length} Maste)`;
    lotInfo.style.color = "var(--color-text-muted, #6b7280)";
    lotSection.appendChild(lotInfo);
  }

  wrapper.appendChild(lotSection);

  // Status: Blattschnitte
  const sheetSection = document.createElement("div");
  sheetSection.style.marginBottom = "16px";

  const sheetLabel = document.createElement("div");
  const totalSheets = Object.keys(sheetStatus).length;
  const controlled = Object.values(sheetStatus).filter((s) => s === "kontrolliert" || s === "abgenommen").length;
  sheetLabel.textContent = `Blattschnitte: ${controlled}/${totalSheets} kontrolliert`;
  sheetLabel.style.fontWeight = "500";
  sheetLabel.style.marginBottom = "8px";
  sheetSection.appendChild(sheetLabel);

  // Blattschnitt-Liste (scrollbar)
  if (activeLotNumber && lots[activeLotNumber]) {
    const sheetList = document.createElement("div");
    sheetList.style.maxHeight = "200px";
    sheetList.style.overflowY = "auto";
    sheetList.style.fontSize = "12px";

    for (const s of lots[activeLotNumber].sheets) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.padding = "4px 0";
      row.style.borderBottom = "1px solid var(--color-border, #e5e7eb)";

      const name = document.createElement("span");
      name.textContent = s.pdfFileName;
      name.style.flex = "1";
      name.style.overflow = "hidden";
      name.style.textOverflow = "ellipsis";
      name.style.whiteSpace = "nowrap";
      row.appendChild(name);

      const statusSelect = document.createElement("select");
      const statuses: OetmSheetStatus[] = ["offen", "in-arbeit", "kontrolliert", "abgenommen"];
      for (const st of statuses) {
        const opt = document.createElement("option");
        opt.value = st;
        opt.textContent = st;
        if (st === (sheetStatus[s.sheetId] ?? "offen")) opt.selected = true;
        statusSelect.appendChild(opt);
      }
      statusSelect.style.fontSize = "11px";
      statusSelect.style.padding = "2px 4px";
      statusSelect.style.borderRadius = "4px";
      statusSelect.style.border = "1px solid var(--color-border, #d1d5db)";
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
  }

  wrapper.appendChild(mastSection);

  // Status: Maßnahmen
  const measureSection = document.createElement("div");
  measureSection.style.marginBottom = "16px";

  const measureLabel = document.createElement("div");
  measureLabel.textContent = `Erfasste Maßnahmen: ${measures.length}`;
  measureLabel.style.fontWeight = "500";
  measureSection.appendChild(measureLabel);

  wrapper.appendChild(measureSection);

  container.appendChild(wrapper);
}

// ── Panel-Rendering (Einstieg) ────────────────────────────────────────────────

function renderWorkbench(container: HTMLElement): () => void {
  container.innerHTML = "";
  container.id = "oetm-panel-content";
  workbenchContainer = container;
  buildWorkbenchDOM(container);

  return () => {
    workbenchContainer = null;
  };
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
        onSelect: () => {
          handleLoadLot();
        },
      },
      {
        id: "status-overview",
        label: "Statusübersicht",
        onSelect: () => {
          appRef?.openRightPanel?.(PANEL_ID);
        },
      },
      {
        id: "toggle-masts",
        label: "Masten einblenden",
        onSelect: () => {
          ui.showMaststandortpflegeOnly = !ui.showMaststandortpflegeOnly;
          console.log("[ÖTM] showMaststandortpflegeOnly =", ui.showMaststandortpflegeOnly);
        },
      },
      { type: "separator" as const },
      {
        id: "export",
        label: "Export",
        onSelect: () => {
          console.log("[ÖTM] Export angefordert");
        },
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
        onOpen: () => {
          console.log("[ÖTM] Workbench geöffnet");
        },
        onClose: () => {
          console.log("[ÖTM] Workbench geschlossen");
        },
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
