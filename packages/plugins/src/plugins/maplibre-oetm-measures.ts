/**
 * ÖTM-Maßnahmen — Zeichenwerkzeuge & Formular
 * ============================================
 * Zeichenmodus, Maßnahmen-Formular und PDF-Import.
 *
 * IMPLEMENTATION_PLAN-Referenz: Phase 2
 */
import type { Map as MapLibreMap, GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import type { GeoLibreAppAPI } from "../types";
import type { OetmMeasure, OetmMeasureType, OetmSheet } from "../oetm-types";

// ═════════════════════════════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════════════════════════════
// State
// ═════════════════════════════════════════════════════════════════════════════
// State
// ═════════════════════════════════════════════════════════════════════════════

let measures: OetmMeasure[] = [];
let measureLayerId: string | null = null;
let isDrawing = false;
let drawPoints: [number, number][] = [];
let drawType: "Polygon" | "LineString" | "Point" = "Polygon";
let appRef: GeoLibreAppAPI | null = null;
let activeLotNumber: string | null = null;
let activeSheets: OetmSheet[] = [];

// Callback to notify main plugin when measures change
let onMeasuresChanged: (() => void) | null = null;

// ═════════════════════════════════════════════════════════════════════════════
// Public API
// ═════════════════════════════════════════════════════════════════════════════

export function initMeasuresModule(
  app: GeoLibreAppAPI,
  getLotNumber: () => string | null,
  getSheets: () => OetmSheet[],
  onChange: () => void,
) {
  appRef = app;
  activeLotNumber = getLotNumber();
  activeSheets = getSheets();
  onMeasuresChanged = onChange;
}

export function setMeasuresContext(lotNumber: string | null, sheets: OetmSheet[]) {
  activeLotNumber = lotNumber;
  activeSheets = sheets;
}

export function getMeasures(): OetmMeasure[] {
  return measures;
}

export function setMeasures(data: OetmMeasure[]) {
  measures = data;
  syncMeasureLayer();
}

export function addMeasure(measure: OetmMeasure) {
  measures = [...measures, measure];
  syncMeasureLayer();
  onMeasuresChanged?.();
}

function uuid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Layer
// ═════════════════════════════════════════════════════════════════════════════

function syncMeasureLayer() {
  const app = appRef;
  if (!app) return;

  const fc: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: measures
      .filter((m) => m.geometry)
      .map((m) => ({
        type: "Feature",
        geometry: m.geometry!,
        properties: {
          id: m.id,
          measureType: m.measureType,
          beschreibung: m.beschreibung,
          groesseQm: m.groesseQm,
          sheetId: m.sheetId,
          color: measureTypeColor(m.measureType),
        },
      })),
  };

  if (measureLayerId) {
    // Update existierenden Layer via MapLibre Source
    const map = app.getMap?.();
    if (map) {
      const source = map.getSource(`source-${measureLayerId}`) as GeoJSONSource | undefined;
      if (source) {
        source.setData(fc);
        return;
      }
    }
  }

  // Neuen Layer anlegen
  measureLayerId = app.addGeoJsonLayer("ÖTM-Maßnahmen", fc);

  // Styling
  const map = app.getMap?.();
  if (map) {
    setTimeout(() => applyMeasureStyling(map, measureLayerId!), 50);
  }
}

function measureTypeColor(type: OetmMeasureType): string {
  switch (type) {
    case "flaeche": return "#8B5CF6";
    case "linie": return "#F59E0B";
    case "stueck": return "#EC4899";
  }
}

