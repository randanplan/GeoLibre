# ÖTM-Aufnahme-App — Umsetzungsplan

> Basierend auf: `GOAL.md` (Stand 2026-06-29)  
> Architektur: GeoLibre Plugin-System  
> Owner: randanplan  
> Erstellt: 2026-06-29

---

## Übersicht

Der Plan gliedert sich in **7 Phasen** über drei MVP-/Release-Stufen (MVP → Phase 2 → Phase 3), gemäß den Erfolgskriterien aus GOAL.md Abschnitt 5. Jede Phase enthält konkrete Meilensteine, Teilschritte, benötigte Ressourcen, Risiken und Gegenmaßnahmen.

---

## Phase 0: Vorbereitung & Infrastruktur

**Ziel:** Entwicklungsfundament schaffen — Plugin-Grundgerüst, Daten-Parsing-Infrastruktur, Python-Sidecar-Endpunkte.

### Meilenstein 0.1: Plugin-Grundgerüst

| # | Teilschritt | Details | Status |
| |-------------|---------|--------|
| 0.1.1 | Plugin-Datei anlegen | `packages/plugins/src/plugins/maplibre-oetm.ts` — `GeoLibrePlugin`-Objekt mit `activate`/`deactivate`/`getProjectState`/`applyProjectState` | ✅ erledigt |
| 0.1.2 | Plugin registrieren | In `packages/plugins/src/index.ts` exportieren und in `apps/geolibre-desktop/src/hooks/usePlugins.ts` in `manager.registerAll([...])` aufnehmen | ✅ erledigt |
| 0.1.3 | Plugin-Icon & Name | Plugin-ID: `oetm-workflow`, Name: `ÖTM-Aufnahme`, `activeByDefault: false` | ✅ erledigt |
| 0.1.4 | Toolbar-Menü registrieren | `registerToolbarMenu` in `activate()` — Menüpunkt `ÖTM` mit Einträgen: *Los laden*, *Statusübersicht*, *Masten einblenden*, *Export* | ✅ erledigt |
| 0.1.5 | Right-Panel registrieren | `registerRightPanel` mit `dock: "replace-style"` — `ÖTM-Workbench` als primäre Arbeitsfläche | ✅ erledigt |
| 0.1.6 | i18n-Schlüssel anlegen | `apps/geolibre-desktop/src/i18n/locales/de.json` und `en.json` um `oetm.*`-Namespace erweitern | ✅ erledigt |
| 0.1.7 | TypeScript-Typen definieren | `packages/plugins/src/oetm-types.ts` — `OetmLot` (`lotNumber`, `lotName`, `season`, `lotSource: 'westnetz' | 'amprion' | 'manual'`), `OetmSheet` (`sheetId`, `pdfFileName`, `lotNumber`, `status`), `OetmMast` (`mastId`, `bl`, `mastNumber`, `lotName`, `lotSource`, `maststandortpflege`, `coordinates: [number, number]`, `sheetIds`), `OetmMeasure` (29 Formular-Spalten + `measureType: 'flaeche' | 'stueck' | 'linie'`, `geometry`), `SheetStatus` (`offen` | `in-arbeit` | `kontrolliert` | `abgenommen`) | ✅ erledigt |

### Meilenstein 0.2: Excel-Parsing (Mengengerüst)

| # | Teilschritt | Details | Status |
|---|-------------|---------|--------|
| 0.2.1 | Client-seitiger XLSX-Reader | `npm install xlsx` im Plugin-Pfad (`@geolibre/plugins`) | ✅ erledigt |
| 0.2.2 | `Mengengerüst_*.xlsx` Parser | Sheet `2026-27` einlesen → `parseMengengeruest()` in `oetm-parser.ts` | ✅ erledigt |
| 0.2.3 | Mast-ID Konstruktion | `buildMastId()` in `oetm-parser.ts` — BL (4-stellig) + Mast (gepadded mit P-Präfix, Buchstaben-Suffix) | ✅ erledigt |
| 0.2.4 | GeoJSON-Erzeugung | `mastsToGeoJson()` in `oetm-parser.ts` — `FeatureCollection<Point>` | ✅ erledigt |
| 0.2.5 | Maststandortpflege-Erkennung | Default `false`; manuelle Setzung durch Nutzer. `lotSource`-Typen vorbereitet | ✅ erledigt |

### Meilenstein 0.3: Log-Parsing (Mast ↔ Blattschnitt)

| # | Teilschritt | Details | Status |
|---|-------------|---------|--------|
| 0.3.1 | Log-Struktur analysieren | Drei Sektionen: Header, Mast↔Blatt-Mapping, Druck-Log. `parseLogHeader()` + `parseMastSheetMapping()` in `oetm-parser.ts` | ✅ erledigt |
| 0.3.2 | Mast↔Blatt-Mapping extrahieren | `Mast (\d{4}/\d{3,4}[A-C]?) in ÖTM-Blattschnitt (.+)-(\d{4})` → `Map<mastId, sheetIds[]>` | ✅ erledigt |
| 0.3.3 | Blatt-ID-Gewinnung | `extractSheetsFromFileNames()` — Regex auf `ÖTM-*.PDF`, Ausschluss von `LP-*` und `OETM_LOSBLATT-*` | ✅ erledigt |
| 0.3.4 | Datei-Filterung | `LP-*.PDF` und `OETM_LOSBLATT-*.PDF` werden in `extractSheetsFromFileNames()` ausgeschlossen | ✅ erledigt |
| 0.3.5 | Fehlende Maste ignorieren | Log dient als Positivliste; `FEHLER:`-Zeilen werden ignoriert | ✅ erledigt |

### Meilenstein 0.4: Python-Sidecar für PDF-Verarbeitung

> **Vorarbeit:** `scripts/oetm_pdf_extractor.py` (Layout-Analyse) und `scripts/oetm_pdf_explore.py` (Layout-Erkundung) existieren bereits und extrahieren die vier festen Layout-Bereiche jedes ÖTM-Blattschnitt-PDFs mithilfe fester, rechter Randabstände (keine Textsuche nötig).

**Bekannte Layout-Konstanten (aus `oetm_pdf_extractor.py`):**
- Seitenhöhe konstant: 841.6 pt (A1-Querformat)
- Seitenbreite variiert je Leitungsabschnittslänge
- `Hauptkarte`: `Rect(71, 14, pageW−1572, 828)` — der kartografische Bereich (Ziel für Georeferenzierung)
- `Legende`: `Rect(pageW−1572, 14, pageW−1014, 828)`
- `Detail-Info`: `Rect(pageW−1014, 14, pageW−453, 828)` — enthält Tabelle mit vorhandenen Maßnahmen
- `Titelblock`: `Rect(pageW−453, 14, pageW, 828)` — enthält Blattnummer, Los, Maßstab

