"""
ÖTM-PDF-Struktur-Explorer
Analysiert 3 Blattschnitt-PDFs mit PyMuPDF und erkennt Layout-Regionen.
"""
import json
import fitz  # PyMuPDF

PDFS = [
    r"C:\Users\randanplan\repos\.oetm\2009 Mönchengladbach-Grevenbroich\2026-27\Pläne\2009 Mönchengladbach-Grevenbroich\ÖTM-2009 Mönchengladbach-Grevenbroich-0010.PDF",
    r"C:\Users\randanplan\repos\.oetm\2006 Köln\2026-27\Pläne\2006 Köln\ÖTM-2006 Köln-0001.PDF",
    r"C:\Users\randanplan\repos\.oetm\2008 Düsseldorf-Neuss\2026-27\Pläne\2008 Düsseldorf-Neuss\ÖTM-2008 Düsseldorf-Neuss-0001.PDF",
]

# Bekannte Anker-Texte (immer in den rechten Panels vorhanden)
ANCHORS = {
    "detail_header": ["Detail - Informationen", "Detail-Informationen"],
    "masstab":       ["1:2000", "1 : 2000"],
    "titelblock":    ["Ökologischer", "Trassenmanagementplan"],
    "westnetz":      ["westnetz"],
    "blatt":         ["Blatt"],
    "pflege":        ["Pflege", "Pflegeeinheit"],
    "legende_head":  ["Maßnahmen", "Maßnahmenkatalog", "Naturschutzpflegefläche"],
}

def find_anchor(blocks, candidates):
    """Gibt das erste Block-Rect zurück, dessen Text einen der Kandidaten enthält."""
    for b in blocks:
        x0, y0, x1, y1, text, *_ = b
        for c in candidates:
            if c.lower() in text.lower():
                return fitz.Rect(x0, y0, x1, y1), text.strip()
    return None, None

def analyse_pdf(path):
    print(f"\n{'=' * 70}")
    print(f"PDF: {path.split(chr(92))[-1]}")
    doc = fitz.open(path)
    page = doc[0]
    pw, ph = page.rect.width, page.rect.height
    print(f"  Seitengröße (pt): {pw:.1f} x {ph:.1f}   ({pw/72*25.4:.0f} x {ph/72*25.4:.0f} mm)")

    blocks = page.get_text("blocks", sort=True)
    print(f"  Textblöcke: {len(blocks)}")

    # ── Anker-Suche ──────────────────────────────────────────────────────
    print("\n  [ Anker-Texte ]")
    anchors_found = {}
    for key, candidates in ANCHORS.items():
        rect, found_text = find_anchor(blocks, candidates)
        if rect:
            anchors_found[key] = rect
            print(f"    {key:20s}: x0={rect.x0:.0f} y0={rect.y0:.0f} x1={rect.x1:.0f} y1={rect.y1:.0f}  |  {repr(found_text[:50])}")
        else:
            print(f"    {key:20s}: NICHT GEFUNDEN  (Kandidaten: {candidates})")

    # ── Bereichs-Ableitung ────────────────────────────────────────────────
    print("\n  [ Bereiche (abgeleitet) ]")

    # Titelblock-Linke Kante = x-Grenze rechtes Panel
    title_x = None
    for key in ("westnetz", "titelblock", "masstab"):
        if key in anchors_found:
            title_x = anchors_found[key].x0
            break

    # Detail-Informationen: linke Kante des mittleren Panels
    detail_x = anchors_found.get("detail_header")
    detail_x0 = detail_x.x0 if detail_x else None

    # Legende
    legend_x = anchors_found.get("legende_head")
    legend_x0 = legend_x.x0 if legend_x else None

    # Karte: alles links des frühesten Panel-Blocks
    panel_start = min(
        [r.x0 for r in anchors_found.values()],
        default=pw * 0.65
    )

    print(f"    Karte (Hauptkarte)  : x0=0      → x1≈{panel_start:.0f}  (≈{panel_start/pw*100:.0f}% der Breite)")
    if legend_x0 is not None:
        print(f"    Legende             : x0≈{legend_x0:.0f}  y0≈{legend_x.y0:.0f}")
    if detail_x0 is not None:
        print(f"    Detail-Informationen: x0≈{detail_x0:.0f}  y0≈{detail_x.y0:.0f}")
    if title_x is not None:
        print(f"    Titelblock          : x0≈{title_x:.0f}  → x1={pw:.0f}")

    # ── Zeichnungs-Objekte (Linien/Rechtecke) für exakte Grenzen ─────────
    paths = page.get_drawings()
    print(f"\n  [ Zeichnungs-Objekte: {len(paths)} Pfade ]")
    # Suche nach vertikalen Linien die über >50% der Seitenhöhe gehen
    vert_lines = []
    for p in paths:
        r = p["rect"]
        if r.width < 3 and r.height > ph * 0.4:          # schmale, hohe Box → vertikale Linie
            vert_lines.append((r.x0, r.y0, r.x1, r.y1))
    vert_lines.sort(key=lambda v: v[0])
    if vert_lines:
        print(f"  Vertikale Trennlinien ({len(vert_lines)} gefunden):")
        for vl in vert_lines:
            print(f"    x≈{vl[0]:.0f}  y0={vl[1]:.0f} → y1={vl[3]:.0f}  (Länge: {vl[3]-vl[1]:.0f} pt)")
    else:
        print("  Keine vertikalen Trennlinien gefunden (Rahmen ggf. als Rechtecke).")

    # ── Rechtecke (Boxen) mit signifikanter Breite ────────────────────────
    rects_sig = [
        p["rect"] for p in paths
        if p["rect"].width > pw * 0.05 and p["rect"].height > ph * 0.05
    ]
    if rects_sig:
        print(f"\n  Signifikante Rechtecke ({len(rects_sig)}):")
        for r in sorted(rects_sig, key=lambda r: r.x0)[:10]:
            print(f"    ({r.x0:.0f},{r.y0:.0f}) → ({r.x1:.0f},{r.y1:.0f})  w={r.width:.0f} h={r.height:.0f}")

    # ── Detail-Tabelle: alle Textzeilen im rechten Drittel ────────────────
    print(f"\n  [ Alle Textblöcke im rechten Drittel (x0 > {pw*0.65:.0f}) ]")
    right_blocks = [(b[0],b[1],b[2],b[3],b[4]) for b in blocks if b[0] > pw * 0.65]
    right_blocks.sort(key=lambda b: (b[1], b[0]))  # nach y, dann x
    for rb in right_blocks[:30]:
        x0,y0,x1,y1,text = rb
        print(f"    ({x0:.0f},{y0:.0f})  {repr(text[:70])}")

    doc.close()
    return anchors_found


if __name__ == "__main__":
    results = []
    for p in PDFS:
        r = analyse_pdf(p)
        results.append(r)
    print("\n\nFertig.")
