"""
ÖTM PDF processing sidecar endpoints.

Wraps the oetm_pdf_extractor module as FastAPI routes so the
desktop/web frontend can extract layout, metadata, detail tables,
and perform georeferencing on ÖTM sheet PDFs.

Requires PyMuPDF (``pip install PyMuPDF``).

IMPLEMENTATION_PLAN ref: Phase 0.4, Meilensteine 0.4.1–0.4.9
"""

from __future__ import annotations

import base64
from pathlib import Path
from typing import Optional
import io

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/oetm", tags=["oetm"])


# ── Pydantic models ─────────────────────────────────────────────────────────


class SheetRequest(BaseModel):
    """Request carrying the absolute path to an ÖTM sheet PDF."""

    pdf_path: str


class RectModel(BaseModel):
    x0: float
    y0: float
    x1: float
    y1: float
    width_mm: float
    height_mm: float


class LayoutResponse(BaseModel):
    page_width_mm: float
    page_height_mm: float
    hauptkarte: RectModel
    legende: RectModel
    detail_info: RectModel
    titelblock: RectModel


class MetadataResponse(BaseModel):
    blatt_nummer: Optional[str] = None
    los_bezeichnung: Optional[str] = None
    massstab: Optional[str] = None
    planart: Optional[str] = None
    auftraggeber: Optional[str] = None
    leitungsname: Optional[str] = None
    bauleitung: Optional[str] = None
    datum: Optional[str] = None


class DetailRowResponse(BaseModel):
    typ: Optional[str] = None
    nr: Optional[str] = None
    flaeche_qm: Optional[str] = None
    pflege: Optional[str] = None
    aufarbeitungsform: Optional[str] = None


class BboxResponse(BaseModel):
    """Pixel bounding-box of the main map area, plus page dimensions."""

    x0: float
    y0: float
    x1: float
    y1: float
    page_width: float
    page_height: float


class GcpPoint(BaseModel):
    """Ground Control Point: pixel coords in PDF → WGS84 geo coords."""

    pixel_x: float
    pixel_y: float
    geo_x: float  # longitude
    geo_y: float  # latitude


class GeoreferenceRequest(BaseModel):
    pdf_path: str
    gcps: list[GcpPoint]  # minimum 3 points for an affine transform


class GeoreferenceResponse(BaseModel):
    """Affine transform parameters: geo = A · pixel + b."""

    a11: float
    a12: float
    a21: float
    a22: float
    b1: float  # translation in longitude
    b2: float  # translation in latitude
    rmse: Optional[float] = None
    residual_map: Optional[list[dict[str, float]]] = None


class RenderRequest(BaseModel):
    """Request to render a specific region of a PDF page to PNG."""

    pdf_path: str
    dpi: int = 150
    # If omitted the entire Hauptkarte region is rendered.
    region: Optional[str] = None  # "hauptkarte" | "legende" | "detail_info" | "titelblock"


class RenderRegionRequest(BaseModel):
    """Request to render an arbitrary region of a PDF page to PNG."""

    pdf_path: str
    x0: float
    y0: float
    x1: float
    y1: float
    dpi: int = 150


class HealthResponse(BaseModel):
    status: str
    pymupdf_available: bool


class SheetUploadRequest(BaseModel):
    """Request with a base64-encoded PDF for upload endpoints."""

    pdf_base64: str


class SheetUploadResponse(BaseModel):
    imported: int
    rows: list[DetailRowResponse]


# ── Internal helpers ────────────────────────────────────────────────────────


def _validate_pdf_path(pdf_path: str) -> Path:
    """Validate and resolve a PDF file path."""
    if not pdf_path or not pdf_path.strip():
        raise HTTPException(status_code=400, detail="pdf_path is required")
    p = Path(pdf_path).expanduser().resolve()
    if not p.is_file():
        raise HTTPException(
            status_code=400, detail=f"PDF file not found: {pdf_path}"
        )
    return p


def _open_pdf(pdf_path: str):
    """Open a PDF with PyMuPDF, with a clear error when the lib is missing."""
    try:
        import fitz
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="PyMuPDF is not installed. Install with: pip install PyMuPDF",
        )
    p = _validate_pdf_path(pdf_path)
    try:
        return fitz.open(str(p))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot open PDF: {exc}")


