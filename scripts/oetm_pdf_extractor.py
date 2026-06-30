"""
Standalone-Demo-Runner für den ÖTM-PDF-Extraktor.

Die Kernlogik lebt in ``geolibre_server.app.oetm_extractor`` (Teil des
``geolibre_server``-Packages). Diese Datei existiert als Convenience-Wrapper,
damit ``python scripts/oetm_pdf_extractor.py`` die Demo ausführen kann, ohne
das Package installieren zu müssen.

Wird das Package importiert (z.B. über ``pip install -e backend/geolibre_server``),
importiert diese Datei die Logik aus dem Package. Andernfalls fällt sie auf
die direkte lokale Definition zurück (nur für Standalone-Demo).
"""
import sys
import os
from pathlib import Path

# Versuche den import aus dem installierten Package. Klappt das nicht,
# importiere die lokale Kopie (Standalone-Demo-Modus).
try:
    _PACKAGE_ROOT = Path(__file__).resolve().parents[1] / "backend" / "geolibre_server"
    if str(_PACKAGE_ROOT) not in sys.path:
        sys.path.insert(0, str(_PACKAGE_ROOT))
    from geolibre_server.app.oetm_extractor import (  # noqa: E402, F401
        OetmPageLayout,
        OetmSheetMetadata,
        get_layout,
        extract_text_by_region,
        extract_blocks_by_region,
        render_region_to_png,
        extract_sheet_metadata,
        extract_legend_entries,
        find_mast_symbols_in_map,
        analyse_detail_table,
        KARTENTRENNER_R,
        LEGENDE_R,
        DETAIL_R,
        INNENRAHMEN_L,
        INNENRAHMEN_T,
        INNENRAHMEN_B,
    )
