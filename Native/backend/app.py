import os
import io
import json
import datetime
import base64
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Charge des .env potentiels (root/backend/interface), sans override.
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))

_ENV_CANDIDATES = [
    os.path.join(ROOT_DIR, ".env"),
    os.path.join(ROOT_DIR, ".env.local"),
    os.path.join(BASE_DIR, ".env"),
    os.path.join(BASE_DIR, ".env.local"),
    os.path.join(ROOT_DIR, "interface", ".env"),
    os.path.join(ROOT_DIR, "interface", ".env.local"),
]

for _p in _ENV_CANDIDATES:
    if os.path.isfile(_p):
        # Dev-friendly: permet de prendre en compte les changements dans les .env
        # (sinon une variable déjà présente, même vide, ne serait pas mise à jour).
        load_dotenv(_p, override=True)


def _get_mistral_settings() -> tuple[str | None, str, str]:
    api_key = os.getenv("MISTRAL_API_KEY")
    model_name = os.getenv("MISTRAL_MODEL", "mistral-small-latest")
    system_prompt = os.getenv("SYSTEM_PROMPT")
    if not system_prompt or not system_prompt.strip():
        system_prompt = (
            "Tu es Native AI, un assistant IA utile et bienveillant. R?ponds en fran?ais, de fa?on claire et concise."
        )
    return api_key, model_name, system_prompt


MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"

# Utilisé uniquement pour la transcription micro (ne pas exposer côté UI "model")
VOXTRAL_TRANSCRIBE_MODEL = os.getenv("VOXTRAL_TRANSCRIBE_MODEL", "voxtral-small-2507")


app = FastAPI()


def _get_supabase_settings() -> tuple[str | None, str | None, str | None, list[str]]:
    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    anon = os.getenv("SUPABASE_ANON_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")
    service = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    admin_emails = [e.strip().lower() for e in (os.getenv("ADMIN_EMAILS") or "").split(",") if e.strip()]
    return url, anon, service, admin_emails


async def _supabase_get_user_id(access_token: str) -> tuple[str, str | None]:
    supabase_url, supabase_anon_key, _, _ = _get_supabase_settings()
    if not supabase_url or not supabase_anon_key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_ANON_KEY manquant")

    endpoint = f"{supabase_url.rstrip('/')}/auth/v1/user"
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            endpoint,
            headers={
                "apikey": supabase_anon_key,
                "Authorization": f"Bearer {access_token}",
            },
        )
        if r.status_code >= 400:
            raise RuntimeError("Token Supabase invalide")
        data = r.json()

    user_id = str(data.get("id") or "").strip()
    if not user_id:
        raise RuntimeError("Utilisateur Supabase introuvable")
    email = data.get("email")
    return user_id, (str(email).strip().lower() if email else None)


async def _supabase_rpc(name: str, payload: dict) -> object:
    supabase_url, _, service, _ = _get_supabase_settings()
    if not supabase_url or not service:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquant")

    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/rpc/{name}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            endpoint,
            headers={
                "apikey": service,
                "Authorization": f"Bearer {service}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase RPC error ({name})")
        # RPC scalar => JSON scalar, RPC table => array of rows
        return r.json()


async def _supabase_rest_get(table: str, query: str) -> object:
    supabase_url, _, service, _ = _get_supabase_settings()
    if not supabase_url or not service:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquant")

    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/{table}?{query}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            endpoint,
            headers={
                "apikey": service,
                "Authorization": f"Bearer {service}",
            },
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase REST error ({table}): {r.status_code} {r.text}")
        return r.json()


async def _supabase_rest_insert(table: str, payload: object) -> object:
    supabase_url, _, service, _ = _get_supabase_settings()
    if not supabase_url or not service:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquant")

    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/{table}"
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            endpoint,
            headers={
                "apikey": service,
                "Authorization": f"Bearer {service}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            json=payload,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase REST insert error ({table}): {r.status_code} {r.text}")
        return r.json()


@app.get("/api/conversations/{conversation_id}/messages")
async def conversation_messages(conversation_id: str, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse(status_code=401, content={"error": "auth_required"})

    access_token = authorization.split(" ", 1)[1].strip()
    try:
        user_id, _email = await _supabase_get_user_id(access_token)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "invalid_auth"})

    # Vérifie que la conversation appartient à l'utilisateur.
    try:
        rows = await _supabase_rest_get(
            "conversations",
            f"select=id,user_id&id=eq.{conversation_id}&limit=1",
        )
    except Exception:
        return JSONResponse(status_code=404, content={"error": "not_found"})

    conv = (rows[0] if isinstance(rows, list) and rows else None) or {}
    if str(conv.get("user_id") or "") != str(user_id):
        return JSONResponse(status_code=403, content={"error": "forbidden"})

    try:
        msgs = await _supabase_rest_get(
            "messages",
            f"select=id,conversation_id,role,content,attachments,created_at&conversation_id=eq.{conversation_id}&order=created_at.asc",
        )
        return msgs if isinstance(msgs, list) else []
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "messages_unavailable", "detail": str(e)})


