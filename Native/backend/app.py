import os
import io
import json
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Charge d'abord le .env à la racine (si présent), puis celui du backend (si présent)
load_dotenv(os.path.join(BASE_DIR, "..", ".env"))
load_dotenv(os.path.join(BASE_DIR, ".env"))

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"
MODEL_NAME = os.getenv("MISTRAL_MODEL", "mistral-small-latest")

SYSTEM_PROMPT = os.getenv(
    "SYSTEM_PROMPT",
    "Tu es Native AI, un assistant IA utile et bienveillant. Réponds en français, de façon claire et concise.",
)


app = FastAPI()

# CORS (utile si l'interface Vite tourne sur un autre port en dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


INTERFACE_DIST_DIR = os.path.join(BASE_DIR, "..", "interface", "dist")
INTERFACE_INDEX = os.path.join(INTERFACE_DIST_DIR, "index.html")
INTERFACE_ASSETS_DIR = os.path.join(INTERFACE_DIST_DIR, "assets")

if os.path.isdir(INTERFACE_ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=INTERFACE_ASSETS_DIR), name="assets")


@app.get("/", response_class=HTMLResponse)
async def home():
    if os.path.isfile(INTERFACE_INDEX):
        return FileResponse(INTERFACE_INDEX, headers={"Cache-Control": "no-store"})

    return HTMLResponse(
        """
        <html><body style='font-family:system-ui;padding:24px'>
          <h2>Interface non buildée</h2>
          <p>
            Lance l'interface en dev: <code>npm --prefix interface run dev</code>
            puis ouvre <code>http://127.0.0.1:5173</code>.
          </p>
          <p>
            Ou build l'interface: <code>npm --prefix interface run build</code>
            puis recharge cette page.
          </p>
        </body></html>
        """,
        status_code=200,
    )


@app.post("/api/chat")
async def chat(
    messages: str = Form(...),
    deep_search: Optional[str] = Form(None),
    reason: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
):
    """Endpoint de chat.

    - messages : json string [{"role": "user"|"assistant", "content": "..."}]
    - files : fichiers à injecter (optionnel)
    """

    try:
        history = json.loads(messages)
    except json.JSONDecodeError:
        history = []

    def _as_bool(v: Optional[str]) -> bool:
        if v is None:
            return False
        return str(v).strip().lower() in {"1", "true", "yes", "on"}

    deep_search_enabled = _as_bool(deep_search)
    reason_enabled = _as_bool(reason)

    def _limit_text(s: str, max_chars: int = 8000) -> str:
        if len(s) <= max_chars:
            return s
        return s[:max_chars] + "\n...\n[contenu tronqué]"

    async def _extract_file_text(f: UploadFile) -> str:
        name = f.filename or "(sans nom)"
        content_type = (f.content_type or "").lower()
        ext = os.path.splitext(name)[1].lower()

        raw = await f.read()
        # Reset file pointer not needed since we already fully read.

        # PDF: extract text via pypdf
        if content_type == "application/pdf" or ext == ".pdf":
            try:
                from pypdf import PdfReader  # type: ignore

                reader = PdfReader(io.BytesIO(raw))
                parts: List[str] = []
                for page in reader.pages:
                    txt = page.extract_text() or ""
                    if txt:
                        parts.append(txt)
                    if sum(len(p) for p in parts) > 12000:
                        break
                text = "\n\n".join(parts).strip()
                if not text:
                    return f"--- FICHIER: {name} ---\n[PDF: aucun texte extractible]"
                return f"--- FICHIER: {name} ---\n```text\n{_limit_text(text)}\n```"
            except Exception:
                return f"--- FICHIER: {name} ---\n[PDF: extraction impossible]"

        # Images: optional OCR
        if content_type in {"image/png", "image/jpeg"} or ext in {".png", ".jpg", ".jpeg"}:
            try:
                from PIL import Image  # type: ignore

                try:
                    import pytesseract  # type: ignore
                except Exception:
                    return f"--- FICHIER: {name} ---\n[Image: OCR indisponible (pytesseract non installé)]"

                img = Image.open(io.BytesIO(raw))
                text = pytesseract.image_to_string(img) or ""
                text = text.strip()
                if not text:
                    return f"--- FICHIER: {name} ---\n[Image: aucun texte détecté]"
                return f"--- FICHIER: {name} ---\n```text\n{_limit_text(text)}\n```"
            except Exception:
                return f"--- FICHIER: {name} ---\n[Image: OCR impossible]"

        # Fallback: treat as text
        try:
            content = raw.decode("utf-8", errors="replace")
        except Exception:
            content = "<fichier non texte>"
        content = _limit_text(content, max_chars=4000)
        return f"--- FICHIER: {name} ---\n```text\n{content}\n```"

    if files:
        file_texts = []
        for f in files:
            file_texts.append(await _extract_file_text(f))

        if file_texts:
            files_block = "\n\n".join(file_texts)
            if history and history[-1].get("role") == "user":
                history[-1]["content"] += "\n\nVoici les fichiers fournis :\n" + files_block
            else:
                history.append({"role": "user", "content": "Voici les fichiers fournis :\n" + files_block})

    if not MISTRAL_API_KEY:
        return {"reply": "MISTRAL_API_KEY manquant dans .env (racine)."}

    mode_instructions = []
    if deep_search_enabled:
        mode_instructions.append(
            "Mode Deep Search: analyse de façon plus approfondie, structure ta réponse, "
            "et si nécessaire pose 1-2 questions de clarification avant de conclure. "
            "N'invente pas de sources externes."
        )
    if reason_enabled:
        mode_instructions.append(
            "Mode Reason: donne une réponse structurée et ajoute uniquement les points clés du raisonnement "
            "(pas de chaîne de pensée détaillée)."
        )

    mistral_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if mode_instructions:
        mistral_messages.append({"role": "system", "content": "\n".join(mode_instructions)})
    mistral_messages += history

    headers = {
        "Authorization": f"Bearer {MISTRAL_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL_NAME,
        "messages": mistral_messages,
        "temperature": 0.4,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(MISTRAL_API_URL, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()

    assistant_reply = data["choices"][0]["message"]["content"]
    return {"reply": assistant_reply}


@app.get("/{full_path:path}", response_class=HTMLResponse)
async def spa_fallback(full_path: str):
    # Permet à Vite/React Router de fonctionner en prod (refresh sur /chat, etc.)
    if os.path.isfile(INTERFACE_INDEX):
        return FileResponse(INTERFACE_INDEX, headers={"Cache-Control": "no-store"})
    return HTMLResponse("Not Found", status_code=404)