def _check_extractor():
    """Ensure the extractor module is importable."""
    try:
        from . import oetm_extractor  # noqa: F401
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Cannot import oetm_extractor: {exc}",
        )


# ── Pure-Python affine transform solver ─────────────────────────────────────


def _solve_affine(gcps: list[GcpPoint]) -> tuple[float, float, float, float, float, float, float, list[dict[str, float]]]:
    """Compute best-fit affine transform from pixel to geo coords.

    Solves  geo = A · pixel + b  via least squares.

    Returns (a11, a12, a21, a22, b1, b2, rmse, residuals).
    For exactly 3 GCPs the residual is 0 by construction.
    """
    n = len(gcps)
    if n < 3:
        raise HTTPException(
            status_code=400, detail=f"Need at least 3 GCPs, got {n}"
        )

    # Build the normal-equation system for each output dimension.
    # We solve:  [Σpx²  Σpx·py  Σpx] [a1]   [Σpx·gx]
    #            [Σpx·py Σpy²   Σpy] [a2] = [Σpy·gx]
    #            [Σpx    Σpy    n  ] [b ]   [Σgx   ]
    # Same structure for gy.
    s_px = s_py = s_px2 = s_py2 = s_pxpy = 0.0
    s_gx = s_gy = s_pxgx = s_pygx = s_pxgy = s_pygy = 0.0

    for g in gcps:
        px, py = g.pixel_x, g.pixel_y
        gx, gy = g.geo_x, g.geo_y
        s_px += px
        s_py += py
        s_px2 += px * px
        s_py2 += py * py
        s_pxpy += px * py
        s_gx += gx
        s_gy += gy
        s_pxgx += px * gx
        s_pygx += py * gx
        s_pxgy += px * gy
        s_pygy += py * gy

    # Solve 3x3 system via Cramer's rule (stable enough for well-conditioned GCPs).
    def _det_3x3(m11, m12, m13, m21, m22, m23, m31, m32, m33) -> float:
        return (
            m11 * (m22 * m33 - m23 * m32)
            - m12 * (m21 * m33 - m23 * m31)
            + m13 * (m21 * m32 - m22 * m31)
        )

    det_A = _det_3x3(s_px2, s_pxpy, s_px, s_pxpy, s_py2, s_py, s_px, s_py, n)
    if abs(det_A) < 1e-20:
        raise HTTPException(
            status_code=400,
            detail="GCPs are (nearly) collinear — cannot compute affine transform",
        )

    a11 = _det_3x3(s_pxgx, s_pxpy, s_px, s_pygx, s_py2, s_py, s_gx, s_py, n) / det_A
    a12 = _det_3x3(s_px2, s_pxgx, s_px, s_pxpy, s_pygx, s_py, s_px, s_gx, n) / det_A
    b1 = _det_3x3(s_px2, s_pxpy, s_pxgx, s_pxpy, s_py2, s_pygx, s_px, s_py, s_gx) / det_A

    a21 = _det_3x3(s_pxgy, s_pxpy, s_px, s_pygy, s_py2, s_py, s_gy, s_py, n) / det_A
    a22 = _det_3x3(s_px2, s_pxgy, s_px, s_pxpy, s_pygy, s_py, s_px, s_gy, n) / det_A
    b2 = _det_3x3(s_px2, s_pxpy, s_pxgy, s_pxpy, s_py2, s_pygy, s_px, s_py, s_gy) / det_A

    # Compute residuals and RMSE
    residuals: list[dict[str, float]] = []
    sse = 0.0
    for g in gcps:
        geo_x_pred = a11 * g.pixel_x + a12 * g.pixel_y + b1
        geo_y_pred = a21 * g.pixel_x + a22 * g.pixel_y + b2
        dx = geo_x_pred - g.geo_x
        dy = geo_y_pred - g.geo_y
        # Euclidean distance in degrees (rough)
        dist = (dx * dx + dy * dy) ** 0.5
        sse += dist * dist
        residuals.append({"pixel_x": g.pixel_x, "pixel_y": g.pixel_y,
                          "geo_x_input": g.geo_x, "geo_y_input": g.geo_y,
                          "geo_x_pred": round(geo_x_pred, 10),
                          "geo_y_pred": round(geo_y_pred, 10),
                          "error_deg": round(dist, 10)})

    rmse = (sse / n) ** 0.5
    return a11, a12, a21, a22, b1, b2, rmse, residuals


