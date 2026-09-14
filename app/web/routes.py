"""
Rutas HTML del frontend web.
Los endpoints de datos (JSON) siguen en app/core/.
"""
from pathlib import Path
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

router = APIRouter(tags=["Web UI"])


@router.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="dashboard.html",
        context={"page": "dashboard"},
    )


@router.get("/nueva-cotizacion", response_class=HTMLResponse)
async def nueva_cotizacion(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="nueva_cotizacion.html",
        context={"page": "nueva"},
    )


@router.get("/historial", response_class=HTMLResponse)
async def historial(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="historial.html",
        context={"page": "historial"},
    )


@router.get("/catalogo-web", response_class=HTMLResponse)
async def catalogo_web(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="catalogo.html",
        context={"page": "catalogo"},
    )


@router.get("/leer-pdf", response_class=HTMLResponse)
async def leer_pdf(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="leer_pdf.html",
        context={"page": "leer_pdf"},
    )