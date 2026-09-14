from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.core.models import crear_tablas
from app.core import catalogo, cotizador, interpretar_pedido
from app.web.auth import verificar_credenciales
from app.web import routes as web_routes  # NUEVO

app = FastAPI(
    title="TRILAK SPORT / KEIROS - Cotizador Automático",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Archivos estáticos y assets ---
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "app" / "web" / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

assets_path = BASE_DIR / "assets"
if not assets_path.exists():
    assets_path = BASE_DIR / "app" / "assets"
app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")


@app.on_event("startup")
def startup():
    crear_tablas()


# --- Routers API (protegidos con login) ---
app.include_router(catalogo.router, dependencies=[Depends(verificar_credenciales)])
app.include_router(cotizador.router, dependencies=[Depends(verificar_credenciales)])
app.include_router(interpretar_pedido.router, dependencies=[Depends(verificar_credenciales)])

# --- Router Web (páginas HTML) ---
app.include_router(web_routes.router, dependencies=[Depends(verificar_credenciales)])


@app.get("/health")
def health():
    return {"status": "healthy"}