# ═════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/health", response_model=HealthResponse)
def oetm_health():
    """Return whether the optional PyMuPDF dependency is available."""
    try:
        import fitz  # noqa: F401
        return HealthResponse(status="ok", pymupdf_available=True)
    except ImportError:
        return HealthResponse(status="degraded", pymupdf_available=False)


@router.post("/sheet-layout", response_model=LayoutResponse)
def sheet_layout(req: SheetRequest):
    """Return the four fixed layout regions of an ÖTM sheet PDF.

    The regions (hauptkarte, legende, detail_info, titelblock) are computed
    from the page dimensions and the known right-edge offsets — no text
    search is required.
    """
    _check_extractor()
    from . import oetm_extractor as ext

    doc = _open_pdf(req.pdf_path)
    try:
        page = doc[0]
        layout = ext.get_layout(page)
        d = layout.to_dict()
        return LayoutResponse(
            page_width_mm=d["page_width_mm"],
            page_height_mm=d["page_height_mm"],
            hauptkarte=RectModel(**d["hauptkarte"]),
            legende=RectModel(**d["legende"]),
            detail_info=RectModel(**d["detail_info"]),
            titelblock=RectModel(**d["titelblock"]),
        )
    finally:
        doc.close()


@router.post("/sheet-metadata", response_model=MetadataResponse)
def sheet_metadata(req: SheetRequest):
    """Extract sheet metadata from the title block.

    Returns sheet number, lot name, scale, line name, construction line
    number, and date — all parsed from the fixed title-block region.
    """
    _check_extractor()
    from . import oetm_extractor as ext

    doc = _open_pdf(req.pdf_path)
    try:
        page = doc[0]
        layout = ext.get_layout(page)
        meta = ext.extract_sheet_metadata(page, layout)
        return MetadataResponse(
            blatt_nummer=meta.blatt_nummer,
            los_bezeichnung=meta.los_bezeichnung,
            massstab=meta.massstab,
            planart=meta.planart,
            auftraggeber=meta.auftraggeber,
            leitungsname=meta.leitungsname,
            bauleitung=meta.bauleitung,
            datum=meta.datum,
        )
    finally:
        doc.close()


@router.post("/sheet-bbox", response_model=BboxResponse)
def sheet_bbox(req: SheetRequest):
    """Return the pixel bounding-box of the main map (Hauptkarte) area.

    This is the region of the PDF that contains the actual map content and
    is the target for georeferencing.
    """
    _check_extractor()
    from . import oetm_extractor as ext

    doc = _open_pdf(req.pdf_path)
    try:
        page = doc[0]
        layout = ext.get_layout(page)
        r = layout.hauptkarte
        return BboxResponse(
            x0=r.x0,
            y0=r.y0,
            x1=r.x1,
            y1=r.y1,
            page_width=layout.page_width,
            page_height=layout.page_height,
        )
    finally:
        doc.close()


@router.post("/sheet-detail-table", response_model=list[DetailRowResponse])
def sheet_detail_table(req: SheetRequest):
    """Extract the existing measure entries from the detail-info table.

    Each row contains type, number, area (m²), maintenance (pct or count),
    and processing method. This data can be imported into the app to avoid
    re-drawing measures that already exist in the PDF.
    """
    _check_extractor()
    from . import oetm_extractor as ext

    doc = _open_pdf(req.pdf_path)
    try:
        page = doc[0]
        layout = ext.get_layout(page)
        rows = ext.analyse_detail_table(page, layout)
        return [
            DetailRowResponse(
                typ=r.get("typ"),
                nr=r.get("nr"),
                flaeche_qm=r.get("flaeche_qm"),
                pflege=r.get("pflege"),
                aufarbeitungsform=r.get("aufarbeitungsform"),
            )
            for r in rows
        ]
    finally:
        doc.close()


