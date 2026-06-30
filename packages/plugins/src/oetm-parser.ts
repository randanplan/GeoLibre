/**
 * ÖTM-Parser
 * ==========
 * Client-seitige Parser für Mengengerüst-Excel, Log-Dateien und
 * Auf-Abnahmeformular-Excel.
 *
 * IMPLEMENTATION_PLAN-Referenz: Phase 0.2, 0.3, 0.5
 */
import * as XLSX from "xlsx";
import type {
  OetmLot,
  OetmLotSource,
  OetmMast,
  OetmSheet,
  OetmSheetStatus,
} from "./oetm-types";

// ═════════════════════════════════════════════════════════════════════════════
// 0.2: Mengengerüst-Excel-Parser
// ═════════════════════════════════════════════════════════════════════════════

/** Rohzeile aus dem Mengengerüst-Sheet */
interface MengengeruestRow {
  /** Bauleitung (4-stellig) */
  BL: string;
  /** Leitungsname (z.B. "Brauweiler - Reisholz") */
  LName: string;
  /** Mast-Nummer (roh, z.B. "4", "30", "P2", "011A") */
  Mast: string | number;
  /** Länge in Metern */
  Länge_m: string | number;
  /** Leitbezirk/Team (z.B. "Lev", "Ne") */
  LeitBez_Team: string;
  /** Kreis (z.B. "Köln") */
  Kreis: string;
  /** ÖTM-Los-Bezeichnung (z.B. "2006 Köln") */
  ÖTM_Los: string;
  /** X-Koordinate (Gauss-Krüger / UTM?) */
  GEO_X: string | number;
  /** Y-Koordinate */
  GEO_Y: string | number;
}

/** Konstruiert eine Mast-ID aus BL + Mast-Nummer.
 *
 * Schemas:
 *   BL-Nummern sind 4-stellig (z.B. "0012").
 *   Mast-Nummern:
 *     - Numerisch (z.B. 4 → "0004", 30 → "0030")
 *     - Portalmast mit P-Präfix (z.B. "P002")
 *     - Mit Buchstaben-Suffix (z.B. "011A", "010B")
 *     - Buchstabe kann auch im Präfix sein (z.B. "A001")
 */
function buildMastId(bl: string, mastInput: string | number): string {
  const raw = String(mastInput).trim();
  const blStr = bl.padStart(4, "0").slice(0, 4);

  // Prüfe auf P-Präfix (Portalmast)
  const portalMatch = raw.match(/^P(\d+)$/i);
  if (portalMatch) {
    return blStr + "P" + portalMatch[1].padStart(3, "0");
  }

  // Prüfe auf Buchstaben-Präfix (z.B. "A001")
  const prefixLetter = raw.match(/^([A-Za-z])(\d+)$/);
  if (prefixLetter) {
    return blStr + prefixLetter[1].toUpperCase() + prefixLetter[2].padStart(3, "0");
  }

  // Numerischer Mast mit optionalem Suffix (z.B. "4", "30", "011A")
  const numericMatch = raw.match(/^(\d+)([A-Za-z])?$/);
  if (numericMatch) {
    const numPart = numericMatch[1].padStart(4, "0");
    const suffix = numericMatch[2] ? numericMatch[2].toUpperCase() : "";
    return blStr + numPart + suffix;
  }

  // Fallback: Originalwert bereinigt übernehmen
  return blStr + raw.replace(/[^A-Za-z0-9]/g, "");
}

/** Prüft auf Portalmast anhand der Mast-Nummer. */
function isPortalMast(mastInput: string | number): boolean {
  return /^P\d/i.test(String(mastInput).trim());
}

/** Prüft auf Koordinaten-Suffix (A/B/C an Mast-Nummer) */
function hasMastSuffix(mastInput: string | number): boolean {
  return /[A-Za-z]$/.test(String(mastInput).trim());
}

/** Extrahiert den Koordinaten-Lookup-Key (ohne Suffix) */
function mastKeyWithoutSuffix(mastInput: string | number): string {
  return String(mastInput).trim().replace(/[A-Za-z]$/, "");
}