function applyMeasureStyling(map: MapLibreMap, layerId: string) {
  const fillId = `layer-${layerId}-fill`;
  if (map.getLayer(fillId)) {
    map.setPaintProperty(fillId, "fill-color", ["get", "color"]);
    map.setPaintProperty(fillId, "fill-opacity", 0.4);
    map.setPaintProperty(fillId, "fill-outline-color", ["get", "color"]);
  }

  const lineId = `layer-${layerId}-line`;
  if (map.getLayer(lineId)) {
    map.setPaintProperty(lineId, "line-color", ["get", "color"]);
    map.setPaintProperty(lineId, "line-width", 2);
  }

  const circleId = `layer-${layerId}-circle`;
  if (map.getLayer(circleId)) {
    map.setPaintProperty(circleId, "circle-color", ["get", "color"]);
    map.setPaintProperty(circleId, "circle-radius", 6);
    map.setPaintProperty(circleId, "circle-stroke-color", "#fff");
    map.setPaintProperty(circleId, "circle-stroke-width", 2);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Drawing
// ═════════════════════════════════════════════════════════════════════════════

export function startDrawing(type: "Polygon" | "LineString" | "Point"): boolean {
  const app = appRef;
  const map = app?.getMap?.();
  if (!map) return false;

  isDrawing = true;
  drawType = type;
  drawPoints = [];

  map.getCanvas().style.cursor = "crosshair";

  // Drawing-Feedback: Marker für gesetzte Punkte
  if (type === "Point") {
    // Punkt-Modus: Ein Klick genügt
    const onClick = (e: MapMouseEvent) => {
      if (!isDrawing) return;
      drawPoints = [[e.lngLat.lng, e.lngLat.lat]];
      finishDrawing();
      map.off("click", onClick);
    };
    map.once("click", onClick);
    return true;
  }

  // Linien/Polygon-Modus: Klicks sammeln, Doppelklick beendet
  const onClick = (e: MapMouseEvent) => {
    if (!isDrawing) return;
    drawPoints.push([e.lngLat.lng, e.lngLat.lat]);
    updateDrawingPreview(map);
  };

  const onDblClick = () => {
    if (!isDrawing) return;
    finishDrawing();
  };

  map.on("click", onClick);
  map.once("dblclick", onDblClick);

  return true;
}

export function cancelDrawing() {
  isDrawing = false;
  drawPoints = [];
  const map = appRef?.getMap?.();
  if (map) {
    map.getCanvas().style.cursor = "";
    removeDrawingPreview(map);
  }
}

function finishDrawing() {
  isDrawing = false;
  const map = appRef?.getMap?.();
  if (map) {
    map.getCanvas().style.cursor = "";
    removeDrawingPreview(map);
  }

  let geometry: GeoJSON.Geometry | null = null;
  let measureType: OetmMeasureType;

  switch (drawType) {
    case "Point":
      if (drawPoints.length === 0) return;
      geometry = { type: "Point", coordinates: drawPoints[0] };
      measureType = "stueck";
      break;
    case "LineString":
      if (drawPoints.length < 2) return;
      geometry = { type: "LineString", coordinates: drawPoints };
      measureType = "linie";
      break;
    case "Polygon":
      if (drawPoints.length < 3) return;
      geometry = { type: "Polygon", coordinates: [drawPoints] };
      measureType = "flaeche";
      break;
    default:
      return;
  }

  // Automatisch Sheet zuordnen via spatial intersection
  const sheetId = findSheetForGeometry(geometry);

  // Fläche berechnen (vereinfacht)
  let area = 0;
  if (measureType === "flaeche" && geometry?.type === "Polygon") {
    area = approximateArea(geometry.coordinates[0] as [number, number][]);
  }

  const now = new Date().toISOString();
  const measure: OetmMeasure = {
    id: uuid(),
    measureType,
    geometry,
    oetmPlanNr: activeLotNumber ?? "",
    pflegeeinheitenNummern: "",
    bl: "",
    vonMast: "",
    bisMast: "",
    beschreibung: "",
    schutzstreifenerweiterung: "",
    eigentuemer: "",
    schaltungBenoetigt: "",
    laengeM: 0,
    breiteM: 0,
    groesseQm: area,
    einzelentnahmeSt: 0,
    kronenrueckschnittSt: 0,
    durchforstenProzent: 0,
    durchforstenQm: 0,
    entbuschenProzent: 0,
    entbuschenQm: 0,
    aufDenStockSetzenProzent: 0,
    aufDenStockSetzenQm: 0,
    mulchenProzent: 0,
    mulchenQm: 0,
    maehenProzent: 0,
    maehenQm: 0,
    maststandortpflegeProzent: 0,
    maststandortpflegeQm: 0,
    massnahmeDatum: "",
    sheetId,
    createdAt: now,
    updatedAt: now,
  };

  measures.push(measure);
  syncMeasureLayer();
  onMeasuresChanged?.();
  showMeasureForm(measure);
}

function findSheetForGeometry(geometry: GeoJSON.Geometry): string {
  // Bestimme Prüfpunkt: bei Point der Punkt selbst, bei Polygon der erste Ring-Punkt, bei LineString der Mittelpunkt
  let testPoint: [number, number] | null = null;

  if (geometry.type === "Point") {
    testPoint = geometry.coordinates as [number, number];
  } else if (geometry.type === "Polygon" && geometry.coordinates[0].length > 0) {
    // Erster Punkt des äußeren Rings (einfach, aber ausreichend)
    testPoint = geometry.coordinates[0][0] as [number, number];
  } else if (geometry.type === "LineString" && geometry.coordinates.length > 0) {
    // Mittelpunkt der Linie
    const mid = Math.floor(geometry.coordinates.length / 2);
    testPoint = geometry.coordinates[mid] as [number, number];
  }

  if (!testPoint) return "";

  const [lng, lat] = testPoint;
  for (const s of activeSheets) {
    if (!s.bbox) continue;
    const [w, south, e, n] = s.bbox;
    if (lng >= w && lng <= e && lat >= south && lat <= n) {
      return s.sheetId;
    }
  }
  return "";
}

function approximateArea(coords: [number, number][]): number {
  // Grobe Flächenberechnung aus LatLng-Polygon
  if (coords.length < 3) return 0;
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[(i + 1) % n];
    area += (x1 * y2 - x2 * y1);
  }
  area = Math.abs(area) / 2;
  // Umrechnung Grad² → m² (vereinfacht: 1° ≈ 111320m in DE)
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const mPerDeg = 111_320;
  const mPerDegLng = mPerDeg * Math.cos(lat * Math.PI / 180);
  return Math.round(area * mPerDeg * mPerDegLng);
}

function updateDrawingPreview(map: MapLibreMap) {
  if (!appRef) return;
  const id = "oetm-drawing-preview";
  const source = map.getSource(id) as GeoJSONSource | undefined;
  if (drawPoints.length === 0) return;

  let geom: GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon;
  if (drawPoints.length === 1) {
    geom = { type: "Point", coordinates: drawPoints[0] };
  } else if (drawType === "Polygon") {
    geom = { type: "Polygon", coordinates: [drawPoints] };
  } else {
    geom = { type: "LineString", coordinates: drawPoints };
  }

  const fc: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: geom, properties: {} }],
  };

  if (source) {
    source.setData(fc);
  } else {
    map.addSource(id, { type: "geojson", data: fc });
    if (drawType === "Polygon") {
      map.addLayer({ id: `${id}-fill`, type: "fill", source: id, paint: { "fill-color": "#8B5CF6", "fill-opacity": 0.3 } });
      map.addLayer({ id: `${id}-line`, type: "line", source: id, paint: { "line-color": "#8B5CF6", "line-width": 2, "line-dasharray": [2, 2] } });
    } else if (drawType === "LineString") {
      map.addLayer({ id: `${id}-line`, type: "line", source: id, paint: { "line-color": "#F59E0B", "line-width": 2, "line-dasharray": [2, 2] } });
    } else {
      map.addLayer({ id: `${id}-circle`, type: "circle", source: id, paint: { "circle-color": "#EC4899", "circle-radius": 6 } });
    }
    // Vertex-Marker
    map.addLayer({ id: `${id}-vertex`, type: "circle", source: id, filter: ["==", "$type", "Point"], paint: { "circle-color": "#fff", "circle-radius": 4, "circle-stroke-color": "#8B5CF6", "circle-stroke-width": 2 } });
  }
}

