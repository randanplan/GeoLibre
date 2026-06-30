# ÖTM-PDF Layout-Analyse

> Stand: 2026-06-30  
> Analysiert: 3 ÖTM-Blattschnitt-PDFs (Los 2006, 2008, 2009) mit PyMuPDF 1.27.2  
> Skripte: [`scripts/oetm_pdf_explore.py`](../scripts/oetm_pdf_explore.py), [`scripts/oetm_pdf_extractor.py`](../scripts/oetm_pdf_extractor.py)

---

## 1  Erkenntnisse auf einen Blick

| Eigenschaft         | Wert                                                           |
| ------------------- | -------------------------------------------------------------- |
| Seitenhöhe          | **841,6 pt = 296,9 mm** (konstant, alle PDFs)                  |
| Seitenbreite        | **variabel** – abhängig von der Leitungsabschnittslänge        |
| Koordinatensystem   | PDF-Punkte (1 pt = 1/72 Zoll = 0,353 mm), Ursprung oben links  |
| Rechte Panels       | **fest** – immer exakt vom rechten Seitenrand aus positioniert |
| Linker Kartenrahmen | **71 pt** vom linken Rand (Innenrahmen)                        |

---

## 2  Gemessene Seitenbreiten der drei Testdokumente

| Los                               | Blatt | Seitenbreite (pt) | Seitenbreite (mm) |
| --------------------------------- | ----- | ----------------: | ----------------: |
| 2009 Mönchengladbach-Grevenbroich | 10    |           4 002,3 |           1 411,9 |
| 2006 Köln                         | 1     |           4 264,4 |           1 504,4 |
| 2008 Düsseldorf-Neuss             | 1     |           3 740,2 |           1 319,4 |

Die Hauptkarte macht je nach Blatt **60–65 % der Seitenbreite** aus.

---

## 3  Layout-Bereiche

Das Dokument ist horizontal in vier feste Bereiche unterteilt. Die rechten drei Panels haben **absolut gleiche Abstände vom rechten Seitenrand** in allen geprüften PDFs.

```
 ┌───────────────────────────────────────┬──────────────┬───────────────┬────────────┐
 │                                       │              │               │            │
 │            HAUPTKARTE                 │   LEGENDE    │ DETAIL-INFO   │ TITELBLOCK │
 │          (variable Breite)            │  (≈197 mm)   │  (≈198 mm)    │ (≈160 mm)  │
 │                                       │              │               │            │
 └───────────────────────────────────────┴──────────────┴───────────────┴────────────┘
 x=71 pt                             x=pageW-1572  x=pageW-1014  x=pageW-453   x=pageW
```

### 3.1  Layout-Konstanten (pt, Abstand vom rechten Rand)

| Konstante         | Wert (pt) | Wert (mm) | Bedeutung                                |
| ----------------- | --------: | --------: | ---------------------------------------- |
| `KARTENTRENNER_R` |     1 572 |     554,7 | Vertikale Trennlinie: Karte ↔ Infopanels |
| `LEGENDE_R`       |     1 014 |     357,7 | Grenze Legende ↔ Detail-Informationen    |
| `DETAIL_R`        |       453 |     159,8 | Grenze Detail ↔ Titelblock               |
| `INNENRAHMEN_L`   |        71 |      25,0 | Linker Kartenrahmen                      |
| `INNENRAHMEN_T`   |        14 |       4,9 | Oberer Kartenrahmen                      |
| `INNENRAHMEN_B`   |       828 |     292,0 | Unterer Kartenrahmen                     |

> **Validierung:** Die Werte wurden an allen drei PDFs geprüft – Abweichung < 1 pt.

### 3.2  Bereichsdimensionen (fest, alle PDFs identisch)

| Bereich              | Breite (pt) | Breite (mm) | Höhe (mm) | Inhalt                                                        |
| -------------------- | ----------: | ----------: | --------: | ------------------------------------------------------------- |
| Legende              |         558 |       196,8 |     287,2 | Maßnahmen-Symbole + Legendentexte                             |
| Detail-Informationen |         561 |       197,9 |     287,2 | Tabelle: Typ / Nr. / Fläche / Pflege / Aufarbeitungsform      |
| Titelblock           |         453 |       159,8 |     287,2 | westnetz-Logo, Leitungsname, Mast-Bereich, Metadaten, Maßstab |
| Hauptkarte           |    variabel |    variabel |     287,2 | Topographische Karte mit ÖTM-Flächen                          |

