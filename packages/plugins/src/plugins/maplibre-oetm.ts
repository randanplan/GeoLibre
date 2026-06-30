/**
 * ÖTM-Aufnahme-Plugin
 * ===================
 * GeoLibre-Plugin für das Ökologische Trassenmanagement (ÖTM).
 *
 * Registriert ein Toolbar-Menü "ÖTM" und ein Right-Panel "ÖTM-Workbench"
 * als primäre Arbeitsfläche. Verwaltet Los-Ladeprozess, Blattschnitt-Status,
 * Mast-Visualisierung und Maßnahmen-Export.
 *
 * IMPLEMENTATION_PLAN-Referenz: Phase 0.1, Meilenstein 0.1.4–0.1.5
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

// ── Plugin-Identität ─────────────────────────────────────────────────────────

export const OETM_PLUGIN_ID = "oetm-workflow";
const PANEL_ID = "oetm-workbench";
const MENU_ID = "oetm-menu";

// ── Plugin-State ─────────────────────────────────────────────────────────────

/** Aktuell geladene Lose. */
let lots: Record<string, OetmLot> = {};

/** Blattschnitt-Status (Index: sheetId). */
let sheetStatus: Record<string, OetmSheetStatus> = {};

/** Maststandortpflege-Status (Index: mastId). */
let maststandortpflegeStatus: Record<string, boolean> = {};

/** Erfasste Maßnahmen. */
let measures: OetmMeasure[] = [];

/** Aktuell aktives Los. */
let activeLotNumber: string | null = null;

/** UI-Einstellungen. */
let ui = {
  showControlledSheets: true,
  showMaststandortpflegeOnly: false,
};

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

// ── Panel-Rendering ──────────────────────────────────────────────────────────

function renderWorkbench(container: HTMLElement): () => void {
  // MVP: Platzhalter-Rendering mit Status-Info
  container.innerHTML = "";

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
  sheetSection.appendChild(sheetLabel);

  wrapper.appendChild(sheetSection);

  // Status: Maßnahmen
  const measureSection = document.createElement("div");
  measureSection.style.marginBottom = "16px";

  const measureLabel = document.createElement("div");
  measureLabel.textContent = `Erfasste Maßnahmen: ${measures.length}`;
  measureLabel.style.fontWeight = "500";
  measureSection.appendChild(measureLabel);

  wrapper.appendChild(measureSection);

  // Platzhalter für spätere UI-Erweiterung
  const placeholder = document.createElement("div");
  placeholder.textContent = "Los laden über ÖTM → Los laden";
  placeholder.style.color = "var(--color-text-muted, #9ca3af)";
  placeholder.style.fontStyle = "italic";
  placeholder.style.fontSize = "12px";
  placeholder.style.marginTop = "24px";
  wrapper.appendChild(placeholder);

  container.appendChild(wrapper);

  return () => {
    wrapper.remove();
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
          // Phase 1.1: Datei-Picker implementieren
          console.log("[ÖTM] Los laden angefordert");
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
          // Später: Layer-Filter aktualisieren
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
  version: "0.1.0",
  activeByDefault: false,

  activate(app: GeoLibreAppAPI) {
    appRef = app;

    // Toolbar-Menü registrieren
    unregisterMenu = app.registerToolbarMenu?.(buildToolbarMenu()) ?? null;

    // Right-Panel registrieren
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

    // Panel automatisch öffnen
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
    // Nur persistieren wenn Daten vorhanden sind
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