function removeDrawingPreview(map: MapLibreMap) {
  const id = "oetm-drawing-preview";
  [`${id}-fill`, `${id}-line`, `${id}-circle`, `${id}-vertex`].forEach((l) => {
    if (map.getLayer(l)) map.removeLayer(l);
  });
  if (map.getSource(id)) map.removeSource(id);
}

// ═════════════════════════════════════════════════════════════════════════════
// Measure-Form-UI
// ═════════════════════════════════════════════════════════════════════════════

function showMeasureForm(measure: OetmMeasure) {
  // Floating-Panel für die Maßnahmen-Bearbeitung
  const panel = document.createElement("div");
  panel.id = "oetm-measure-form";
  panel.style.position = "fixed";
  panel.style.top = "16px";
  panel.style.left = "16px";
  panel.style.width = "360px";
  panel.style.maxHeight = "80vh";
  panel.style.overflowY = "auto";
  panel.style.backgroundColor = "var(--color-surface, #fff)";
  panel.style.border = "1px solid var(--color-border, #e5e7eb)";
  panel.style.borderRadius = "8px";
  panel.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
  panel.style.zIndex = "1000";
  panel.style.padding = "16px";
  panel.style.fontFamily = "system-ui, sans-serif";
  panel.style.fontSize = "13px";

  // Header
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.marginBottom = "12px";

  const hTitle = document.createElement("h4");
  const typeLabels: Record<OetmMeasureType, string> = {
    "flaeche": "Flächen-Maßnahme",
    "stueck": "Stück-Maßnahme",
    "linie": "Linien-Maßnahme",
  };
  hTitle.textContent = typeLabels[measure.measureType] ?? "Maßnahme";
  hTitle.style.margin = "0";
  hTitle.style.fontSize = "14px";
  hTitle.style.fontWeight = "600";
  header.appendChild(hTitle);

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.border = "none";
  closeBtn.style.backgroundColor = "transparent";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.fontSize = "16px";
  closeBtn.style.padding = "0 4px";
  closeBtn.onclick = () => panel.remove();
  header.appendChild(closeBtn);

  panel.appendChild(header);

  // Formular-Felder
  const fields = buildMeasureFormFields(measure);
  for (const f of fields) {
    panel.appendChild(f);
  }

  // Buttons
  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.gap = "8px";
  btnRow.style.marginTop = "12px";

  const saveBtn = createButton("Speichern", "#10B981");
  saveBtn.onclick = () => {
    saveMeasureFromForm(measure.id, panel);
    panel.remove();
  };
  btnRow.appendChild(saveBtn);

  const deleteBtn = createButton("Löschen", "#EF4444");
  deleteBtn.onclick = () => {
    deleteMeasure(measure.id);
    panel.remove();
  };
  btnRow.appendChild(deleteBtn);

  panel.appendChild(btnRow);

  document.body.appendChild(panel);
}