| # | Teilschritt | Details | Status |
|---|-------------|---------|--------|
| 0.4.1 | Sidecar-Modul anlegen | `backend/geolibre_server/geolibre_server/app/oetm.py` — FastAPI-Router mit Pydantic-Models. Importiert Kernlogik via `sys.path` aus `scripts/oetm_pdf_extractor.py`. 10 Endpunkte (vgl. Plan: 6 + 4 Zusatz-Endpunkte für Layout, Render-Region, Mast-Candidates) | ✅ erledigt |
| 0.4.2 | Router registrieren | In `backend/geolibre_server/geolibre_server/app/main.py`: `from .oetm import router as oetm_router` + `app.include_router(oetm_router)` | ✅ erledigt |
| 0.4.3 | PyMuPDF-Abhängigkeit | `pip install PyMuPDF`; in `pyproject.toml` unter `[project.optional-dependencies]` als `oetm`-Extra (`"PyMuPDF>=1.23.0"`) + in `test`-Extra aufgenommen | ✅ erledigt |
| 0.4.4 | PDF-Viewer-Integration | PDF-Viewer (z. B. [lector-weld](https://lector-weld.vercel.app/docs/basic-usage)) client-seitig einbinden. Viewer dient visueller Inspektion und interaktiver GCP-Auswahl. Server-seitiges Rendering via `render_region_to_png()` aus dem Extraktor als Fallback | 🔲 offen |
| 0.4.5 | Endpunkt: Blattschnitt-Metadaten | `POST /oetm/sheet-metadata` — Extrahiert aus Titelblock: Blattnummer, Los-Bezeichnung, Maßstab (z. B. `1:2000`), Datum. Nutzt `extract_sheet_metadata()` auf Titelblock-Bereich | ✅ erledigt |
| 0.4.6 | Endpunkt: Blattschnitt-BBOX | `POST /oetm/sheet-bbox` — Gibt Pixel-BBOX des Hauptkarten-Bereichs zurück: `{x0, y0, x1, y1, pageWidth, pageHeight}` | ✅ erledigt |
| 0.4.7 | Endpunkt: Detail-Tabelle | `POST /oetm/sheet-detail-table` — Extrahiert die vorhandenen Maßnahmen aus der Detail-Informationen-Tabelle (Spalten: Typ, Nr., Fläche qm, Pflege %/St., Aufarbeitungsform). Nutzt `analyse_detail_table()` | ✅ erledigt |
| 0.4.8 | Endpunkt: Georeferenzierung | `POST /oetm/georeference` — Nimmt Mast-Koordinaten (WGS84) + korrespondierende PDF-Pixelkoordinaten (aus Hauptkarten-Bereich), berechnet Affine-Transformation via Least-Squares (Cramer's Rule, pure Python). Gibt 6 Transformationsparameter + RMSE + Residual-Map zurück | ✅ erledigt |
| 0.4.9 | Sidecar-Statusprüfung | `GET /oetm/health` — Gibt `{status, pymupdf_available}` zurück | ✅ erledigt |

### Meilenstein 0.5: Auf-Abnahmeformular-Parser

| # | Teilschritt | Details | Status |
| |-------------|---------|--------|
| 0.5.1 | `Auf-Abnahmeformular_*.xlsx` Parser | Sheet `Daten` einlesen. Vollständige Spaltenliste (29 Spalten): `ÖTM-Plan-Nr.`, `Pflegeeinheiten-nummern (PE)`, `Bl.`, `von Mast (Einzelmast)`, `bis Mast`, `Beschreiben Sie die zu pflegende Fläche…`, `Schutzstreifenerweiterung`, `Eigentümer (optional)`, `Schaltung benötigt? (ja/nein)`, `Länge in m`, `Breite in m`, `Größe in m²`, `Einzelentnahme St.`, `Kronenrückschnitt St.`, `Durchforsten %`, `Durchforsten m²`, `Entbuschen %`, `Entbuschen m²`, `Auf den Stock setzen %`, `Auf den Stock setzen m²`, `Mulchen %`, `Mulchen m²`, `Mähen %`, `Mähen m²`, `Maststandortpflege %`, `Maststandortpflege m²`, `Maßnahme erfolgt am (Datum)` | ⏳ Grundstruktur in `oetm-parser.ts` |
| 0.5.2 | Maßnahmen-Typen | Typ-Erkennung über befüllte Felder | 🔲 offen |
| 0.5.3 | Excel-Ausgabe (Schreibfähigkeit) | Separate Ausgabe-Datei | 🔲 offen |

**Ressourcen Phase 0:**
- `xlsx` npm package (≈ 600 KB) — installiert in `@geolibre/plugins`
- `PyMuPDF` Python package (≈ 15 MB, platform-binaries) — als `oetm`-Extra in `pyproject.toml`
- Aufwand: ca. 5–7 Arbeitstage (davon ~4,5 AT erledigt: 0.1 ✅, 0.2/0.3 ✅, 0.4 ✅ außer 0.4.4 PDF-Viewer)
- **Verbleibend:** ~0,5–2,5 AT (0.5 Auf-Abnahmeformular Schreibfunktion, 0.4.4 PDF-Viewer)

**Risiken Phase 0:**
| Risiko | Eintrittsw. | Auswirkung | Gegenmaßnahme |
|--------|-------------|------------|---------------|
| Excel-Dateien haben inkonsistente Spaltennamen | Mittel | Hoch | Robustes Parsing mit Fuzzy-Matching auf Spalten; Fallback auf manuelle Zuordnung |
| PDFs enthalten keine Vektorgrafik, sondern Raster | Gering | Mittel | PDF-Viewer rendert unabhängig vom Grafiktyp; BBOX über Georeferenzierung (Mast-GCPs) statt Vektoranalyse |
| Log-Dateien abweichend formatiert | Mittel | Mittel | Defensive Regex; Log-Parsing in eigenen Test-Suite abdecken; Dateinamen-Parsing als Primärquelle für Blatt-IDs |
| PyMuPDF-Kompatibilität mit Server-OS | Gering | Mittel | Docker-Container mit getestetem PyMuPDF-Build |
| Datei-Discovery findet unerwünschte Dateien (LP, Übersichtskarten) | Mittel | Niedrig | Expliziter Pattern-Filter: nur `ÖTM-*.PDF` akzeptieren; `LP-*` und `OETM_LOSBLATT-*` hart ausschließen |

---

## Phase 1: MVP — Blattschnitte & Masten auf der Karte

**Ziel:** GOAL.md 2.1, Punkte 1–5. Erfolgskriterien aus 5.1: Layer mit Blattschnitten, PDF-Zuordnung, Statusmanagement, Mast-Visualisierung, mind. ein Los vollständig nutzbar.

### Meilenstein 1.1: Los-Ladeprozess

| # | Teilschritt | Details |
|---|-------------|---------|
| 1.1.1 | Datei-Picker für Los | `ÖTM → Los laden` öffnet Tauri-Dialog (Desktop) oder File-Input (Web). Nutzer wählt Los-Ordner (`2006 Köln/2026-27/Pläne/...`) |
| 1.1.2 | Datei-Discovery | Automatisches Scannen des gewählten Ordners: `Mengengerüst_*.xlsx`, `Auf-Abnahmeformular_*.xlsx`, `Log_*.log`, `ÖTM-*.PDF` erkennen. `LP-*.PDF` und `OETM_LOSBLATT-*.PDF` ignorieren |
| 1.1.3 | Los-Metadaten extrahieren | Los-Name aus Ordnername + Log-Header. Blattschnitt-Liste aus Dateinamen (`ÖTM-<Los-Nr> <Los-Name>-<Blatt-Nr>.PDF`). Anzahl Blattschnitte + Maste aus Log-Header |
| 1.1.4 | Parsing-Pipeline triggern | Sequentiell: Log parsen → Mengengerüst parsen → Mast↔Blatt verknüpfen |
| 1.1.5 | Lade-Feedback | Fortschrittsanzeige im Right-Panel: "Parse Log...", "Lese Mengengerüst...", "Bereite Kartenlayer vor..." |

### Meilenstein 1.2: Blattschnitt-Layer

| # | Teilschritt | Details |
|---|-------------|---------|
| 1.2.1 | Blattschnitt-Geometrie bestimmen | **Ansatz A (schnell, ungenau):** Alle Mast-Koordinaten eines Blatts als konvexe Hülle → BBOX. **Ansatz B (genau, aufwändig):** PDF via Sidecar → `POST /oetm/sheet-bbox` → reale Blattschnitt-Polygone |
| 1.2.2 | GeoJSON-Layer erzeugen | `app.addGeoJsonLayer("ÖTM-Blattschnitte", featureCollection)` — jedes Feature: `Polygon` mit Properties (`sheetId`, `pdfFileName`, `status`, `lotName`) |
| 1.2.3 | Blattschnitt-ID-Schema | `{lotNumber}-{sheetNumber}` (z. B. `2006-0001`) |
| 1.2.4 | Layer-Styling nach Status | `LayerStyle.categorized` auf Property `status`: *offen* = `#9CA3AF` (Grau), *in Arbeit* = `#F59E0B` (Orange), *kontrolliert* = `#10B981` (Grün) |
| 1.2.5 | Klick-Interaktion | Click auf Blattschnitt → Infofenster mit: PDF-Dateiname, Status-Dropdown, Mast-Anzahl, Link zum Öffnen des PDFs |
| 1.2.6 | Fit-Bounds | `app.fitBounds()` beim ersten Laden auf BBOX des geladenen Loses |

### Meilenstein 1.3: Mast-Layer

| # | Teilschritt | Details |
|---|-------------|---------|
| 1.3.1 | Mast-GeoJSON aus Mengengerüst erzeugen | `GEO_X`, `GEO_Y` → `Point`-Features, Properties: `mastId`, `bl`, `lotName`, `lotSource`, `maststandortpflege` (Boolean, Default `false`), `sheetIds` (zugeordnete Blätter aus Log) |
| 1.3.2 | Layer anlegen | `app.addGeoJsonLayer("ÖTM-Strommasten", mastFeatures)` |
| 1.3.3 | Maststandortpflege-Farbcodierung | `LayerStyle.categorized` auf `maststandortpflege`: `true` = `#10B981` (Grün), `false` = `#6B7280` (Grau). Manuelle Umschaltung durch Nutzer |
| 1.3.4 | Mast-Symbole | Kreis-Marker, Radius 6px, Stroke 1px weiß. Optional: Mast-Icon als SVG-Marker. Portalmasten (P-Präfix) mit abweichendem Symbol (z. B. Quadrat) |
| 1.3.5 | Mast↔Blatt-Verknüpfung | Hover/Click auf Mast → zugehörige Blattschnitte highlighten; Click auf Blattschnitt → zugehörige Maste highlighten |
| 1.3.6 | Filterung | Checkbox im Right-Panel: "Nur Maste ohne Standortpflege" → Layer-Filter auf `maststandortpflege == false` |

### Meilenstein 1.4: Statusmanagement

| # | Teilschritt | Details |
|---|-------------|---------|
| 1.4.1 | Status-Store | Plugin-eigener Zustand (in `getProjectState`/`applyProjectState` serialisiert): `Map<sheetId, Status>` mit Werten `offen`, `in-arbeit`, `kontrolliert` |
| 1.4.2 | Status-UI im Right-Panel | Tabelle: Blattschnitt-ID, PDF-Name, Status-Dropdown, Mast-Anzahl, Fortschrittsbalken |
| 1.4.3 | Batch-Statusänderung | Multi-Select + "Alle markierten auf kontrolliert setzen" |
| 1.4.4 | Filter | Checkbox "Ausgeblendet: kontrollierte Blätter" → Layer-Filter auf `status != 'kontrolliert'` |
| 1.4.5 | Persistenz | Status-Daten werden in `getProjectState()` serialisiert → `.geolibre.json`-Projektdatei |

### Meilenstein 1.5: Excel-Integration (Mengengerüst)

| # | Teilschritt | Details |
|---|-------------|---------|
| 1.5.1 | Mast-Liste vollständig parsen | Alle Spalten des `2026-27`-Sheets als Properties auf Mast-Features |
| 1.5.2 | Mast↔Blatt-Zuordnung | Aus Log-Datei abgeleitet; Visualisierung im Right-Panel als "Blattschnitte dieses Mastes" |
| 1.5.3 | Maststandortpflege-Editierung | Checkbox im Mast-Info-Panel: "Maststandortpflege" → schreibt Status zurück in Plugin-State (später in separate Excel-Ausgabe) |

**Ressourcen Phase 1:**
- Vorhandene GeoLibre-APIs: `addGeoJsonLayer`, `fitBounds`, `registerRightPanel`, `registerToolbarMenu`, `getProjectState`
- Aufwand: ca. 8–12 Arbeitstage

**Risiken Phase 1:**
| Risiko | Eintrittsw. | Auswirkung | Gegenmaßnahme |
|--------|-------------|------------|---------------|
| GEO_X/GEO_Y sind nicht WGS84 | Gering | Hoch | EPSG-Prüfung vor Verwendung; Koordinaten liegen im Bereich 6.8/51.0 → plausibel WGS84 |
| Blattschnitt-Geometrie als konvexe Hülle unzureichend | Mittel | Mittel | Option B (PDF-Analyse) als Fallback; für MVP reicht BBOX |
| Mast-ID-Format variiert zwischen Mengengerüst und Log | Mittel | Hoch | Normalisierungsfunktion: Zahlen extrahieren, führende Nullen, Suffix-Handling |
| Desktop-Pfade vs. Web-Pfade für Datei-Discovery | Mittel | Mittel | Tauri-Dialog für Desktop; `importTextFile` für Web; Pfade relativ zum Los speichern |

---

## Phase 2: Direkte Markierung & Maßnahmen-Tracking

**Ziel:** GOAL.md 2.2, Punkte 1–2. Direktes Erfassen von Maßnahmen in der App; strukturiertes Tracking.

> **Vorarbeit (beschleunigt Phase 2):** `oetm_pdf_extractor.py` kann via `analyse_detail_table()` bereits vorhandene Maßnahmen aus der Detail-Informationen-Tabelle jedes PDFs extrahieren (Spalten: Typ | Nr. | Fläche (qm) | Pflege (%/St.) | Aufarbeitungsform). Dies ermöglicht einen **PDF-Import existierender Maßnahmen** — statt alle Maßnahmen neu zeichnen zu müssen, können importierte Einträge validiert, ergänzt und direkt ins Auf-Abnahmeformular übernommen werden.

### Meilenstein 2.0: PDF-Maßnahmen-Import (vorgezogen aus Erkenntnis des Extraktors)

| # | Teilschritt | Details |
|---|-------------|---------|
| 2.0.1 | Sidecar-Endpunkt nutzen | `POST /oetm/sheet-detail-table` → liefert alle erkannten Maßnahmen einer PDF-Seite als JSON-Array |
| 2.0.2 | Import-UI | Button im Right-Panel: "Maßnahmen aus PDF importieren" → zeigt Vorschau der gefundenen Einträge |
| 2.0.3 | Maßnahmen-Mapping | PDF-Tabellenspalten → App-Maßnahmen: `Typ` → Kategorie, `Nr.` → Pflegeeinheiten-Nummer, `Fläche (qm)` → Größe in m², `Pflege (%/St.)` → relevante %- oder St.-Felder, `Aufarbeitungsform` → Beschreibung |
| 2.0.4 | Konflikt-Management | Import erkennt Duplikate (gleiches Blatt + gleiche Maßnahmen-Nr.); Nutzer wählt: überschreiben / überspringen / manuell abgleichen |

### Meilenstein 2.1: Zeichenwerkzeuge

| # | Teilschritt | Details |
|---|-------------|---------|
| 2.1.1 | GeoEditor-Integration | Vorhandenen `maplibre-gl-geo-editor`-Plugin nutzen oder Drawing-Tools direkt einbinden |
| 2.1.2 | ÖTM-Maßnahmen-Layer | Separater GeoJSON-Layer `ÖTM-Maßnahmen` für Punkte/Linien/Flächen |
| 2.1.3 | Maßnahmen-Attribute | Beim Zeichnen: Dialog mit Pflichtfeldern (Maßnahmen-Typ, Beschreibung, Von-Mast, Bis-Mast). Typ bestimmt Folgedialog: Fläche → % + m²; Stück → Anzahl; Linie → Länge + Breite |
| 2.1.4 | Maßnahmen-Kategorien | Dropdown: *Gruppe*, *Hecke*, *Sukzessionsfläche*, *Bäume*, *Einzelentnahme*, *Kronenrückschnitt*, *Durchforsten*, *Entbuschen*, *Auf den Stock setzen*, *Mulchen*, *Mähen*, *Maststandortpflege* |

### Meilenstein 2.2: Maßnahmen-Formular

| # | Teilschritt | Details |
|---|-------------|---------|
| 2.2.1 | Formular-UI im Right-Panel | DOM-basiertes Formular: Felder gemäß aller 29 `Auf-Abnahmeformular`-Spalten (siehe 0.5.1). Dynamische Feldanzeige je nach Maßnahmen-Typ (Fläche/Stück/Linie) |
| 2.2.2 | Flächenberechnung | `turf.area()` für gezeichnete Polygone → `Größe in m²`. Für Linien-Maßnahmen: `turf.length()` × manuelle Breite → `Größe in m²` |
| 2.2.3 | Maßnahmenliste | Tabelle aller erfassten Maßnahmen mit Filter/Sortierung nach Typ, Blattschnitt, Status |
| 2.2.4 | Maßnahmen↔Blatt-Verknüpfung | Automatische Zuordnung der Maßnahme zum Blattschnitt via spatial intersection mit Blattschnitt-Layer |
| 2.2.5 | Maßnahmen-Export (JSON) | Export als GeoJSON + alle 29 Formular-Attribute für Weitergabe/Zwischenspeicherung |

**Ressourcen Phase 2:**
- `@turf/turf` für Flächenberechnung (bereits im Projekt)
- Aufwand: ca. 6–10 Arbeitstage (inkl. 2.0 PDF-Import; reduziert manuellen Zeichenaufwand)
- **Beschleuniger:** `scripts/oetm_pdf_extractor.py` liefert bereits Maßnahmen-Tabellenparsing → Import statt Neuzeichnung

**Risiken Phase 2:**
| Risiko | Eintrittsw. | Auswirkung | Gegenmaßnahme |
|--------|-------------|------------|---------------|
| Zeichenwerkzeuge in Plugin-DOM schwer integrierbar | Mittel | Hoch | MapLibre GL Draw direkt einbinden; GeoEditor-Plugin als Fallback reaktivieren |
| Formular-Komplexität übersteigt Plugin-DOM-Ansatz | Mittel | Mittel | Auf Kernfelder reduzieren; Rest als Freitext-Kommentar |

---

## Phase 3: Finalisierung — Auf-Abnahmeformular & Westnetz-Abgabe

**Ziel:** GOAL.md 2.2, Punkt 3. Export der erfassten Maßnahmen in `Auf-Abnahmeformular_*.xlsx`; strukturierte Abgabe an Westnetz.

### Meilenstein 3.1: Excel-Export

| # | Teilschritt | Details |
|---|-------------|---------|
| 3.1.1 | Auf-Abnahmeformular-Template | Bestehendes Excel als Struktur-Template laden (Spaltenreihenfolge, Formatierung, Sheet-Name `Daten`). Neue Ausgabe-Excel wird separat angelegt — Original-Template bleibt unverändert |
| 3.1.2 | Spalten-Mapping | App-Maßnahmen → alle 29 Formular-Spalten (siehe 0.5.1). Maßnahmen-Typ bestimmt befüllte Felder: Flächen-Maßnahmen → % + m²; Stück-Maßnahmen → St.; Linien-Maßnahmen → Länge/Breite → Größe |
| 3.1.3 | Koordinaten-Export | Zentroid der gezeichneten Fläche als WGS84-Koordinatenpaar (für räumliche Zuordnung im Formular) |
| 3.1.4 | Datumsstempel | `Maßnahme erfolgt am (Datum)` → aktuelles Datum (editierbar) |
| 3.1.5 | Excel-Generierung | Client-seitig via `xlsx` library: Template-Struktur lesen → Zeilen befüllen → als neue Datei speichern/downloaden. Output-Dateiname: `Auf-Abnahmeformular_<Los>_ausgefuellt.xlsx` |

### Meilenstein 3.2: Validierung & QA

| # | Teilschritt | Details |
|---|-------------|---------|
| 3.2.1 | Pflichtfeld-Prüfung | Vor Export: alle Pflichtfelder der Ziel-Excel auf Vollständigkeit prüfen |
| 3.2.2 | Plausibilitäts-Checks | Fläche > 0, Länge/Breite konsistent, Mast-IDs existieren im Mengengerüst |
| 3.2.3 | Export-Vorschau | Zusammenfassung vor Export: X Maßnahmen, Y Blattschnitte, Z Maste |

### Meilenstein 3.3: Integrationstest mit Westnetz-Formular

| # | Teilschritt | Details |
|---|-------------|---------|
| 3.3.1 | Test-Export mit Beispieldaten | Echtes `Auf-Abnahmeformular_26-27.xlsx` als Basis → mit Testmaßnahmen befüllen → auf Strukturkonformität prüfen |
| 3.3.2 | Abgleich mit Referenzdokument | `Beschreibung - Aufnahme- & Abnahmeformular.pdf` konsultieren für fachliche Anforderungen |
| 3.3.3 | Feedback-Schleife | Exportiertes Excel an Fachseite zur Prüfung geben → Iteration |

**Ressourcen Phase 3:**
- `xlsx` npm package (write mode)
- Aufwand: ca. 5–8 Arbeitstage

**Risiken Phase 3:**
| Risiko | Eintrittsw. | Auswirkung | Gegenmaßnahme |
|--------|-------------|------------|---------------|
| Auf-Abnahmeformular enthält Formatierungen/Makros | Mittel | Hoch | Nur Daten-Sheet (`Daten`) beschreiben; Formatierungen und Makros intakt lassen |
| Spaltenanforderungen ändern sich | Mittel | Mittel | Konfigurierbares Spalten-Mapping (JSON-Konfiguration pro Los) |
| Excel-Schreibzugriff auf geschützte Zellen | Gering | Niedrig | Entfällt — Ausgabe in separate Datei; Original wird nicht beschrieben |

---

## Phase 4: Optimierung & Erweiterung

**Ziel:** Produktivitätssteigerung, Georeferenzierung, Kartenvorschau.

### Meilenstein 4.1: Georeferenzierung

| # | Teilschritt | Details |
|---|-------------|---------|
| 4.1.1 | Ground-Control-Points (GCPs) | Nutzer wählt ≥ 3 Maste auf Karte + korrespondierende Punkte im PDF → `POST /oetm/georeference` |
| 4.1.2 | Affine-Transformation | Sidecar berechnet Transformationsmatrix → Blattschnitt als gedrehtes Rechteck statt BBOX |
| 4.1.3 | Validierung | Visueller Abgleich: transformierte PDF-Polygone auf Karte vs. reale Mast-Positionen |
| 4.1.4 | Batch-Georeferenzierung | Für alle Blattschnitte eines Loses: Maste aus Log + bekannte Koordinaten → automatische GCPs |

### Meilenstein 4.2: PDF-Viewer & Kartenvorschau

| # | Teilschritt | Details |
|---|-------------|---------|
| 4.2.1 | PDF-Viewer-Integration | PDF-Viewer (z. B. [lector-weld](https://lector-weld.vercel.app/docs/basic-usage)) im Right-Panel oder Floating-Panel einbinden. Rendert PDF client-seitig, ermöglicht visuelle Inspektion und interaktive Punktauswahl |
| 4.2.2 | Mast-Identifizierung im PDF | Nutzer klickt im PDF-Viewer auf Mast-Positionen → Pixelkoordinaten werden als GCPs für Georeferenzierung gesammelt |
| 4.2.3 | Georeferenzierte Rasterebene (optional) | Nach Georeferenzierung: PDF als georeferenzierte COG-/Raster-Ebene auf der Karte (`addCogLayer` nach GeoTIFF-Konvertierung via Sidecar) |
| 4.2.4 | Caching | Geladene PDFs im Plugin-State cachen (Blob-URLs) für schnellen Blattschnitt-Wechsel |

### Meilenstein 4.3: Multi-Los-Unterstützung

| # | Teilschritt | Details |
|---|-------------|---------|
| 4.3.1 | Los-Wechsel | Dropdown im Right-Panel zum Wechseln zwischen geladenen Losen |
| 4.3.2 | Layer-Gruppierung | `ÖTM-2006-Blattschnitte`, `ÖTM-2008-Blattschnitte` etc. als separate Layer-Gruppen |
| 4.3.3 | Übersichtskarte | Alle drei Lose parallel auf Karte → farbcodiert nach Los |

**Ressourcen Phase 4:**
- Aufwand: ca. 4–6 Arbeitstage

---

## Phase 5: Qualitätssicherung & Tests

### Meilenstein 5.1: Test-Suite

| # | Teilschritt | Details |
|---|-------------|---------|
| 5.1.1 | Unit-Tests: Parsing | Excel/Log/PDF-Parsing mit Beispieldateien aus `.oetm` |
| 5.1.2 | Unit-Tests: Daten-Modelle | `OetmLot`, `OetmSheet`, `OetmMast`, `OetmMeasure` — Erzeugung, Validierung, Serialisierung |
| 5.1.3 | Integrationstest: Sidecar | Mock-Sidecar oder echtes Sidecar → Endpunkte `oetm/sheet-bbox`, `oetm/georeference` |
| 5.1.4 | E2E-Test: Workflow | Playwright-Test: Los laden → Blattschnitte sichtbar → Status ändern → Maste filtern → Maßnahme zeichnen → Export |
| 5.1.5 | Test-Datensatz | Reduzierter `.oetm`-Extrakt (1 Los, 3 Blätter, 5 Maste) für CI/CI-Tests |

### Meilenstein 5.2: Dokumentation

| # | Teilschritt | Details |
|---|-------------|---------|
| 5.2.1 | Plugin-API-Doku | `docs/oetm-plugin.md` — Architektur, Datenfluss, Sidecar-API, Konfiguration |
| 5.2.2 | Benutzerhandbuch | `docs/oetm-user-guide.md` — Schritt-für-Schritt: Los laden, Status setzen, Maste prüfen, Maßnahmen erfassen, Export |
| 5.2.3 | Entwickler-Doku | `docs/oetm-dev.md` — Code-Struktur, Erweiterungspunkte, Bekannte Issues |

---

## Phase 6: Rollout & Pilotphase

### Meilenstein 6.1: Pilot-Los (2006 Köln)

| # | Teilschritt | Details |
|---|-------------|---------|
| 6.1.1 | Pilot-Durchlauf | Vollständiger Workflow mit `2006 Köln`: Laden → Status setzen → Maste prüfen → Maßnahmen erfassen → Export |
| 6.1.2 | Feedback-Erfassung | Strukturiertes Feedback vom Fachanwender: Was fehlt? Was ist umständlich? Was ist falsch? |
| 6.1.3 | Iteration | Feedback-Schleife: 2–3 Iterationen vor Rollout auf weitere Lose |

### Meilenstein 6.2: Rollout auf alle Lose

| # | Teilschritt | Details |
|---|-------------|---------|
| 6.2.1 | 2008 Düsseldorf-Neuss | Laden, prüfen, ggf. Anpassungen an Datenformat-Variationen |
| 6.2.2 | 2009 Mönchengladbach-Grevenbroich | Laden, prüfen (größtes Los, 118 Blattschnitte) |
| 6.2.3 | Stabilitäts-Check | Performance mit 3 Losen parallel (~280 Blattschnitte, ~400 Maste) |

---

## Zusammenfassung: Aufwandsschätzung

| Phase | Inhalt | Geschätzte Arbeitstage | Status |
|-------|--------|------------------------|--------|
| 0 | Vorbereitung & Infrastruktur | 5–7 (verbleibend: ~0,5–2,5) | 🟢 75% — 0.1 ✅, 0.2/0.3 ✅, 0.4 ✅ (außer 0.4.4) |
| 1 | MVP: Blattschnitte & Masten | 8–12 | 🟡 Phase 0-Voraussetzungen erfüllt — kann starten |
| 2 | Direkte Markierung & Maßnahmen (inkl. PDF-Import) | 6–10 | 🔲 offen |
| 3 | Auf-Abnahmeformular & Export | 5–8 | 🔲 offen |
| 4 | Optimierung & Erweiterung (PDF-Viewer, Georeferenzierung, Multi-Los) | 4–6 | 🔲 offen |
| 5 | Qualitätssicherung & Tests | 3–5 | 🔲 offen |
| 6 | Rollout & Pilotphase | 3–5 (nebenläufig) | 🔲 offen |
| **Summe** | | **35–53 AT** | **~7% erledigt** |

---

## Abhängigkeitsgraph

```
Phase 0 (Infrastruktur)
  ├── 0.1 Plugin-Grundgerüst ─────────────────────────────────────────────┐
  ├── 0.2 Excel-Parsing ──────────────────────────────────────────────────┤
  ├── 0.3 Log-Parsing ────────────────────────────────────────────────────┤
  ├── 0.4 Python-Sidecar ─────────────────────────────────────────────────┤
  └── 0.5 Auf-Abnahmeformular-Parser ─────────────────────────────────────┤
                                                                          │
Phase 1 (MVP) ◄───────────────────────────────────────────────────────────┘
  ├── 1.1 Los-Ladeprozess
  ├── 1.2 Blattschnitt-Layer
  ├── 1.3 Mast-Layer
  ├── 1.4 Statusmanagement
  └── 1.5 Excel-Integration (Mengengerüst)
      │
Phase 2 (Markierung) ◄────────────────────┘
  ├── 2.1 Zeichenwerkzeuge
  └── 2.2 Maßnahmen-Formular
      │
Phase 3 (Export) ◄────────────────────────┘
  ├── 3.1 Excel-Export
  ├── 3.2 Validierung & QA
  └── 3.3 Integrationstest

Phase 4 (Optimierung) ── unabhängig von Phase 2/3, kann parallel laufen
  ├── 4.1 Georeferenzierung
  ├── 4.2 Kartenvorschau
  └── 4.3 Multi-Los

Phase 5 (QS) ── begleitet alle Phasen
Phase 6 (Rollout) ── nach Phase 3
```

---

## Technischer Stack (definitiv)

| Komponente | Technologie | Begründung |
|------------|-------------|------------|
| Plugin-Framework | GeoLibre Plugin API (`GeoLibrePlugin`) | Vorgabe aus GOAL.md: plugin-zentriert |
| Karten-Rendering | MapLibre GL JS (via `addGeoJsonLayer`) | Bestandteil von GeoLibre |
| Zustandsverwaltung | Plugin-State (`getProjectState`/`applyProjectState`) + eigenes State-Objekt | Plugin-isoliert, serialisierbar |
| UI | DOM-basiert in Plugin-Panels (Right-Panel + Floating-Panel) | Plugin-API-Kontrakt |
| Excel-Parsing | `xlsx` npm package | Client-seitig, kein Server-Roundtrip |
| PDF-Analyse | PyMuPDF via Python-Sidecar (`/oetm/*`) + PDF-Viewer (lector-weld) client-seitig | Server: BBOX + Georeferenzierung; Client: visuelle Inspektion + GCP-Auswahl |
| Georeferenzierung | Affine-Transformation (Sidecar: `oetm/georeference`) | Nutzer-definierte GCPs aus PDF-Viewer + Mast-Koordinaten |
| Flächenberechnung | `@turf/turf` (bereits im Projekt) | Geometrie-Operationen client-seitig |
| Log-Parsing | Regex (TypeScript) | Strukturierte Textdateien, client-seitig |
| Tests | Node Test Runner + Playwright + pytest | Bestehende Test-Infrastruktur |

---

## Offene Entscheidungspunkte

Diese müssen vor oder während der Implementierung geklärt werden (siehe auch GOAL.md Abschnitt 7):

1. **Blattschnitt-Geometrie: BBOX (konvexe Hülle) vs. PDF-Vektor-Polygon vs. georeferenzierte Umrandung?** → Für MVP: konvexe Hülle der zugeordneten Maste; später PDF-Analyse via Sidecar + Georeferenzierung.
2. **Status-Werte final?** Vorschlag: `offen`, `in-arbeit`, `kontrolliert`, `abgenommen` — mit Fachseite abstimmen.
3. **Maststandortpflege-Status: Ursprung?** → Mengengerüst enthält kein Status-Feld. Initialisierung auf `false` (Default); manuelle Setzung durch Nutzer im Mast-Info-Panel.
4. **PDF-Integration: Viewer vs. PNG?** → PDF-Viewer (lector-weld) für visuelle Inspektion + interaktive GCP-Auswahl. Kein serverseitiges PNG-Rendering nötig.
5. **Plugin als built-in oder external/bundled?** → Empfehlung: **built-in** während Entwicklung (schneller Iterationszyklus, kein CSP-Management), später als **bundled drop-in** (`public/plugins/oetm-workflow/`) für saubere Trennung vom GeoLibre-Core.
6. **Excel-Ausgabe: Original überschreiben oder separate Datei?** → Separate Datei (`Auf-Abnahmeformular_<Los>_ausgefuellt.xlsx`). Original-Template bleibt unverändert.
7. **Mehrbenutzerfähigkeit?** → Aktuell nicht im Scope (Nicht-Ziel: Big-Bang-Rollout).
8. **Erweiterbarkeit für Fremd-Lose (Amprion)?** → Typen vorbereitet (`lotSource`, `lotName` frei definierbar). Manuelle Mast-Auswahl + Los-Name für nicht-Westnetz-Masten.
9. **LP-Dokumente und Übersichtskarten?** → Werden beim Laden ignoriert. Nur `ÖTM-*.PDF` als Blattschnitte behandelt.
10. **Maßnahmen-Typen: Welche Felder sind je Typ Pflicht?** → Flächen-Maßnahmen: % + m². Stück-Maßnahmen: St. Linien-Maßnahmen: Länge + Breite → Größe. Typ-Erkennung über befüllte Felder.

---

## Branch-Namenskonvention

**Präfix:** `oetm/`

**Schema:** `oetm/<phase>-<beschreibung>`

| Branch | Phase | Beschreibung | Status |
|--------|-------|-------------|--------|
| `oetm/phase-0-infrastructure` | 0 | Plugin-Grundgerüst, Sidecar-Router, Excel/Log-Parsing | 🟡 aktiv |

**Regeln:**
- Ein Branch pro Phase (nicht pro Meilenstein), damit zusammengehörige Arbeit nicht über mehrere Branches verstreut wird.
- Branch-Name spiegelt den **tatsächlichen** Inhalt wider, nicht den ursprünglichen Planungsumfang.
- Bei Scope-Erweiterung: Branch umbenennen (`git branch -m <neuer-name>`), nicht neuen Branch anlegen.
- Vor Push: Branch-Name gegen die Konvention prüfen.

---

## Nächste Schritte (unmittelbar)

1. **~~Entscheidungen treffen~~** → Fachliche Klärung läuft parallel, blockiert Implementierung nicht.
2. **~~Phase 0 starten~~** → Meilenstein 0.1 (Plugin-Grundgerüst) ✅ abgeschlossen.
3. **~~Phase 0.4 Sidecar-Router~~** → ✅ abgeschlossen.
4. **~~Phase 0.2/0.3 Client-Parsing~~** → ✅ abgeschlossen (`oetm-parser.ts`: Mengengerüst-Excel, Log-Dateien, Mast-ID-Konstruktion, GeoJSON-Erzeugung, Los-Ladefunktion (`loadLot()`)).
5. **Phase 1 starten (jetzt):**
   - **1.1 Los-Ladeprozess:** Tauri-Dialog/Filesystem-API → `loadLot()` aufrufen → Layer auf Karte erzeugen.
   - **1.2 Blattschnitt-Layer:** Aus `OetmSheet[]` → GeoJSON-Polygone erstellen.
   - **1.3 Mast-Layer:** `mastsToGeoJson()` → Layer auf Karte via `app.addGeoJsonLayer()`.
   - **1.4 Statusmanagement:** Status-UI im Right-Panel mit Dropdown + Persistenz.
6. **Phase 0.5 Auf-Abnahmeformular:** `parseAufAbnahmeForm()` Grundstruktur vorhanden — Schreibfunktion fehlt noch.
7. **MVP-Demo vorbereiten:** Sobald Blattschnitte und Maste auf Karte sichtbar sind → Demo mit Fachseite.

---

## Anhang A: Referenz-Datenbasis (`.oetm`)

**Daten-Root:** `C:\Users\randanplan\repos\.oetm`

### A.1 Datei-Übersicht pro Los

| Los | Saison-Ordner | XLSX (Mengengerüst) | XLSX (Auf-Abnahme) | Log | ÖTM-PDFs | LP-PDFs | Gesamt |
|-----|--------------|---------------------|---------------------|-----|----------|---------|--------|
| 2006 Köln | `2006 Köln\2026-27\` | `Mengengerüst_2006_Köln.xlsx` | `Auf-Abnahmeformular_26-27.xlsx` | `Log_2006_Köln.log` | 87 | 4 | 93 |
| 2008 Düsseldorf-Neuss | `2008 Düsseldorf-Neuss\2026-27\` | `Mengengerüst_2008_Düsseldorf-Neuss.xlsx` | `Auf-Abnahmeformular_26-27.xlsx` | `Log_2008_Düsseldorf-Neuss.log` | 81 | 10 | 94 |
| 2009 Mönchengladbach-Grevenbroich | `2009 Mönchengladbach-Grevenbroich\2026-27\` | `Mengengerüst_2009_Mönchengladbach-Grevenbroich.xlsx` | `Auf-Abnahmeformular_26-27.xlsx` | `Log_2009_Mönchengladbach-Grevenbroich.log` | 117 | 1 | 120 |

### A.2 Zentrale Referenzdateien (volle Pfade)

**Root-Referenz:**
- `C:\Users\randanplan\repos\.oetm\Beschreibung - Aufnahme- & Abnahmeformular.pdf`

**Los 2006 Köln:**
- `C:\Users\randanplan\repos\.oetm\2006 Köln\2026-27\Mengengerüst_2006_Köln.xlsx`
- `C:\Users\randanplan\repos\.oetm\2006 Köln\2026-27\Auf-Abnahmeformular_26-27.xlsx`
- `C:\Users\randanplan\repos\.oetm\2006 Köln\2026-27\Pläne\2006 Köln\Log_2006_Köln.log`
- Beispiel-PDF: `C:\Users\randanplan\repos\.oetm\2006 Köln\2026-27\Pläne\2006 Köln\ÖTM-2006 Köln-0001.PDF`
- LP (ausschließen): `C:\Users\randanplan\repos\.oetm\2006 Köln\2026-27\Pläne\2006 Köln\LP-0015-0001.PDF`

**Los 2008 Düsseldorf-Neuss:**
- `C:\Users\randanplan\repos\.oetm\2008 Düsseldorf-Neuss\2026-27\Mengengerüst_2008_Düsseldorf-Neuss.xlsx`
- `C:\Users\randanplan\repos\.oetm\2008 Düsseldorf-Neuss\2026-27\Auf-Abnahmeformular_26-27.xlsx`
- `C:\Users\randanplan\repos\.oetm\2008 Düsseldorf-Neuss\2026-27\Pläne\2008 Düsseldorf-Neuss\Log_2008_Düsseldorf-Neuss.log`
- Beispiel-PDF: `C:\Users\randanplan\repos\.oetm\2008 Düsseldorf-Neuss\2026-27\Pläne\2008 Düsseldorf-Neuss\ÖTM-2008 Düsseldorf-Neuss-0001.PDF`

**Los 2009 Mönchengladbach-Grevenbroich (größtes Los):**
- `C:\Users\randanplan\repos\.oetm\2009 Mönchengladbach-Grevenbroich\2026-27\Mengengerüst_2009_Mönchengladbach-Grevenbroich.xlsx`
- `C:\Users\randanplan\repos\.oetm\2009 Mönchengladbach-Grevenbroich\2026-27\Auf-Abnahmeformular_26-27.xlsx`
- `C:\Users\randanplan\repos\.oetm\2009 Mönchengladbach-Grevenbroich\2026-27\Pläne\2009 Mönchengladbach-Grevenbroich\Log_2009_Mönchengladbach-Grevenbroich.log`
- Beispiel-PDF: `C:\Users\randanplan\repos\.oetm\2009 Mönchengladbach-Grevenbroich\2026-27\Pläne\2009 Mönchengladbach-Grevenbroich\ÖTM-2009 Mönchengladbach-Grevenbroich-0001.PDF`

### A.3 Ordnernamenskonventionen

```
.oetm/
├── Beschreibung - Aufnahme- & Abnahmeformular.pdf    (Referenzdokument)
├── <Los-Nr> <Los-Name>/                              (z.B. "2006 Köln")
│   └── <Saison>/                                     (z.B. "2026-27")
│       ├── Mengengerüst_<Los-Nr>_<Los-Name>.xlsx
│       ├── Auf-Abnahmeformular_<Saison>.xlsx
│       └── Pläne/
│           └── <Los-Nr> <Los-Name>/
│               ├── Log_<Los-Nr>_<Los-Name>.log
│               ├── ÖTM-<Los-Nr> <Los-Name>-<Blatt-Nr>.PDF   (Blattschnitte)
│               ├── LP-<BL-Nr>-<Code>.PDF                    (Lagepläne → ignorieren)
│               └── OETM_LOSBLATT-*.PDF                      (Übersichtskarte → ignorieren, falls vorhanden)
```

### A.4 Nummerierungslücken

Blattschnitt-Nummern sind nicht lückenlos (Log bestätigt ebenfalls Lücken):

| Los | Fehlende Nummern |
|-----|------------------|
| 2006 Köln | 0014, 0063, 0065–0074, 0078–0081, 0086–0093, 0095–0102, 0114, 0116–0121, 0123, 0125–0130 |
| 2008 Düsseldorf-Neuss | 0063–0068, 0085–0099, 0101 |
| 2009 Mönchengladbach-Grevenbroich | 0005, 0081 |

> **Hinweis für Parser:** Blattschnitt-Liste aus Dateinamen ermitteln, nicht aus fortlaufender Nummerierung ableiten. Log-Einträge als Validierung verwenden.

---

## Anhang B: Bestehende Analyse-Skripte

Die folgenden Skripte liegen bereits im Repository vor und liefern wesentliche Vorarbeit:

### B.1 `scripts/oetm_pdf_extractor.py`

**Zweck:** Extraktion der vier festen Layout-Bereiche aus ÖTM-Blattschnitt-PDFs.

**Bereits implementierte Funktionen:**
| Funktion | Beschreibung |
|----------|-------------|
| `get_layout(page)` | Berechnet die 4 Bereichs-Rects aus den festen Layout-Konstanten |
| `extract_text_by_region(page, layout)` | Extrahiert Rohtext je Bereich |
| `extract_blocks_by_region(page, layout)` | Extrahiert strukturierte Textblöcke mit Koordinaten |
| `render_region_to_png(page, rect, dpi)` | Rendert einen Bereich als PNG-Bytes |
| `analyse_detail_table(page, layout)` | Parst die Detail-Informationen-Tabelle (Typ, Nr., Fläche qm, Pflege %/St., Aufarbeitungsform) |

**Layout-Konstanten (in pt, Abstand von rechter Seitenkante):**
- `KARTENTRENNER_R = 1572` — Trennlinie Karte ↔ Infopanels
- `LEGENDE_R = 1014` — linke Kante Detail-Informationen
- `DETAIL_R = 453` — linke Kante Titelblock
- `INNENRAHMEN_L = 71`, `INNENRAHMEN_T = 14`, `INNENRAHMEN_B = 828` — Karteninnenrahmen

### B.2 `scripts/oetm_pdf_explore.py`

**Zweck:** Layout-Erkundungsskript, das die Layout-Konstanten aus den PDFs abgeleitet hat.

**Anker-Texte (in allen PDFs vorhanden):** `Detail-Informationen`, `1:2000`, `Ökologischer Trassenmanagementplan`, `westnetz`, `Blatt`, `Pflege/Pflegeeinheit`, `Maßnahmen/Maßnahmenkatalog/Naturschutzpflegefläche`

**Erkenntnisse aus der Exploration:**
- Seitenhöhe konstant 841.6 pt (A1-Querformat)
- Seitenbreite variiert je Leitungsabschnittslänge
- Alle rechten Panels sind FEST vom rechten Rand positioniert
- Vertikale Trennlinien zwischen den Panels als Zeichnungsobjekte vorhanden

### B.3 Integration in die Sidecar-Architektur

Die Kernlogik wurde in das `geolibre_server`-Package verschoben, sodass der
Router sie mit relativem Import laden kann — unabhängig vom Deployment-Szenario
(Source-Tree, Docker, Wheel-Installation):

```
backend/geolibre_server/geolibre_server/app/oetm.py           ← Sidecar-Router (Endpunkte)
backend/geolibre_server/geolibre_server/app/oetm_extractor.py ← Layout-Extraktion (Kernlogik)
scripts/oetm_pdf_extractor.py                                 ← Standalone-Demo-Wrapper (re-exportiert aus Package, mit Fallback)
scripts/oetm_pdf_explore.py                                   ← Layout-Erkundung (Referenz)
```

Die ursprüngliche `sys.path`-Manipulation in `oetm.py` wurde durch einen
relativen Import (``from . import oetm_extractor``) ersetzt. Die
`scripts/`-Version existiert weiterhin als Convenience-Wrapper für die
Standalone-Demo (``python scripts/oetm_pdf_extractor.py``).