### 3.3  Gemessene absolute Koordinaten je Testdokument

#### Los 2009 MG-Grevenbroich – Blatt 10 (pageW = 4 002,3 pt)

| Bereich     |      x0 |   y0 |      x1 |    y1 | Breite (mm) |
| ----------- | ------: | ---: | ------: | ----: | ----------: |
| Hauptkarte  |    71,0 | 14,0 | 2 430,3 | 828,0 |       832,3 |
| Legende     | 2 430,3 | 14,0 | 2 988,3 | 828,0 |       196,8 |
| Detail-Info | 2 988,3 | 14,0 | 3 549,3 | 828,0 |       197,9 |
| Titelblock  | 3 549,3 | 14,0 | 4 002,3 | 828,0 |       159,8 |

#### Los 2006 Köln – Blatt 1 (pageW = 4 264,4 pt)

| Bereich     |      x0 |   y0 |      x1 |    y1 | Breite (mm) |
| ----------- | ------: | ---: | ------: | ----: | ----------: |
| Hauptkarte  |    71,0 | 14,0 | 2 692,4 | 828,0 |       924,8 |
| Legende     | 2 692,4 | 14,0 | 3 250,4 | 828,0 |       196,8 |
| Detail-Info | 3 250,4 | 14,0 | 3 811,4 | 828,0 |       197,9 |
| Titelblock  | 3 811,4 | 14,0 | 4 264,4 | 828,0 |       159,8 |

#### Los 2008 Düsseldorf-Neuss – Blatt 1 (pageW = 3 740,2 pt)

| Bereich     |      x0 |   y0 |      x1 |    y1 | Breite (mm) |
| ----------- | ------: | ---: | ------: | ----: | ----------: |
| Hauptkarte  |    71,0 | 14,0 | 2 168,2 | 828,0 |       739,8 |
| Legende     | 2 168,2 | 14,0 | 2 726,2 | 828,0 |       196,8 |
| Detail-Info | 2 726,2 | 14,0 | 3 287,2 | 828,0 |       197,9 |
| Titelblock  | 3 287,2 | 14,0 | 3 740,2 | 828,0 |       159,8 |

---

## 4  Erkannte vertikale Trennlinien (Vektorgrafik-Objekte)

PyMuPDF erkennt die Kartentrennlinie als schmales, hohes Zeichnungsobjekt:

| Los       | x-Position (pt) | Länge (pt) | Abstand vom rechten Rand (pt) |
| --------- | --------------: | ---------: | ----------------------------: |
| 2009 MG   |           2 430 |        814 |                       1 572 ✓ |
| 2006 Köln |           2 692 |        813 |                       1 572 ✓ |
| 2008 D-N  |           2 168 |        813 |                       1 572 ✓ |

> Die Trennlinie kann alternativ zur text-basierten Anker-Suche als robuster geometrischer Anker genutzt werden.

---

## 5  Text-Extraktion je Bereich

### 5.1  Titelblock – extrahierte Metadaten

Zuverlässig extrahierbare Felder:

| Feld              | Beispiel (2009 Blatt 10)                                      | Regex / Ankerpunkt                        |
| ----------------- | ------------------------------------------------------------- | ----------------------------------------- |
| Los-Nummer + Name | `Los 2009 Mönchengladbach-Grevenbroich`                       | `Los \d{4} .+`                            |
| Blatt-Nummer      | `Blatt 10`                                                    | `Blatt \d+`                               |
| Leitungsname      | `110-kV-Hochspannungsfreileitung\nDülken - Erftwerk, Bl.0003` | nach `WESTNETZ`                           |
| Abschnitt         | `Abschnitt: Speick - Pkt. Odenkirchen`                        | `Abschnitt: .+`                           |
| Mast-Bereich      | `von Mast Nr. 1129 bis Mast Nr. 1136`                         | `von Mast Nr\. (\S+) bis Mast Nr\. (\S+)` |
| Maßstab           | `1:2000`                                                      | `1:\d+`                                   |
| Referenzplan      | `Referenzplan: LP000300`                                      | `Referenzplan: (\S+)`                     |
| Ort / Gemeinde    | `Mönchengladbach`                                             | Zeilenweise nach Abschnitt                |

