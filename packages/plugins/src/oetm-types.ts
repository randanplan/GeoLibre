/**
 * ÖTM-Typdefinitionen
 * ===================
 * Domain-Typen für die ÖTM-Aufnahme-App (Ökologisches Trassenmanagement).
 *
 * IMPLEMENTATION_PLAN-Referenz: Phase 0.1, Meilenstein 0.1.7
 */

// ── Los ─────────────────────────────────────────────────────────────────────

/** Quelle eines Loses — bestimmt Parser-Strategie und UI-Verhalten. */
export type OetmLotSource = "westnetz" | "amprion" | "manual";

/** Ein ÖTM-Los (Projekt). */
export interface OetmLot {
  /** Los-Nummer (z.B. "2006") */
  lotNumber: string;
  /** Los-Name (z.B. "Köln") */
  lotName: string;
  /** Kombinierte Bezeichnung (z.B. "2006 Köln") */
  label: string;
  /** Saison (z.B. "2026-27") */
  season: string;
  /** Quelle des Loses */
  lotSource: OetmLotSource;
  /** Absoluter Pfad zum Los-Ordner (Desktop) oder leer (Web) */
  rootPath: string;
  /** Pfad zur Mengengerüst-Excel-Datei */
  mengengeruestPath: string;
  /** Pfad zur Auf-Abnahmeformular-Excel-Datei */
  formularPath: string;
  /** Pfad zur Log-Datei */
  logPath: string;
  /** Alle Blattschnitte dieses Loses */
  sheets: OetmSheet[];
  /** Alle Maste dieses Loses */
  masts: OetmMast[];
  /** Parsing-Zeitstempel */
  parsedAt: string;
}

// ── Blattschnitt ────────────────────────────────────────────────────────────

/** Status eines Blattschnitts im ÖTM-Workflow. */
export type OetmSheetStatus = "offen" | "in-arbeit" | "kontrolliert" | "abgenommen";

/** Ein ÖTM-Blattschnitt (eine PDF-Seite). */
export interface OetmSheet {
  /** Eindeutige ID: "{lotNumber}-{sheetNumber}" (z.B. "2006-0001") */
  sheetId: string;
  /** Los-Nummer */
  lotNumber: string;
  /** Blatt-Nummer (4-stellig, z.B. "0001") */
  sheetNumber: string;
  /** PDF-Dateiname (z.B. "ÖTM-2006 Köln-0001.PDF") */
  pdfFileName: string;
  /** Absoluter Pfad zur PDF-Datei */
  pdfPath: string;
  /** Workflow-Status */
  status: OetmSheetStatus;
  /** Anzahl der Maste auf diesem Blatt (aus Log) */
  mastCount: number;
  /** Zugeordnete Mast-IDs (aus Log) */
  mastIds: string[];
  /** Blattschnitt-BBOX als konvexe Hülle der Maste [west, south, east, north] */
  bbox: [number, number, number, number] | null;
  /** Georeferenzierte BBOX via PDF-Analyse [west, south, east, north] */
  geoBbox: [number, number, number, number] | null;
}

// ── Mast ────────────────────────────────────────────────────────────────────

/** Ein Strommast aus dem Mengengerüst. */
export interface OetmMast {
  /** Zusammengesetzte Mast-ID: BL + Mast (z.B. "00120030") */
  mastId: string;
  /** Bauleitungs-Nummer (4-stellig) */
  bl: string;
  /** Mast-Nummer (4-stellig gepadded, z.B. "0030", "P002" für Portalmast) */
  mastNumber: string;
  /** Ist ein Portalmast (Umspannwerk-Leitungsendpunkt)? */
  isPortal: boolean;
  /** Leitung/Route-Name (z.B. "Brauweiler - Reisholz") */
  leitungName: string;
  /** Los-Bezeichnung */
  lotName: string;
  /** Los-Quelle */
  lotSource: OetmLotSource;
  /** Kreis (z.B. "Köln") */
  kreis: string;
  /** Länge in Metern */
  laengeM: number;
  /** Leitbezirk/Team (z.B. "Lev", "Ne") */
  leitBezTeam: string;
  /** Geokoordinate [longitude, latitude] (WGS84) */
  coordinates: [number, number];
  /** Maststandortpflege-Status (manuell durch Nutzer gesetzt) */
  maststandortpflege: boolean;
  /** Zugeordnete Blattschnitt-IDs (aus Log) */
  sheetIds: string[];
}