except ImportError:
    # Package not installed — provide local definitions (same as oetm_extractor.py).
    import fitz  # PyMuPDF
    from dataclasses import dataclass, field
    from typing import Optional
    import json
    import re

    # ── Layout-Konstanten (pt, vom rechten Rand) ────────────────────────────────
    KARTENTRENNER_R = 1572
    LEGENDE_R       = 1014
    DETAIL_R        =  453
    INNENRAHMEN_L   =   71
    INNENRAHMEN_T   =   14
    INNENRAHMEN_B   =  828

    @dataclass
    class OetmPageLayout:
        page_width: float
        page_height: float
        hauptkarte: fitz.Rect
        legende: fitz.Rect
        detail_info: fitz.Rect
        titelblock: fitz.Rect

        def to_dict(self) -> dict:
            def r(rect):
                return {"x0": round(rect.x0, 1), "y0": round(rect.y0, 1),
                        "x1": round(rect.x1, 1), "y1": round(rect.y1, 1),
                        "width_mm": round(rect.width / 72 * 25.4, 1),
                        "height_mm": round(rect.height / 72 * 25.4, 1)}
            return {
                "page_width_mm": round(self.page_width / 72 * 25.4, 1),
                "page_height_mm": round(self.page_height / 72 * 25.4, 1),
                "hauptkarte": r(self.hauptkarte),
                "legende": r(self.legende),
                "detail_info": r(self.detail_info),
                "titelblock": r(self.titelblock),
            }

    @dataclass
    class OetmSheetMetadata:
        blatt_nummer: Optional[str] = None
        los_bezeichnung: Optional[str] = None
        massstab: Optional[str] = None
        planart: Optional[str] = None
        auftraggeber: Optional[str] = None
        leitungsname: Optional[str] = None
        bauleitung: Optional[str] = None
        datum: Optional[str] = None
        rohtext: list[str] = field(default_factory=list)

        def to_dict(self) -> dict:
            return {
                "blatt_nummer": self.blatt_nummer,
                "los_bezeichnung": self.los_bezeichnung,
                "massstab": self.massstab,
                "planart": self.planart,
                "auftraggeber": self.auftraggeber,
                "leitungsname": self.leitungsname,
                "bauleitung": self.bauleitung,
                "datum": self.datum,
            }

    def get_layout(page: fitz.Page) -> OetmPageLayout:
        pw = page.rect.width
        ph = page.rect.height
        y0, y1 = INNENRAHMEN_T, INNENRAHMEN_B
        hauptkarte  = fitz.Rect(INNENRAHMEN_L,        y0, pw - KARTENTRENNER_R, y1)
        legende     = fitz.Rect(pw - KARTENTRENNER_R, y0, pw - LEGENDE_R,       y1)
        detail_info = fitz.Rect(pw - LEGENDE_R,        y0, pw - DETAIL_R,       y1)
        titelblock  = fitz.Rect(pw - DETAIL_R,         y0, pw,                  y1)
        return OetmPageLayout(page_width=pw, page_height=ph,
                              hauptkarte=hauptkarte, legende=legende,
                              detail_info=detail_info, titelblock=titelblock)

    def extract_text_by_region(page: fitz.Page, layout: OetmPageLayout) -> dict:
        return {
            "hauptkarte": page.get_text("text", clip=layout.hauptkarte).strip(),
            "legende":    page.get_text("text", clip=layout.legende).strip(),
            "detail_info": page.get_text("text", clip=layout.detail_info).strip(),
            "titelblock": page.get_text("text", clip=layout.titelblock).strip(),
        }

    def extract_blocks_by_region(page: fitz.Page, layout: OetmPageLayout) -> dict:
        result = {}
        for name, rect in [("hauptkarte", layout.hauptkarte), ("legende", layout.legende),
                           ("detail_info", layout.detail_info), ("titelblock", layout.titelblock)]:
            blocks = page.get_text("blocks", clip=rect, sort=True)
            result[name] = [{"x0": round(b[0],1), "y0": round(b[1],1),
                             "x1": round(b[2],1), "y1": round(b[3],1),
                             "text": b[4].strip()} for b in blocks if b[4].strip()]
        return result

    def render_region_to_png(page: fitz.Page, rect: fitz.Rect, dpi: int = 150) -> bytes:
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        clip = fitz.IRect(rect)
        pix = page.get_pixmap(matrix=mat, clip=clip)
        return pix.tobytes("png")

    def extract_sheet_metadata(page: fitz.Page, layout: OetmPageLayout) -> OetmSheetMetadata:
        meta = OetmSheetMetadata()
        text = page.get_text("text", clip=layout.titelblock)
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        meta.rohtext = lines
        for line in lines:
            if "ökologischer" in line.lower() and "trassenmanagement" in line.lower():
                meta.planart = line
            elif "westnetz" in line.lower():
                meta.auftraggeber = "westnetz"
            elif re.match(r"^\d{4}\s", line):
                meta.los_bezeichnung = line
            elif " - " in line and not re.match(r"^\d", line) and "maßstab" not in line.lower():
                meta.leitungsname = line
            elif re.search(r"bl\.?\s*\d{4}", line, re.IGNORECASE):
                m = re.search(r"(\d{4})", line)
                if m: meta.bauleitung = m.group(1)
            elif re.search(r"blatt\s*:?\s*(\d{1,4})", line, re.IGNORECASE):
                m = re.search(r"(\d{1,4})", line)
                if m: meta.blatt_nummer = m.group(1).zfill(4)
            elif re.search(r"maßstab\s*:?\s*(1\s*:\s*\d+)", line, re.IGNORECASE):
                m = re.search(r"(1\s*:\s*\d+)", line, re.IGNORECASE)
                if m: meta.massstab = m.group(1).replace(" ", "")
            elif re.search(r"\d{2}\.\d{2}\.\d{4}", line):
                m = re.search(r"(\d{2}\.\d{2}\.\d{4})", line)
                if m: meta.datum = m.group(1)
        return meta

    def extract_legend_entries(page: fitz.Page, layout: OetmPageLayout) -> list[dict]:
        blocks = page.get_text("blocks", clip=layout.legende, sort=True)
        entries = []
        for b in blocks:
            x0, y0, x1, y1, text, *_ = b
            text = text.strip()
            if text:
                entries.append({"x0": round(x0,1), "y0": round(y0,1),
                               "x1": round(x1,1), "y1": round(y1,1), "text": text})
        return entries

    def find_mast_symbols_in_map(page: fitz.Page, layout: OetmPageLayout) -> list[dict]:
        paths = page.get_drawings()
        candidates = []
        map_rect = layout.hauptkarte
        for p in paths:
            r = p["rect"]
            if not map_rect.contains(fitz.Point(r.x0, r.y0)): continue
            if not map_rect.contains(fitz.Point(r.x1, r.y1)): continue
            w_mm = r.width / 72 * 25.4
            h_mm = r.height / 72 * 25.4
            if w_mm < 8 and h_mm < 8 and w_mm > 0.5 and h_mm > 0.5:
                candidates.append({"x": round(r.x0,1), "y": round(r.y0,1),
                                   "width": round(r.width,1), "height": round(r.height,1),
                                   "width_mm": round(w_mm,1), "height_mm": round(h_mm,1)})
        return candidates

    def analyse_detail_table(page: fitz.Page, layout: OetmPageLayout) -> list[dict]:
        header_clip = fitz.Rect(layout.detail_info.x0, layout.detail_info.y0,
                                layout.detail_info.x1, layout.detail_info.y0 + 60)
        data_clip   = fitz.Rect(layout.detail_info.x0, layout.detail_info.y0 + 60,
                                layout.detail_info.x1, layout.detail_info.y1)
        header_blocks = page.get_text("blocks", clip=header_clip, sort=True)
        header_texts  = [(b[0], b[4].strip()) for b in header_blocks if b[4].strip()]
        data_blocks = page.get_text("blocks", clip=data_clip, sort=True)
        rows = []
        current_y = None
        current_row = {}
        for b in sorted(data_blocks, key=lambda x: (round(x[1]/3), x[0])):
            row_y = round(b[1]/3)*3
            if row_y != current_y:
                if current_row: rows.append(current_row)
                current_row = {"_y": b[1]}
                current_y = row_y
            x0 = b[0]
            pw = page.rect.width
            if x0 < pw - LEGENDE_R + 40:
                current_row["typ"] = current_row.get("typ","") + b[4].strip()
            elif x0 < pw - LEGENDE_R + 80:
                current_row["nr"] = current_row.get("nr","") + b[4].strip()
            elif x0 < pw - LEGENDE_R + 160:
                current_row["flaeche_qm"] = current_row.get("flaeche_qm","") + b[4].strip()
            elif x0 < pw - LEGENDE_R + 260:
                current_row["pflege"] = current_row.get("pflege","") + b[4].strip()
            else:
                current_row["aufarbeitungsform"] = current_row.get("aufarbeitungsform","") + b[4].strip()
        if current_row: rows.append(current_row)
        return rows

    # Re-export the class names and functions used by the demo below
    __all__ = ['OetmPageLayout', 'OetmSheetMetadata', 'get_layout',
               'extract_text_by_region', 'extract_blocks_by_region',
               'render_region_to_png', 'extract_sheet_metadata',
               'extract_legend_entries', 'find_mast_symbols_in_map',
               'analyse_detail_table']