> **Hinweis:** Einige Textfragmente erscheinen abgeschnitten (z. B. `egeplan` statt `Trassenmanagementplan`). Dies entsteht, weil Text-Objekte im PDF-Layer die Bereichsgrenze überschreiten. Für Metadaten-Extraktion ist der vollständige Text ohne `clip` zu empfehlen und die Felder durch Regex aus dem Gesamttext zu extrahieren.

### 5.2  Detail-Informationen – Tabellen-Struktur

Die Tabelle hat 5 Spalten mit diesen ungefähren x-Offsets relativ zur linken Kante des Detail-Panels:

| Spalte            | x-Offset (pt, relativ) | Inhalt                                 |
| ----------------- | ---------------------: | -------------------------------------- |
| Typ               |                   0–40 | Buchstaben-Code (A, C, CX, CY, D, E …) |
| Nr.               |                  40–80 | Nummer der Pflegeeinheit               |
| Fläche (qm)       |                 80–200 | Flächengröße in qm                     |
| Pflege (%/St.)    |                200–300 | Prozentwert oder Stückzahl             |
| Aufarbeitungsform |                300–561 | Beschreibungstext                      |

> Die Spalten-Positionen sind relativ zur linken Panel-Kante (`pageW - LEGENDE_R`) konstant.

### 5.3  Legende – Farb-Maßnahmen

Die Legende enthält die Zuordnung von Farbe/Schraffur zu Maßnahmentyp. Text-Extraktion liefert den beschreibenden Text zuverlässig; die zugehörigen Farbflächen sind als Vektorobjekte (`get_drawings()`) extrahierbar.

---

## 6  PyMuPDF-Code: Bereichs-Extraktion

```python
import fitz

# Layout-Konstanten (pt, Abstand vom rechten Rand)
KARTENTRENNER_R = 1572
LEGENDE_R       = 1014
DETAIL_R        =  453
INNENRAHMEN_L   =   71
INNENRAHMEN_T   =   14
INNENRAHMEN_B   =  828

def get_regions(page: fitz.Page) -> dict[str, fitz.Rect]:
    """Gibt die vier Layout-Bereiche als fitz.Rect zurück."""
    pw = page.rect.width
    y0, y1 = INNENRAHMEN_T, INNENRAHMEN_B
    return {
        "hauptkarte":  fitz.Rect(INNENRAHMEN_L,        y0, pw - KARTENTRENNER_R, y1),
        "legende":     fitz.Rect(pw - KARTENTRENNER_R, y0, pw - LEGENDE_R,       y1),
        "detail_info": fitz.Rect(pw - LEGENDE_R,        y0, pw - DETAIL_R,       y1),
        "titelblock":  fitz.Rect(pw - DETAIL_R,         y0, pw,                  y1),
    }

def extract_titelblock(page: fitz.Page) -> dict:
    """Extrahiert Metadaten aus dem Titelblock."""
    import re
    # Gesamter Seitentext (kein clip) für vollständige Strings
    full_text = page.get_text("text")
    result = {}
    m = re.search(r"Los (\d{4}) (.+)", full_text)
    if m:
        result["los_nummer"] = m.group(1)
        result["los_name"]   = m.group(2).strip()
    m = re.search(r"Blatt (\d+)", full_text)
    if m:
        result["blatt"] = int(m.group(1))
    m = re.search(r"Abschnitt: (.+)", full_text)
    if m:
        result["abschnitt"] = m.group(1).strip()
    m = re.search(r"von Mast Nr\. (\S+) bis Mast Nr\. (\S+)", full_text)
    if m:
        result["mast_von"] = m.group(1)
        result["mast_bis"] = m.group(2)
    m = re.search(r"Referenzplan: (\S+)", full_text)
    if m:
        result["referenzplan"] = m.group(1)
    m = re.search(r"(1:\d+)", full_text)
    if m:
        result["massstab"] = m.group(1)
    return result

def render_region(page: fitz.Page, rect: fitz.Rect, dpi: int = 150) -> bytes:
    """Rendert einen Bereich als PNG-Bytes."""
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, clip=fitz.IRect(rect))
    return pix.tobytes("png")

# Beispiel-Nutzung:
doc = fitz.open("ÖTM-2009 Mönchengladbach-Grevenbroich-0010.PDF")
page = doc[0]
regions = get_regions(page)
meta = extract_titelblock(page)
print(meta)
# {'los_nummer': '2009', 'los_name': 'Mönchengladbach-Grevenbroich',
#  'blatt': 10, 'abschnitt': 'Speick - Pkt. Odenkirchen',
#  'mast_von': '1129', 'mast_bis': '1136', 'massstab': '1:2000'}

# Region als PNG für Debugging:
png_bytes = render_region(page, regions["titelblock"])
```