/**
 * Parst ein Mengengerüst-Excel (.xlsx) und gibt eine Liste von Masten zurück.
 *
 * Erwartet das Sheet "2026-27" mit den Spalten:
 *   BL, LName, Mast, Länge_m, LeitBez_Team, Kreis, ÖTM_Los, GEO_X, GEO_Y
 *
 * @param data - ArrayBuffer der .xlsx-Datei
 * @param lotSource - Quelle des Loses (default: "westnetz")
 * @param lotName - Überschreibt den Los-Namen (optional, für Fremd-Lose)
 * @returns Array von OetmMast-Objekten
 */
export function parseMengengeruest(
  data: ArrayBuffer,
  lotSource: OetmLotSource = "westnetz",
  lotName?: string,
): OetmMast[] {
  const workbook = XLSX.read(data, { type: "array" });

  // Sheet "2026-27" suchen
  const sheetName = workbook.SheetNames.find(
    (n) => n === "2026-27" || n === "2026-27 " || n.startsWith("2026"),
  );
  if (!sheetName) {
    throw new Error(
      `Sheet "2026-27" not found. Available: ${workbook.SheetNames.join(", ")}`,
    );
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<MengengeruestRow>(sheet);

  if (rows.length === 0) {
    throw new Error("Mengengerüst sheet is empty");
  }

  const masts: OetmMast[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const bl = String(row.BL ?? "").trim();
    const mastRaw = row.Mast ?? "";
    const geoX = Number(row.GEO_X) || 0;
    const geoY = Number(row.GEO_Y) || 0;

    // Validiere Pflichtfelder
    if (!bl || !mastRaw) continue;
    if (geoX === 0 && geoY === 0) continue;

    const mastNumber = String(mastRaw).trim().padStart(4, "0");
    const mastId = buildMastId(bl, mastRaw);
    const lotLabel = lotName ?? String(row.ÖTM_Los ?? "").trim();

    // Duplikate vermeiden (gleiche Mast-ID)
    if (seen.has(mastId)) continue;
    seen.add(mastId);

    masts.push({
      mastId,
      bl,
      mastNumber,
      isPortal: isPortalMast(mastRaw),
      leitungName: String(row.LName ?? "").trim(),
      lotName: lotLabel,
      lotSource,
      kreis: String(row.Kreis ?? "").trim(),
      laengeM: Number(row.Länge_m) || 0,
      leitBezTeam: String(row.LeitBez_Team ?? "").trim(),
      coordinates: [geoX, geoY],
      maststandortpflege: false,
      sheetIds: [],
    });
  }

  return masts;
}

/**
 * Erzeugt aus einer Mast-Liste ein GeoJSON FeatureCollection<Point>.
 */
export function mastsToGeoJson(masts: OetmMast[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: masts.map((m) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: m.coordinates,
      },
      properties: {
        mastId: m.mastId,
        bl: m.bl,
        mastNumber: m.mastNumber,
        isPortal: m.isPortal,
        leitungName: m.leitungName,
        lotName: m.lotName,
        lotSource: m.lotSource,
        kreis: m.kreis,
        laengeM: m.laengeM,
        leitBezTeam: m.leitBezTeam,
        maststandortpflege: m.maststandortpflege,
        sheetIds: m.sheetIds,
      },
    })),
  };
}


// ═════════════════════════════════════════════════════════════════════════════
// 0.3: Log-Parser
// ═════════════════════════════════════════════════════════════════════════════

/** Geparste Blattschnitt-Metadaten aus dem Log-Header. */
interface LogHeader {
  /** Los-Bezeichnung aus Header (z.B. "2006 Köln") */
  lotLabel?: string;
  /** Anzahl Blattschnitte (laut Log) */
  sheetCount?: number;
  /** Anzahl Maste (laut Log) */
  mastCount?: number;
}

/** Ein einzelner Mast-mit-Blattschnitt-Eintrag aus dem Log. */
interface LogMastSheetEntry {
  /** BL-Nummer */
  bl: string;
  /** Mast-Nummer mit Suffix (z.B. "0004/0004" oder "0012/0030A") */
  mastRef: string;
  /** Blattschnitt-IDs (z.B. "2006-0010") */
  sheetIds: string[];
}