@app.get("/api/usage")
async def usage(authorization: Optional[str] = Header(None)):
    """Retourne la consommation tokens du mois pour l'utilisateur courant.

    Réponse: { month, cap, used, remaining }
    """

    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse(status_code=401, content={"error": "auth_required"})

    access_token = authorization.split(" ", 1)[1].strip()
    try:
        user_id, _email = await _supabase_get_user_id(access_token)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "invalid_auth"})

    month = datetime.datetime.utcnow().strftime("%Y-%m")
    cap = 10_000

    try:
        used = await _supabase_rpc("get_tokens_used", {"p_user_id": user_id, "p_month": month})
        used_int = int(used) if used is not None else 0
    except Exception:
        used_int = 0

    remaining = max(0, cap - used_int)
    return {"month": month, "cap": cap, "used": used_int, "remaining": remaining}


@app.get("/api/admin/stats")
async def admin_stats(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse(status_code=401, content={"error": "auth_required"})

    access_token = authorization.split(" ", 1)[1].strip()
    try:
        _user_id, email = await _supabase_get_user_id(access_token)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "invalid_auth"})

    _, _, _, admin_emails = _get_supabase_settings()
    if not email or email.lower() not in set(admin_emails):
        return JSONResponse(status_code=403, content={"error": "forbidden"})

    # Connected users: last_seen within 120s
    connected_users = 0
    try:
        rows = await _supabase_rest_get("user_presence", "select=last_seen")
        now = datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc)
        cutoff = now - datetime.timedelta(seconds=120)
        for r in rows if isinstance(rows, list) else []:
            try:
                ls = str((r or {}).get("last_seen") or "")
                if not ls:
                    continue
                dt = datetime.datetime.fromisoformat(ls.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=datetime.timezone.utc)
                if dt >= cutoff:
                    connected_users += 1
            except Exception:
                continue
    except Exception:
        connected_users = 0

    # Total users
    total_users = 0
    try:
        total = await _supabase_rpc("admin_total_users", {})
        total_users = int(total) if total is not None else 0
    except Exception:
        total_users = 0

    # Tokens monthly series
    tokens_by_month = []
    try:
        series = await _supabase_rpc("admin_tokens_last_months", {"p_months": 6})
        tokens_by_month = series if isinstance(series, list) else []
    except Exception:
        tokens_by_month = []

    return {
        "connectedUsers": connected_users,
        "totalUsers": total_users,
        "tokensByMonth": tokens_by_month,
    }

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
    persist: Optional[str] = Form(None),
    conversation_id: Optional[str] = Form(None),
    conversation_title: Optional[str] = Form(None),
    attachments: Optional[str] = Form(None),
    deep_search: Optional[str] = Form(None),
    reason: Optional[str] = Form(None),
    system_prompt: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    authorization: Optional[str] = Header(None),
):
    """Endpoint de chat.

    - messages : json string [{"role": "user"|"assistant", "content": "..."}]
    - files : fichiers à injecter (optionnel)
    """

    def _normalize_history(raw: str) -> list[dict]:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return [{"role": "user", "content": raw}] if raw.strip() else []
        if isinstance(parsed, list):
            return [m for m in parsed if isinstance(m, dict)]
        return [{"role": "user", "content": raw}] if raw.strip() else []

    history = _normalize_history(messages)

    # Auth obligatoire pour l'envoi (la navigation reste libre côté UI)
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse(status_code=401, content={"error": "auth_required"})

    access_token = authorization.split(" ", 1)[1].strip()
    try:
        user_id, _email = await _supabase_get_user_id(access_token)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "invalid_auth"})

    month = datetime.datetime.utcnow().strftime("%Y-%m")

    # Limite mensuelle (10k tokens)
    try:
        used = await _supabase_rpc("get_tokens_used", {"p_user_id": user_id, "p_month": month})
        used_int = int(used) if used is not None else 0
    except Exception:
        used_int = 0

    TOKEN_CAP = 10_000
    if used_int >= TOKEN_CAP:
        return JSONResponse(
            status_code=402,
            content={
                "error": "token_limit_reached",
                "detail": f"Limite mensuelle atteinte ({TOKEN_CAP} tokens).",
            },
        )

    def _as_bool(v: Optional[str]) -> bool:
        if v is None:
            return False
        return str(v).strip().lower() in {"1", "true", "yes", "on"}

    persist_enabled = _as_bool(persist)

    deep_search_enabled = _as_bool(deep_search)
    reason_enabled = _as_bool(reason)

    async def _ensure_conversation() -> tuple[str | None, dict | None]:
        """Retourne (conversation_id, conversation_row) ou (None, None)."""
        nonlocal conversation_id

        if not persist_enabled:
            return None, None

        if conversation_id:
            # Vérifie appartenance
            try:
                rows = await _supabase_rest_get(
                    "conversations",
                    f"select=id,user_id,title,created_at,updated_at&id=eq.{conversation_id}&limit=1",
                )
                row = rows[0] if isinstance(rows, list) and rows else None
                if not row or str(row.get("user_id") or "") != str(user_id):
                    return None, None
                return str(row.get("id")), row
            except Exception:
                return None, None

        title = (conversation_title or "").strip() or "New Conversation"
        try:
            created = await _supabase_rest_insert("conversations", {"user_id": user_id, "title": title})
            # Supabase REST renvoie un array de lignes
            row = created[0] if isinstance(created, list) and created else None
            if not row:
                return None, None
            conversation_id = str(row.get("id"))
            return conversation_id, row
        except Exception:
            return None, None

    def _extract_last_user_message() -> str:
        for m in reversed(history):
            if not isinstance(m, dict):
                continue
            if str(m.get("role") or "") != "user":
                continue
            content = str(m.get("content") or "").strip()
            if content:
                return content
        return ""

    def _parse_attachments() -> object | None:
        if not attachments:
            return None
        try:
            parsed = json.loads(attachments)
        except Exception:
            return None
        if isinstance(parsed, list):
            return parsed
        return None

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

    mistral_api_key, model_name, default_system_prompt = _get_mistral_settings()

    effective_system_prompt = default_system_prompt
    if system_prompt is not None:
        candidate = str(system_prompt).strip()
        if candidate:
            effective_system_prompt = candidate

    if not mistral_api_key:
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

    if not any(str(m.get("content", "")).strip() for m in history if isinstance(m, dict)):
        if messages.strip():
            history = [{"role": "user", "content": messages.strip()}]

    mistral_messages = [{"role": "system", "content": effective_system_prompt}]
    if mode_instructions:
        mistral_messages.append({"role": "system", "content": "\n".join(mode_instructions)})
    mistral_messages += history

    headers = {
        "Authorization": f"Bearer {mistral_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model_name,
        "messages": mistral_messages,
        "temperature": 0.4,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            r = await client.post(MISTRAL_API_URL, headers=headers, json=payload)
            r.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail: object
            try:
                detail = exc.response.json()
            except Exception:
                detail = exc.response.text
            return JSONResponse(
                status_code=502,
                content={"error": "mistral_api_error", "detail": detail},
            )
        except httpx.RequestError as exc:
            return JSONResponse(
                status_code=502,
                content={"error": "mistral_request_failed", "detail": str(exc)},
            )

        data = r.json()

    assistant_reply = data["choices"][0]["message"]["content"]

    # Persistance DB (optionnelle) : on stocke uniquement le dernier message user + la réponse.
    conv_id, conv_row = await _ensure_conversation()
    if persist_enabled and conv_id:
        user_msg = _extract_last_user_message()
        att = _parse_attachments()
        if user_msg:
            try:
                payload_u: dict = {"conversation_id": conv_id, "role": "user", "content": user_msg}
                if att is not None:
                    payload_u["attachments"] = att
                await _supabase_rest_insert("messages", payload_u)
            except Exception:
                pass

        try:
            await _supabase_rest_insert(
                "messages",
                {"conversation_id": conv_id, "role": "assistant", "content": str(assistant_reply or "")},
            )
        except Exception:
            pass

    # Comptage tokens (Mistral fournit souvent usage.total_tokens)
    usage = data.get("usage") or {}
    total_tokens = usage.get("total_tokens")
    if total_tokens is None:
        # fallback: approximation simple (chars/4)
        approx_chars = sum(len(str(m.get("content", ""))) for m in mistral_messages if isinstance(m, dict))
        approx_chars += len(str(assistant_reply or ""))
        total_tokens = max(1, int(approx_chars / 4))

    try:
        added = await _supabase_rpc(
            "add_tokens",
            {"p_user_id": user_id, "p_month": month, "p_tokens": int(total_tokens)},
        )
        new_total = int(added) if added is not None else None
    except Exception:
        new_total = None

    out: dict = {"reply": assistant_reply}
    if persist_enabled and conv_id:
        out["conversationId"] = conv_id
        if conv_row is not None:
            out["conversation"] = conv_row
    return out


def _extract_assistant_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
                continue
            if isinstance(item, dict):
                txt = item.get("text")
                if isinstance(txt, str) and txt.strip():
                    parts.append(txt)
        return "\n".join(parts)
    return str(content or "")


@app.post("/api/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    """Transcrit un audio micro et renvoie du texte (français).

    - Utilise Voxtral via l'endpoint chat/completions (audio input base64)
    - Ne dépend pas du modèle sélectionné pour le chat (settings)
    """

    # Auth obligatoire (même logique que /api/chat)
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse(status_code=401, content={"error": "auth_required"})

    access_token = authorization.split(" ", 1)[1].strip()
    try:
        user_id, _email = await _supabase_get_user_id(access_token)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "invalid_auth"})

    month = datetime.datetime.utcnow().strftime("%Y-%m")

    # Limite mensuelle (10k tokens)
    try:
        used = await _supabase_rpc("get_tokens_used", {"p_user_id": user_id, "p_month": month})
        used_int = int(used) if used is not None else 0
    except Exception:
        used_int = 0

    TOKEN_CAP = 10_000
    if used_int >= TOKEN_CAP:
        return JSONResponse(
            status_code=402,
            content={
                "error": "token_limit_reached",
                "detail": f"Limite mensuelle atteinte ({TOKEN_CAP} tokens).",
            },
        )

    mistral_api_key, _model_name, _default_system_prompt = _get_mistral_settings()
    if not mistral_api_key:
        return JSONResponse(status_code=500, content={"error": "missing_mistral_key"})

    raw = await file.read()
    if not raw:
        return JSONResponse(status_code=400, content={"error": "empty_audio"})

    # Basic guardrail (10MB)
    if len(raw) > 10 * 1024 * 1024:
        return JSONResponse(status_code=413, content={"error": "audio_too_large"})

    audio_b64 = base64.b64encode(raw).decode("utf-8")
    instruction = (
        "Transcris cet audio et renvoie un JSON strict avec deux clés: "
        "spoken (transcription exacte dans la langue d'origine) et fr (traduction en français). "
        "Si la langue est déjà le français, fr doit être identique à spoken. "
        "Réponds uniquement avec le JSON (pas de texte autour, pas de markdown)."
    )

    headers = {
        "Authorization": f"Bearer {mistral_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": VOXTRAL_TRANSCRIBE_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "input_audio", "input_audio": audio_b64},
                    {"type": "text", "text": instruction},
                ],
            }
        ],
        "temperature": 0.0,
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        try:
            r = await client.post(MISTRAL_API_URL, headers=headers, json=payload)
            r.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail: object
            try:
                detail = exc.response.json()
            except Exception:
                detail = exc.response.text
            return JSONResponse(status_code=502, content={"error": "mistral_api_error", "detail": detail})
        except httpx.RequestError as exc:
            return JSONResponse(status_code=502, content={"error": "mistral_request_failed", "detail": str(exc)})

        data = r.json()

    assistant_content = data.get("choices", [{}])[0].get("message", {}).get("content")
    raw_text = _extract_assistant_text(assistant_content).strip()

    spoken: str | None = None
    fr: str | None = None
    try:
        parsed = json.loads(raw_text)
        if isinstance(parsed, dict):
            s = parsed.get("spoken")
            t = parsed.get("fr")
            if isinstance(s, str) and s.strip():
                spoken = s.strip()
            if isinstance(t, str) and t.strip():
                fr = t.strip()
    except Exception:
        pass

    # Fallback: si on n'a pas reçu du JSON correct, on renvoie tout dans fr
    if fr is None:
        fr = raw_text
    if spoken is None:
        spoken = raw_text

    usage = data.get("usage") or {}
    total_tokens = usage.get("total_tokens")
    if total_tokens is None:
        # fallback approximation (audio is unknown -> minimal)
        approx_source = fr or raw_text
        total_tokens = max(1, int(len(approx_source) / 4))

    try:
        await _supabase_rpc(
            "add_tokens",
            {"p_user_id": user_id, "p_month": month, "p_tokens": int(total_tokens)},
        )
    except Exception:
        pass

    return {"spoken": spoken, "text": fr}


@app.get("/{full_path:path}", response_class=HTMLResponse)
async def spa_fallback(full_path: str):
    # Permet à Vite/React Router de fonctionner en prod (refresh sur /chat, etc.)
    if os.path.isfile(INTERFACE_INDEX):
        return FileResponse(INTERFACE_INDEX, headers={"Cache-Control": "no-store"})
    return HTMLResponse("Not Found", status_code=404)