---

## 7  Sidecar-Endpunkte (geplant)

Basierend auf dieser Analyse werden folgende FastAPI-Endpunkte in `backend/geolibre_server/geolibre_server/app/oetm.py` implementiert:

### `POST /oetm/sheet-info`

Liest Metadaten und Tabellendaten aus einem Blattschnitt-PDF.

**Request:**
```json
{ "pdf_path": "/data/2009 MG/ÖTM-2009...-0010.PDF" }
```

**Response:**
```json
{
  "los_nummer": "2009",
  "los_name": "Mönchengladbach-Grevenbroich",
  "blatt": 10,
  "abschnitt": "Speick - Pkt. Odenkirchen",
  "mast_von": "1129",
  "mast_bis": "1136",
  "massstab": "1:2000",
  "referenzplan": "LP000300",
  "page_width_pt": 4002.3,
  "page_height_pt": 841.6,
  "layout": {
    "hauptkarte":  { "x0": 71,   "y0": 14, "x1": 2430, "y1": 828 },
    "legende":     { "x0": 2430, "y0": 14, "x1": 2988, "y1": 828 },
    "detail_info": { "x0": 2988, "y0": 14, "x1": 3549, "y1": 828 },
    "titelblock":  { "x0": 3549, "y0": 14, "x1": 4002, "y1": 828 }
  },
  "detail_rows": [
    { "typ": "A", "nr": "9", "flaeche_qm": 628.9, "pflege": "100", "aufarbeitungsform": "..." }
  ]
}
```

### `POST /oetm/render-region`

Rendert einen Bereich als PNG (für PDF-Viewer-Überlagerung und GCP-Auswahl).

**Request:**
```json
{
  "pdf_path": "/data/...",
  "region": "hauptkarte",
  "dpi": 150
}
```

**Response:** `image/png`

### `POST /oetm/georeference`

Nimmt Mast-GCPs (Pixelkoordinaten im PDF + WGS84-Koordinaten) und gibt die Affin-Transformation zurück. → Siehe Meilenstein 4.1 im IMPLEMENTATION_PLAN.

---

## 8  Bekannte Einschränkungen

| Problem                                                             | Ursache                                                          | Workaround                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| Abgeschnittene Titelblock-Strings (z. B. `egeplan`)                 | Text-Objekte überschreiten Panel-Grenze                          | Regex auf Gesamttext ohne `clip` anwenden                      |
| Detail-Tabelle: Spalten-Reihenfolge im Text nicht immer sequenziell | PDF-Text-Order entspricht nicht der visuellen Spaltenreihenfolge | x-Offsets für Spalten-Zuordnung nutzen (Offset-Tabelle in 5.2) |
| Legende: Farbflächen nicht als Text                                 | Farb-Rechtecke sind Vektorobjekte                                | `page.get_drawings()` für Farbextraktion                       |
| Textblöcke mit mehreren Zeilen in einer Zelle                       | PDF gruppiert benachbarte Felder                                 | `sort=True` + y-Toleranz (±3 pt) für Zeilengruppierung         |

---

## 9  Nächste Schritte

- [ ] **0.4.1–0.4.3** Python-Sidecar-Endpunkte implementieren (basierend auf Abschnitt 7)  
- [ ] Spalten-Parsing der Detail-Tabelle verfeinern (Abschnitt 5.2, x-Offset-Kalibrierung)  
- [ ] Farbextraktion aus Legende via `get_drawings()` → Maßnahmen-Farbcodierung für Layer-Styling  
- [ ] `extract_titelblock()` gegen alle 285 Blattschnitte (3 Lose) validieren  
- [ ] Georeferenzierungs-Prototyp: Mast-Koordinaten aus Mengengerüst als GCPs → `POST /oetm/georeference`