/**
 * Parst den Header einer ÖTM-Logdatei.
 *
 * Der Header enthält Metadaten zum Los. Format variiert, enthält typischerweise
 * die Anzahl Blattschnitte und Maste.
 */
function parseLogHeader(lines: string[]): LogHeader {
  const header: LogHeader = {};
  const text = lines.join("\n");

  // Los-Bezeichnung (erste relevante Zeile vor dem Mapping)
  const lotMatch = text.match(/Los\s*:?\s*(\d{4}\s+\S+)/i);
  if (lotMatch) header.lotLabel = lotMatch[1].trim();

  // Anzahl Blattschnitte
  const sheetMatch = text.match(/(\d+)\s*Blattschnitte?/i);
  if (sheetMatch) header.sheetCount = parseInt(sheetMatch[1], 10);

  // Anzahl Maste
  const mastMatch = text.match(/(\d+)\s*Maste?/i);
  if (mastMatch) header.mastCount = parseInt(mastMatch[1], 10);

  return header;
}

/**
 * Parst die Mast↔Blattschnitt-Mapping-Sektion aus der Logdatei.
 *
 * Erwartet Zeilen wie:
 *   Mast 0012/0030 in ÖTM-Blattschnitt 2006 Mönchengladbach-Grevenbroich-0010
 *
 * @param lines - Alle Zeilen der Logdatei
 * @returns Map von Mast-ID → Liste von Blattschnitt-IDs
 */
function parseMastSheetMapping(lines: string[]): Map<string, LogMastSheetEntry> {
  // Regex: "Mast 0012/0030A in ÖTM-Blattschnitt 2009 Mönchengladbach-Grevenbroich-0010"
  const re = /Mast\s+(\d{4})\/([\dA-Za-z]{3,5})\s+in\s+ÖTM-Blattschnitt\s+(.+?)-(\d{4})/;
  const mastMap = new Map<string, LogMastSheetEntry>();

  for (const line of lines) {
    const match = line.match(re);
    if (!match) continue;

    const bl = match[1];
    const mastNumber = match[2]; // z.B. "0030" oder "0030A"
    const lotLabel = match[3].trim();
    const sheetNumber = match[4]; // z.B. "0010"

    // Konstruiere vollständige Mast-ID (wie im Mengengerüst)
    const mastId = buildMastId(bl, mastNumber);
    const sheetId = `${lotLabel.split(" ")[0]}-${sheetNumber}`;

    if (!mastMap.has(mastId)) {
      mastMap.set(mastId, { bl, mastRef: `${bl}/${mastNumber}`, sheetIds: [] });
    }
    mastMap.get(mastId)!.sheetIds.push(sheetId);
  }

  return mastMap;
}

/**
 * Extrahiert Blattschnitte aus Dateinamen.
 *
 * PDF-Dateinamen folgen dem Schema:
 *   ÖTM-<Los-Nr> <Los-Name>-<Blatt-Nr>.PDF
 *   (z.B. "ÖTM-2006 Köln-0001.PDF")
 *
 * Ausgeschlossen:
 *   LP-*.PDF (Lagepläne — enthalten bereits in Blattschnitten)
 *   OETM_LOSBLATT-*.PDF (Übersichtskarten)
 *
 * @param fileNames - Liste von PDF-Dateinamen
 * @param lotNumber - Los-Nummer (z.B. "2006")
 * @returns Liste von OetmSheet-Objekten
 */