@router.post("/sheet-detail-table-upload", response_model=list[DetailRowResponse])
def sheet_detail_table_upload(req: SheetUploadRequest):
    """Extract measure entries from a base64-uploaded PDF.

    Accepts a base64-encoded PDF instead of a file path, so the
    browser/webview can send the PDF content directly without the
    sidecar needing filesystem access.
    """
    _check_extractor()
    from . import oetm_extractor as ext
    import fitz

    try:
        pdf_bytes = base64.b64decode(req.pdf_base64)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot open PDF: {exc}")

    try:
        page = doc[0]
        layout = ext.get_layout(page)
        rows = ext.analyse_detail_table(page, layout)
        return [
            DetailRowResponse(
                typ=r.get("typ"),
                nr=r.get("nr"),
                flaeche_qm=r.get("flaeche_qm"),
                pflege=r.get("pflege"),
                aufarbeitungsform=r.get("aufarbeitungsform"),
            )
            for r in rows
        ]
    finally:
        doc.close()


@router.post("/sheet-render-png")
def sheet_render_png(req: RenderRequest):
    """Render a layout region to a PNG image.

    By default renders the entire Hauptkarte (map) region. Set ``region``
    to ``"legende"``, ``"detail_info"``, or ``"titelblock"`` for the other
    fixed panes.

    Returns ``image/png`` bytes.
    """
    _check_extractor()
    from . import oetm_extractor as ext
    from fastapi.responses import Response

    doc = _open_pdf(req.pdf_path)
    try:
        page = doc[0]
        layout = ext.get_layout(page)
        region_map = {
            "hauptkarte": layout.hauptkarte,
            "legende": layout.legende,
            "detail_info": layout.detail_info,
            "titelblock": layout.titelblock,
        }
        rect = region_map.get(req.region or "hauptkarte", layout.hauptkarte)
        png_bytes = ext.render_region_to_png(page, rect, dpi=req.dpi)
        return Response(content=png_bytes, media_type="image/png")
    finally:
        doc.close()


@router.post("/sheet-render-region-png")
def sheet_render_region_png(req: RenderRegionRequest):
    """Render an arbitrary rectangle of the PDF page to a PNG image.

    The coordinates (x0, y0, x1, y1) are in PDF points relative to the
    page origin (bottom-left? no — top-left in fitz coordinates).
    """
    _check_extractor()
    from . import oetm_extractor as ext
    from fastapi.responses import Response
    import fitz

    doc = _open_pdf(req.pdf_path)
    try:
        page = doc[0]
        rect = fitz.Rect(req.x0, req.y0, req.x1, req.y1)
        png_bytes = ext.render_region_to_png(page, rect, dpi=req.dpi)
        return Response(content=png_bytes, media_type="image/png")
    finally:
        doc.close()


@router.post("/sheet-mast-candidates")
def sheet_mast_candidates(req: SheetRequest):
    """Detect mast symbol candidates in the map area.

    Returns a list of small drawing objects that could be mast symbols,
    useful as potential GCP sources for georeferencing.

    Each candidate includes pixel coordinates and size in mm.
    """
    _check_extractor()
    from . import oetm_extractor as ext

    doc = _open_pdf(req.pdf_path)
    try:
        page = doc[0]
        layout = ext.get_layout(page)
        candidates = ext.find_mast_symbols_in_map(page, layout)
        return candidates
    finally:
        doc.close()


@router.post("/georeference", response_model=GeoreferenceResponse)
def georeference(req: GeoreferenceRequest):
    """Compute an affine transform from pixel coords to WGS84 geo coords.

    Accepts at least 3 GCPs (Ground Control Points) where each GCP maps a
    pixel position in the PDF's Hauptkarte region to a known WGS84
    longitude/latitude (e.g. a mast with known coordinates).

    Returns the six affine parameters and the RMSE (root mean square error)
    across all GCPs.

    The transform can be applied as::

        geo_x = a11 * pixel_x + a12 * pixel_y + b1
        geo_y = a21 * pixel_x + a22 * pixel_y + b2
    """
    if len(req.gcps) < 3:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 3 GCPs for an affine transform, got {len(req.gcps)}",
        )

    a11, a12, a21, a22, b1, b2, rmse, residuals = _solve_affine(req.gcps)

    return GeoreferenceResponse(
        a11=round(a11, 15),
        a12=round(a12, 15),
        a21=round(a21, 15),
        a22=round(a22, 15),
        b1=round(b1, 12),
        b2=round(b2, 12),
        rmse=round(rmse, 10) if rmse else None,
        residual_map=residuals if len(req.gcps) > 3 else None,
    )