function createButton(text: string, color: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.style.padding = "6px 16px";
  btn.style.backgroundColor = color;
  btn.style.color = "#fff";
  btn.style.border = "none";
  btn.style.borderRadius = "4px";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "13px";
  btn.style.flex = "1";
  return btn;
}

function buildMeasureFormFields(measure: OetmMeasure): HTMLElement[] {
  const elements: HTMLElement[] = [];

  const addField = (label: string, value: string | number, onChange: (v: string) => void, type: "text" | "number" = "text") => {
    const group = document.createElement("div");
    group.style.marginBottom = "8px";

    const lbl = document.createElement("label");
    lbl.textContent = label;
    lbl.style.display = "block";
    lbl.style.fontSize = "11px";
    lbl.style.color = "#6b7280";
    lbl.style.marginBottom = "2px";
    group.appendChild(lbl);

    const input = document.createElement("input");
    input.type = type;
    input.value = String(value);
    input.style.width = "100%";
    input.style.padding = "6px 8px";
    input.style.border = "1px solid var(--color-border, #d1d5db)";
    input.style.borderRadius = "4px";
    input.style.fontSize = "13px";
    input.style.boxSizing = "border-box";
    input.onchange = () => onChange(input.value);
    group.appendChild(input);
    elements.push(group);
  };

  const addTextarea = (label: string, value: string, onChange: (v: string) => void) => {
    const group = document.createElement("div");
    group.style.marginBottom = "8px";

    const lbl = document.createElement("label");
    lbl.textContent = label;
    lbl.style.display = "block";
    lbl.style.fontSize = "11px";
    lbl.style.color = "#6b7280";
    lbl.style.marginBottom = "2px";
    group.appendChild(lbl);

    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.width = "100%";
    ta.style.padding = "6px 8px";
    ta.style.border = "1px solid var(--color-border, #d1d5db)";
    ta.style.borderRadius = "4px";
    ta.style.fontSize = "13px";
    ta.style.boxSizing = "border-box";
    ta.style.minHeight = "60px";
    ta.style.resize = "vertical";
    ta.onchange = () => onChange(ta.value);
    group.appendChild(ta);
    elements.push(group);
  };

  addField("Von Mast", measure.vonMast, (v) => measure.vonMast = v);
  addField("Bis Mast", measure.bisMast, (v) => measure.bisMast = v);

  if (measure.measureType === "flaeche") {
    addField("Fläche (m²)", measure.groesseQm, (v) => measure.groesseQm = Number(v) || 0, "number");
    addField("Durchforsten %", measure.durchforstenProzent, (v) => measure.durchforstenProzent = Number(v) || 0, "number");
    addField("Durchforsten m²", measure.durchforstenQm, (v) => measure.durchforstenQm = Number(v) || 0, "number");
    addField("Entbuschen %", measure.entbuschenProzent, (v) => measure.entbuschenProzent = Number(v) || 0, "number");
    addField("Entbuschen m²", measure.entbuschenQm, (v) => measure.entbuschenQm = Number(v) || 0, "number");
    addField("Auf den Stock setzen %", measure.aufDenStockSetzenProzent, (v) => measure.aufDenStockSetzenProzent = Number(v) || 0, "number");
    addField("Auf den Stock setzen m²", measure.aufDenStockSetzenQm, (v) => measure.aufDenStockSetzenQm = Number(v) || 0, "number");
    addField("Mulchen %", measure.mulchenProzent, (v) => measure.mulchenProzent = Number(v) || 0, "number");
    addField("Mulchen m²", measure.mulchenQm, (v) => measure.mulchenQm = Number(v) || 0, "number");
    addField("Mähen %", measure.maehenProzent, (v) => measure.maehenProzent = Number(v) || 0, "number");
    addField("Mähen m²", measure.maehenQm, (v) => measure.maehenQm = Number(v) || 0, "number");
  }
  if (measure.measureType === "stueck") {
    addField("Einzelentnahme (St.)", measure.einzelentnahmeSt, (v) => measure.einzelentnahmeSt = Number(v) || 0, "number");
    addField("Kronenrückschnitt (St.)", measure.kronenrueckschnittSt, (v) => measure.kronenrueckschnittSt = Number(v) || 0, "number");
  }
  if (measure.measureType === "linie") {
    addField("Länge (m)", measure.laengeM, (v) => measure.laengeM = Number(v) || 0, "number");
    addField("Breite (m)", measure.breiteM, (v) => measure.breiteM = Number(v) || 0, "number");
  }

  addTextarea("Beschreibung", measure.beschreibung, (v) => measure.beschreibung = v);
  addField("Schutzstreifenerweiterung", measure.schutzstreifenerweiterung, (v) => measure.schutzstreifenerweiterung = v);
  addField("Eigentümer", measure.eigentuemer, (v) => measure.eigentuemer = v);
  addField("Schaltung benötigt?", measure.schaltungBenoetigt, (v) => measure.schaltungBenoetigt = v);
  addField("Maststandortpflege %", measure.maststandortpflegeProzent, (v) => measure.maststandortpflegeProzent = Number(v) || 0, "number");
  addField("Maststandortpflege m²", measure.maststandortpflegeQm, (v) => measure.maststandortpflegeQm = Number(v) || 0, "number");
  addField("Datum", measure.massnahmeDatum, (v) => measure.massnahmeDatum = v);

  return elements;
}