function extractSheetsFromFileNames(
  fileNames: string[],
  lotNumber: string,
  lotLabel: string,
): OetmSheet[] {
  // Nur ÖTM-*.PDF-Dateien verarbeiten
  const re = /^ÖTM-\d{4}\s+.+?-(\d{4})\.PDF$/i;
  const sheets: OetmSheet[] = [];
  const seen = new Set<string>();

  for (const name of fileNames) {
    // Ausschließen: LP-* und OETM_LOSBLATT-*
    if (/^LP-/i.test(name)) continue;
    if (/^OETM_LOSBLATT/i.test(name)) continue;

    const match = name.match(re);
    if (!match) continue;

    const sheetNumber = match[1];
    const sheetId = `${lotNumber}-${sheetNumber}`;

    if (seen.has(sheetId)) continue;
    seen.add(sheetId);

    sheets.push({
      sheetId,
      lotNumber,
      sheetNumber,
      pdfFileName: name,
      pdfPath: "", // wird vom File-Picker gesetzt
      status: "offen" as OetmSheetStatus,
      mastCount: 0,
      mastIds: [],
      bbox: null,
      geoBbox: null,
    });
  }

  // Nach Blatt-Nummer sortieren
  sheets.sort((a, b) => parseInt(a.sheetNumber) - parseInt(b.sheetNumber));

  return sheets;
}

/**
 * Geparste Daten aus einer Logdatei.
 */
export interface LogParseResult {
  /** Header-Metadaten */
  header: LogHeader;
  /** Mast-ID → Blattschnitt-Zuordnung */
  mastToSheets: Map<string, string[]>;
  /** Blattschnitt-IDs → Mast-IDs (inverse von mastToSheets) */
  sheetToMasts: Map<string, string[]>;
}

/**
 * Parst eine ÖTM-Logdatei und extrahiert Mast↔Blattschnitt-Mapping.
 *
 * @param text - Vollständiger Text der Logdatei
 * @returns LogParseResult mit Mappings
 */
export function parseLog(text: string): LogParseResult {
  const lines = text.split(/\r?\n/);
  const header = parseLogHeader(lines);
  const entries = parseMastSheetMapping(lines);

  // Mast → Blattschnitte
  const mastToSheets = new Map<string, string[]>();
  for (const [mastId, entry] of entries) {
    mastToSheets.set(mastId, entry.sheetIds);
  }

  // Invers: Blattschnitt → Maste
  const sheetToMasts = new Map<string, string[]>();
  for (const [mastId, entry] of entries) {
    for (const sheetId of entry.sheetIds) {
      if (!sheetToMasts.has(sheetId)) {
        sheetToMasts.set(sheetId, []);
      }
      sheetToMasts.get(sheetId)!.push(mastId);
    }
  }

  return { header, mastToSheets, sheetToMasts };
}


// ═════════════════════════════════════════════════════════════════════════════
// Los-Erstellung: Führt Mengengerüst + Log + PDF-Namen zusammen
// ═════════════════════════════════════════════════════════════════════════════

/** Optionen für den Los-Ladeprozess. */
export interface LoadLotOptions {
  /** Quelle des Loses */
  lotSource: OetmLotSource;
  /** Überschreibt den Los-Namen (für Fremd-Lose ohne standardkonformes Mengengerüst) */
  lotName?: string;
  /** Manuelle Mast-Auswahlen (für Fremd-Lose ohne Log/Mengengerüst) */
  manualMasts?: OetmMast[];
}

/**
 * Lädt alle Daten eines Loses zusammen.
 *
 * Kombiniert:
 *   1. Mengengerüst-Excel → Maste mit Koordinaten
 *   2. Log-Datei → Mast↔Blattschnitt-Zuordnung
 *   3. PDF-Dateinamen → Blattschnitt-Liste
 *
 * @returns Ein vollständiges OetmLot oder null bei Fehler
 */