// ── Maßnahme ────────────────────────────────────────────────────────────────

/** Maßnahmen-Typ — bestimmt welche Felder befüllt werden. */
export type OetmMeasureType = "flaeche" | "stueck" | "linie";

/**
 * Eine erfasste Maßnahme.
 * Enthält alle 29 Spalten des Auf-Abnahmeformulars + GeoJSON-Geometrie.
 */
export interface OetmMeasure {
  /** Eindeutige ID (UUID) */
  id: string;
  /** Maßnahmen-Typ */
  measureType: OetmMeasureType;
  /** GeoJSON-Geometrie (Point, LineString, Polygon) */
  geometry: GeoJSON.Geometry | null;

  // ── Formular-Spalten (aus Auf-Abnahmeformular_*.xlsx) ──────────────────
  /** ÖTM-Plan-Nummer */
  oetmPlanNr: string;
  /** Pflegeeinheiten-Nummern */
  pflegeeinheitenNummern: string;
  /** Bauleitung */
  bl: string;
  /** Von Mast (Einzelmast) */
  vonMast: string;
  /** Bis Mast */
  bisMast: string;
  /** Beschreibung der zu pflegenden Fläche */
  beschreibung: string;
  /** Schutzstreifenerweiterung */
  schutzstreifenerweiterung: string;
  /** Eigentümer */
  eigentuemer: string;
  /** Schaltung benötigt? */
  schaltungBenoetigt: string;
  /** Länge in m */
  laengeM: number;
  /** Breite in m */
  breiteM: number;
  /** Größe in m² */
  groesseQm: number;
  /** Einzelentnahme Stück */
  einzelentnahmeSt: number;
  /** Kronenrückschnitt Stück */
  kronenrueckschnittSt: number;
  /** Durchforsten % */
  durchforstenProzent: number;
  /** Durchforsten m² */
  durchforstenQm: number;
  /** Entbuschen % */
  entbuschenProzent: number;
  /** Entbuschen m² */
  entbuschenQm: number;
  /** Auf den Stock setzen % */
  aufDenStockSetzenProzent: number;
  /** Auf den Stock setzen m² */
  aufDenStockSetzenQm: number;
  /** Mulchen % */
  mulchenProzent: number;
  /** Mulchen m² */
  mulchenQm: number;
  /** Mähen % */
  maehenProzent: number;
  /** Mähen m² */
  maehenQm: number;
  /** Maststandortpflege % */
  maststandortpflegeProzent: number;
  /** Maststandortpflege m² */
  maststandortpflegeQm: number;
  /** Maßnahme erfolgt am (Datum) */
  massnahmeDatum: string;

  /** Zugeordnete Blattschnitt-ID (via spatial intersection) */
  sheetId: string;
  /** Erfassungszeitstempel */
  createdAt: string;
  /** Letzte Änderung */
  updatedAt: string;
}

// ── Plugin-State ────────────────────────────────────────────────────────────

/** Serialisierbarer Plugin-Zustand (für getProjectState/applyProjectState). */
export interface OetmPluginState {
  /** Version des State-Schemas (für Migrationen) */
  version: 1;
  /** Geladene Lose (Index: lotNumber) */
  lots: Record<string, OetmLot>;
  /** Blattschnitt-Status (Index: sheetId) */
  sheetStatus: Record<string, OetmSheetStatus>;
  /** Mast-Standortpflege-Status (Index: mastId) */
  maststandortpflegeStatus: Record<string, boolean>;
  /** Erfasste Maßnahmen */
  measures: OetmMeasure[];
  /** ID des aktuell aktiven Loses */
  activeLotNumber: string | null;
  /** UI-Einstellungen */
  ui: {
    showControlledSheets: boolean;
    showMaststandortpflegeOnly: boolean;
  };
}