function saveMeasureFromForm(id: string, _panel: HTMLElement) {
  // Werte sind direkt auf dem measure-Objekt (onchange im Formular)
  // Wir müssen nur den Layer aktualisieren
  syncMeasureLayer();
  onMeasuresChanged?.();
}

function deleteMeasure(id: string) {
  measures = measures.filter((m) => m.id !== id);
  syncMeasureLayer();
  onMeasuresChanged?.();
}

// ═════════════════════════════════════════════════════════════════════════════
// PDF-Import (Sidecar)
// ═════════════════════════════════════════════════════════════════════════════

export async function importMeasuresFromPdf(file: File): Promise<number> {
  try {
    // Datei als base64 kodieren
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const pdfBase64 = btoa(binary);

    const resp = await fetch(`http://127.0.0.1:8765/oetm/sheet-detail-table-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdf_base64: pdfBase64 }),
    });
    if (!resp.ok) {
      console.error("[ÖTM] Sidecar-Fehler:", resp.status, await resp.text());
      return 0;
    }
    const rows: Array<{ typ?: string; nr?: string; flaeche_qm?: string; pflege?: string; aufarbeitungsform?: string }> = await resp.json();
    if (rows.length === 0) return 0;

    let imported = 0;
    for (const row of rows) {
      if (!row.typ && !row.nr) continue;

      const now = new Date().toISOString();
      const t = (row.typ ?? "").toLowerCase();
      const measureType: OetmMeasureType = t.includes("fl") ? "flaeche" : t.includes("li") ? "linie" : "stueck";
      const measure: OetmMeasure = {
        id: uuid(),
        measureType,
        geometry: null,
        oetmPlanNr: "",
        pflegeeinheitenNummern: row.nr ?? "",
        bl: "",
        vonMast: "",
        bisMast: "",
        beschreibung: row.aufarbeitungsform ?? "",
        schutzstreifenerweiterung: "",
        eigentuemer: "",
        schaltungBenoetigt: "",
        laengeM: 0,
        breiteM: 0,
        groesseQm: Number(row.flaeche_qm) || 0,
        einzelentnahmeSt: 0,
        kronenrueckschnittSt: 0,
        durchforstenProzent: 0,
        durchforstenQm: 0,
        entbuschenProzent: 0,
        entbuschenQm: 0,
        aufDenStockSetzenProzent: 0,
        aufDenStockSetzenQm: 0,
        mulchenProzent: 0,
        mulchenQm: 0,
        maehenProzent: 0,
        maehenQm: 0,
        maststandortpflegeProzent: 0,
        maststandortpflegeQm: 0,
        massnahmeDatum: "",
        sheetId: "",
        createdAt: now,
        updatedAt: now,
      };
      measures.push(measure);
      imported++;
    }

    syncMeasureLayer();
    onMeasuresChanged?.();
    return imported;
  } catch (err) {
    console.error("[ÖTM] Sidecar nicht erreichbar:", err);
    return 0;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// UI: Drawing-Buttons (zur Integration in das Right-Panel)
// ═════════════════════════════════════════════════════════════════════════════

export function buildMeasureSection(container: HTMLElement) {
  const section = document.createElement("div");
  section.style.marginBottom = "16px";

  const title = document.createElement("div");
  title.textContent = `Maßnahmen: ${measures.length}`;
  title.style.fontWeight = "500";
  title.style.marginBottom = "8px";
  section.appendChild(title);

  // Drawing-Buttons
  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.gap = "4px";
  btnRow.style.marginBottom = "8px";

  const drawBtn = (label: string, type: "Polygon" | "LineString" | "Point", color: string) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.padding = "4px 8px";
    btn.style.fontSize = "11px";
    btn.style.borderRadius = "4px";
    btn.style.border = "1px solid var(--color-border, #d1d5db)";
    btn.style.backgroundColor = isDrawing ? (drawType === type ? "#fef3c7" : "transparent") : "transparent";
    btn.style.cursor = "pointer";
    btn.style.flex = "1";
    btn.style.color = color;
    btn.onclick = () => {
      if (isDrawing && drawType === type) {
        cancelDrawing();
        btn.style.backgroundColor = "transparent";
      } else {
        startDrawing(type);
        btn.style.backgroundColor = "#fef3c7";
      }
    };
    btnRow.appendChild(btn);
  };

  drawBtn("▣ Fläche", "Polygon", "#8B5CF6");
  drawBtn("╱ Linie", "LineString", "#F59E0B");
  drawBtn("● Punkt", "Point", "#EC4899");

  section.appendChild(btnRow);

  // Abbrechen-Button (nur sichtbar im Zeichenmodus)
  const cancelRow = document.createElement("div");
  cancelRow.style.display = isDrawing ? "block" : "none";
  cancelRow.id = "oetm-cancel-drawing";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Zeichnen abbrechen (Esc)";
  cancelBtn.style.width = "100%";
  cancelBtn.style.padding = "4px 8px";
  cancelBtn.style.fontSize = "11px";
  cancelBtn.style.borderRadius = "4px";
  cancelBtn.style.border = "1px solid #EF4444";
  cancelBtn.style.color = "#EF4444";
  cancelBtn.style.backgroundColor = "transparent";
  cancelBtn.style.cursor = "pointer";
  cancelBtn.onclick = () => {
    cancelDrawing();
    section.innerHTML = "";
    buildMeasureSection(section);
  };
  cancelRow.appendChild(cancelBtn);
  section.appendChild(cancelRow);

  // Escape-Taste zum Abbrechen
  let escHandler: ((e: KeyboardEvent) => void) | null = null;
  const registerEscHandler = () => {
    if (escHandler) document.removeEventListener("keydown", escHandler);
    escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isDrawing) {
        cancelDrawing();
        section.innerHTML = "";
        buildMeasureSection(section);
      }
    };
    document.addEventListener("keydown", escHandler);
  };
  registerEscHandler();

  // Maßnahmen-Liste
  const measureList = document.createElement("div");
  measureList.style.maxHeight = "200px";
  measureList.style.overflowY = "auto";
  measureList.style.fontSize = "11px";

  for (const m of measures) {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.padding = "4px 6px";
    row.style.borderBottom = "1px solid var(--color-border, #e5e7eb)";
    row.style.cursor = "pointer";
    row.onclick = () => showMeasureForm(m);

    const typeDot = document.createElement("span");
    typeDot.style.display = "inline-block";
    typeDot.style.width = "8px";
    typeDot.style.height = "8px";
    typeDot.style.borderRadius = "50%";
    typeDot.style.backgroundColor = measureTypeColor(m.measureType);
    typeDot.style.marginRight = "6px";
    typeDot.style.flexShrink = "0";
    row.appendChild(typeDot);

    const name = document.createElement("span");
    name.textContent = m.beschreibung.slice(0, 30) || `ID: ${m.id.slice(0, 8)}`;
    name.style.flex = "1";
    name.style.overflow = "hidden";
    name.style.textOverflow = "ellipsis";
    name.style.whiteSpace = "nowrap";
    row.appendChild(name);

    const area = document.createElement("span");
    if (m.groesseQm > 0) area.textContent = `${m.groesseQm} m²`;
    else if (m.einzelentnahmeSt > 0) area.textContent = `${m.einzelentnahmeSt} St.`;
    area.style.color = "#6b7280";
    row.appendChild(area);

    measureList.appendChild(row);
  }

  section.appendChild(measureList);

  container.appendChild(section);
}