# ── Demo ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    TEST_PDFS = [
        (r"C:\Users\randanplan\repos\.oetm\2009 Mönchengladbach-Grevenbroich\2026-27\Pläne\2009 Mönchengladbach-Grevenbroich\ÖTM-2009 Mönchengladbach-Grevenbroich-0010.PDF",
         "2009-MG-Blatt10"),
        (r"C:\Users\randanplan\repos\.oetm\2006 Köln\2026-27\Pläne\2006 Köln\ÖTM-2006 Köln-0001.PDF",
         "2006-Koeln-Blatt01"),
        (r"C:\Users\randanplan\repos\.oetm\2008 Düsseldorf-Neuss\2026-27\Pläne\2008 Düsseldorf-Neuss\ÖTM-2008 Düsseldorf-Neuss-0001.PDF",
         "2008-DN-Blatt01"),
    ]

    for path, label in TEST_PDFS:
        doc = fitz.open(path)
        page = doc[0]
        layout = get_layout(page)

        print(f"\n{'=' * 60}")
        print(f"[{label}]  Seitenformat: {layout.page_width:.0f} x {layout.page_height:.0f} pt")
        print(f"  Hauptkarten-BBOX: {layout.hauptkarte}")

        # ── Metadaten ──────────────────────────────────────────────────────
        meta = extract_sheet_metadata(page, layout)
        print(f"\n  -- Metadaten --")
        print(json.dumps(meta.to_dict(), ensure_ascii=False, indent=2))

        # ── Layout-JSON ────────────────────────────────────────────────────
        print(f"\n  -- Layout (Bereichskoordinaten) --")
        print(json.dumps(layout.to_dict(), ensure_ascii=False, indent=2))

        # ── Detail-Tabelle ─────────────────────────────────────────────────
        rows = analyse_detail_table(page, layout)
        print(f"\n  -- Detail-Tabelle ({len(rows)} Zeilen) --")
        for r in rows[:5]:
            print(f"    {r}")

        # ── Mast-Symbole ───────────────────────────────────────────────────
        masts = find_mast_symbols_in_map(page, layout)
        print(f"\n  -- Mast-Symbol-Kandidaten ({len(masts)} kleine Zeichnungsobjekte) --")
        for m in masts[:10]:
            print(f"    ({m['x']:.0f}, {m['y']:.0f})  {m['width_mm']:.1f}×{m['height_mm']:.1f} mm")

        doc.close()

    print("\nFertig.")
