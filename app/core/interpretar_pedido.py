"""
Interpretación de PDFs de pedidos enviados por clientes.

Flujo (2 pasos, con humano en el medio - por seguridad de precios):
1. POST /interpretar-pdf-pedido: el equipo comercial sube el PDF que envió
   el cliente. Se extrae el texto, se usa IA SOLO para identificar qué
   productos y cantidades pidió el cliente (nunca para decidir precios),
   y se compara cada ítem contra el catálogo real en la base de datos.
   Devuelve una lista de coincidencias para que el asesor las revise.
2. El asesor confirma/corrige las referencias sugeridas (en el frontend)
   y llama al endpoint normal POST /api/v1/cotizar con los ítems ya
   confirmados - ahí se calculan los precios de forma 100% determinística.
"""

import io
import json
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from pypdf import PdfReader
from openai import OpenAI

from app.core.models import get_db
from app.core.pricing import buscar_productos_con_score

router = APIRouter(prefix="/api/v1", tags=["Lector de pedidos PDF"])

MODELO_INTERPRETACION = os.getenv("MODELO_OPENAI_INTERPRETACION", "gpt-4o-mini")

# Umbral mínimo de score para considerar una coincidencia "fiable".
# Score bajo = no se confía, se marca para revisión.
UMBRAL_SCORE_MINIMO = 6

# Si el score del 2do candidato es >= este ratio del 1ro, hay ambigüedad real.
RATIO_AMBIGUEDAD = 0.85


def _cliente_openai() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Falta configurar OPENAI_API_KEY en el servidor.")
    return OpenAI(api_key=api_key)


class ItemInterpretado(BaseModel):
    texto_original: str
    cantidad: Optional[int]
    referencia_sugerida: Optional[str] = None
    descripcion_sugerida: Optional[str] = None
    precio_referencia: Optional[float] = None
    coincidencias_alternativas: list[dict] = []
    requiere_revision: bool = False
    motivo_revision: Optional[str] = None


class RespuestaInterpretacion(BaseModel):
    texto_extraido_pdf: str
    items: list[ItemInterpretado]
    total_items_detectados: int
    total_items_sin_ambiguedad: int


def _extraer_texto_pdf(contenido: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(contenido))
        texto = "\n".join(page.extract_text() or "" for page in reader.pages)
        return texto.strip()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el PDF: {e}")


PROMPT_SISTEMA = """Eres un asistente que EXTRAE una lista de productos y cantidades \
de un pedido en texto, enviado por un cliente de una empresa de artículos deportivos \
(balones, conos, mallas, colchonetas, kits de entrenamiento, etc).

NO decides precios ni inventas productos que no se mencionen. Solo identificas \
qué pidió el cliente, tal como lo escribió.

Devuelve ÚNICAMENTE un JSON con esta forma exacta, sin texto adicional ni backticks:

{
  "items": [
    {"texto_original": "texto tal como aparece en el pedido", "cantidad": numero_entero_o_null}
  ]
}

Si una cantidad no se menciona explícitamente para un ítem, pon null en 'cantidad' \
(NO asumas 1 por defecto). Si el mismo producto aparece repetido, únelo en una sola línea \
sumando cantidades solo si es exactamente el mismo texto."""


def _interpretar_texto_con_ia(texto_pedido: str) -> list[dict]:
    client = _cliente_openai()
    try:
        respuesta = client.chat.completions.create(
            model=MODELO_INTERPRETACION,
            messages=[
                {"role": "system", "content": PROMPT_SISTEMA},
                {"role": "user", "content": texto_pedido},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        data = json.loads(respuesta.choices[0].message.content)
        return data.get("items", [])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error interpretando el pedido con IA: {e}")


@router.post("/interpretar-pdf-pedido", response_model=RespuestaInterpretacion)
async def interpretar_pdf_pedido(
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not archivo.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF.")

    contenido = await archivo.read()
    texto = _extraer_texto_pdf(contenido)

    if not texto:
        raise HTTPException(
            status_code=422,
            detail="No se pudo extraer texto del PDF (puede ser un PDF escaneado/imagen). "
                   "Por ahora este flujo requiere PDFs con texto seleccionable.",
        )

    items_crudos = _interpretar_texto_con_ia(texto)

    items_resultado = []
    sin_ambiguedad = 0

    for item in items_crudos:
        texto_original = item.get("texto_original", "").strip()
        cantidad = item.get("cantidad")

        if not texto_original:
            continue

        resultados_con_score = buscar_productos_con_score(db, texto_original, limite=5)

        resultado = ItemInterpretado(texto_original=texto_original, cantidad=cantidad)

        # --- CASO 1: Sin coincidencias ---
        if not resultados_con_score:
            resultado.requiere_revision = True
            resultado.motivo_revision = "No se encontró ningún producto similar en el catálogo."
            items_resultado.append(resultado)
            continue

        top_score, top_producto = resultados_con_score[0]

        # Preseleccionar SIEMPRE el top (aunque requiera revisión, el asesor
        # solo confirma o cambia, no tiene que buscar desde cero)
        resultado.referencia_sugerida = top_producto.referencia
        resultado.descripcion_sugerida = top_producto.descripcion
        resultado.precio_referencia = top_producto.precio_unitario

        # --- CASO 2: Coincidencia única ---
        if len(resultados_con_score) == 1:
            if cantidad is None:
                resultado.requiere_revision = True
                resultado.motivo_revision = "No se detectó cantidad explícita en el pedido."
            else:
                sin_ambiguedad += 1
            items_resultado.append(resultado)
            continue

        # --- CASO 3: Múltiples coincidencias ---
        # Incluir alternativas para que el asesor pueda cambiar fácilmente
        resultado.coincidencias_alternativas = [
            {
                "referencia": p.referencia,
                "descripcion": p.descripcion,
                "precio_unitario": p.precio_unitario,
                "score": s,
            }
            for s, p in resultados_con_score
        ]

        second_score = resultados_con_score[1][0]

        # Análisis de fiabilidad
        if top_score < UMBRAL_SCORE_MINIMO:
            resultado.requiere_revision = True
            resultado.motivo_revision = (
                f"Coincidencia débil (puntaje {top_score}). Verifica el producto."
            )
        elif second_score >= top_score * RATIO_AMBIGUEDAD:
            resultado.requiere_revision = True
            resultado.motivo_revision = (
                f"Hay {len(resultados_con_score)} productos muy parecidos. "
                f"Confirma cuál es el correcto."
            )
        elif cantidad is None:
            resultado.requiere_revision = True
            resultado.motivo_revision = "No se detectó cantidad explícita en el pedido."
        else:
            # Top es claro ganador y hay cantidad → auto-confirmar
            sin_ambiguedad += 1

        items_resultado.append(resultado)

    return RespuestaInterpretacion(
        texto_extraido_pdf=texto[:3000],
        items=items_resultado,
        total_items_detectados=len(items_resultado),
        total_items_sin_ambiguedad=sin_ambiguedad,
    )