export function loadLot(
  lotNumber: string,
  lotName: string,
  season: string,
  lotSource: OetmLotSource,
  mengengeruestData: ArrayBuffer | null,
  logText: string | null,
  pdfFileNames: string[],
  options?: LoadLotOptions,
): OetmLot {
  const label = `${lotNumber} ${lotName}`;

  // 1. Maste aus Mengengerüst parsen
  let masts: OetmMast[] = [];
  if (mengengeruestData) {
    masts = parseMengengeruest(mengengeruestData, lotSource, options?.lotName);
  }
  if (options?.manualMasts) {
    masts = [...masts, ...options.manualMasts];
  }

  // 2. Log parsen für Mast↔Blatt-Mapping
  let logResult: LogParseResult | null = null;
  if (logText) {
    logResult = parseLog(logText);
  }

  // 3. Masten mit Blattschnitten aus Log verknüpfen
  if (logResult) {
    for (const mast of masts) {
      mast.sheetIds = logResult.mastToSheets.get(mast.mastId) ?? [];
    }
  }

  // 4. Blattschnitte aus PDF-Dateinamen extrahieren
  const sheets = extractSheetsFromFileNames(pdfFileNames, lotNumber, label);

  // 5. Blattschnitte mit Masten aus Log verknüpfen
  if (logResult) {
    for (const sheet of sheets) {
      sheet.mastIds = logResult.sheetToMasts.get(sheet.sheetId) ?? [];
      sheet.mastCount = sheet.mastIds.length;
    }
  }

  // 6. Blattschnitt-BBOX aus Mast-Koordinaten berechnen (konvexe Hülle)
  for (const sheet of sheets) {
    const mastCoordinates = sheet.mastIds
      .map((mid) => masts.find((m) => m.mastId === mid))
      .filter((m): m is OetmMast => m !== undefined)
      .map((m) => m.coordinates);

    if (mastCoordinates.length >= 2) {
      const lngs = mastCoordinates.map((c) => c[0]);
      const lats = mastCoordinates.map((c) => c[1]);
      sheet.bbox = [
        Math.min(...lngs),
        Math.min(...lats),
        Math.max(...lngs),
        Math.max(...lats),
      ];
    }
  }

  return {
    lotNumber,
    lotName,
    label,
    season,
    lotSource,
    rootPath: "",
    mengengeruestPath: "",
    formularPath: "",
    logPath: "",
    sheets,
    masts,
    parsedAt: new Date().toISOString(),
  };
}


// ═════════════════════════════════════════════════════════════════════════════
// 0.5: Auf-Abnahmeformular-Parser  (Grundgerüst)
// ═════════════════════════════════════════════════════════════════════════════

/** Rohzeile aus dem Auf-Abnahmeformular-Sheet. */
interface AufAbnahmeFormRow {
  "ÖTM-Plan-Nr."?: string;
  "Pflegeeinheiten-nummern (PE)"?: string;
  "Bl."?: string;
  "von Mast (Einzelmast)"?: string;
  "bis Mast"?: string;
  "Beschreiben Sie die zu pflegende Fläche…"?: string;
  "Schutzstreifenerweiterung"?: string;
  "Eigentümer (optional)"?: string;
  "Schaltung benötigt? (ja/nein)"?: string;
  "Länge in m"?: string | number;
  "Breite in m"?: string | number;
  "Größe in m²"?: string | number;
  "Einzelentnahme St."?: string | number;
  "Kronenrückschnitt St."?: string | number;
  "Durchforsten %"?: string | number;
  "Durchforsten m²"?: string | number;
  "Entbuschen %"?: string | number;
  "Entbuschen m²"?: string | number;
  "Auf den Stock setzen %"?: string | number;
  "Auf den Stock setzen m²"?: string | number;
  "Mulchen %"?: string | number;
  "Mulchen m²"?: string | number;
  "Mähen %"?: string | number;
  "Mähen m²"?: string | number;
  "Maststandortpflege %"?: string | number;
  "Maststandortpflege m²"?: string | number;
  "Maßnahme erfolgt am (Datum)"?: string;
}

/**
 * Parst ein Auf-Abnahmeformular-Excel (.xlsx).
 *
 * Erwartet das Sheet "Daten" mit den 29 Spalten des Westnetz-Formulars.
 *
 * @param data - ArrayBuffer der .xlsx-Datei
 * @returns Rohzeilen des Daten-Sheets
 */
export function parseAufAbnahmeForm(data: ArrayBuffer): AufAbnahmeFormRow[] {
  const workbook = XLSX.read(data, { type: "array" });

  const sheetName = workbook.SheetNames.find(
    (n) => n === "Daten" || n.toLowerCase() === "daten" || n === "Data",
  );
  if (!sheetName) {
    throw new Error(
      `Sheet "Daten" not found. Available: ${workbook.SheetNames.join(", ")}`,
    );
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<AufAbnahmeFormRow>(sheet);

  return rows;
}
