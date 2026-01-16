import os
import io
import json
import datetime
import base64
import tempfile
import subprocess
import traceback
import urllib.parse
from typing import List, Optional

try:
    import imageio_ffmpeg  # type: ignore
except Exception:  # pragma: no cover
    imageio_ffmpeg = None

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, Header, Request
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

# Dedicated transcription endpoint (recommended for STT)
MISTRAL_AUDIO_TRANSCRIPTIONS_URL = "https://api.mistral.ai/v1/audio/transcriptions"

# Voxtral STT model (server-only). Keep this out of any frontend settings.
# Default requested by the project: voxtral-small-2507
VOXTRAL_TRANSCRIBE_MODEL = os.getenv("VOXTRAL_TRANSCRIBE_MODEL", "voxtral-small-2507")

# Optional override to force a specific method.
# - "transcriptions": use /v1/audio/transcriptions
# - "chat": use /v1/chat/completions with input_audio
# - "auto": choose based on model name
VOXTRAL_TRANSCRIBE_ENDPOINT = os.getenv("VOXTRAL_TRANSCRIBE_ENDPOINT", "auto").strip().lower() or "auto"

# Text model used only to translate STT output to French.
VOXTRAL_TRANSLATE_MODEL = os.getenv("VOXTRAL_TRANSLATE_MODEL", "mistral-small-latest")


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


FREE_TOKEN_CAP = 25_000
PRO_TOKEN_CAP = 500_000
TOPUP_250K = 250_000


def _safe_int_env(name: str, default: int) -> int:
    try:
        v = int(str(os.getenv(name, str(default))).strip())
        return v if v > 0 else default
    except Exception:
        return default


def _month_key(dt: datetime.datetime | None = None) -> str:
    d = dt or datetime.datetime.utcnow()
    return d.strftime("%Y-%m")


def _iso_week_key(dt: datetime.datetime | None = None) -> str:
    d = dt or datetime.datetime.utcnow()
    y, w, _ = d.isocalendar()
    return f"{int(y)}-W{int(w):02d}"


async def _get_user_plan(user_id: str) -> str:
    try:
        rows = await _supabase_rest_get("user_plans", f"select=plan&user_id=eq.{user_id}&limit=1")
        row = rows[0] if isinstance(rows, list) and rows else None
        plan = str((row or {}).get("plan") or "").strip().lower()
        return plan if plan in {"free", "pro"} else "free"
    except Exception:
        return "free"


async def _get_token_cap(user_id: str, plan: str, period: str) -> int:
    """Returns token cap for user for a given period key.

    Default: Free=25k/week, Pro=500k/month.
    If the Supabase RPC `get_token_cap` exists, uses it to support plans + top-ups.
    """

    base = PRO_TOKEN_CAP if plan == "pro" else FREE_TOKEN_CAP

    # Prefer new signature: (p_user_id, p_period)
    try:
        cap = await _supabase_rpc("get_token_cap", {"p_user_id": user_id, "p_period": period})
        cap_int = int(cap) if cap is not None else base
        return max(0, cap_int)
    except Exception:
        pass

    # Backward compat: old signature (p_month)
    try:
        cap = await _supabase_rpc("get_token_cap", {"p_user_id": user_id, "p_month": period})
        cap_int = int(cap) if cap is not None else base
        return max(0, cap_int)
    except Exception:
        return base


async def _get_tokens_used(user_id: str, plan: str, period: str) -> int:
    try:
        if plan == "pro":
            used = await _supabase_rpc("get_tokens_used", {"p_user_id": user_id, "p_month": period})
        else:
            used = await _supabase_rpc("get_tokens_used_week", {"p_user_id": user_id, "p_week": period})
        return int(used) if used is not None else 0
    except Exception:
        return 0


async def _add_tokens_used(user_id: str, plan: str, period: str, tokens: int) -> None:
    try:
        if plan == "pro":
            await _supabase_rpc("add_tokens", {"p_user_id": user_id, "p_month": period, "p_tokens": int(tokens)})
        else:
            await _supabase_rpc(
                "add_tokens_week", {"p_user_id": user_id, "p_week": period, "p_tokens": int(tokens)}
            )
    except Exception:
        return


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
    """Retourne la consommation tokens pour la période courante.

    Free: reset hebdo (YYYY-Www)
    Pro: reset mensuel (YYYY-MM)

    Réponse: { month, cap, used, remaining } (month est une clé de période)
    """

    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse(status_code=401, content={"error": "auth_required"})

    access_token = authorization.split(" ", 1)[1].strip()
    try:
        user_id, _email = await _supabase_get_user_id(access_token)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "invalid_auth"})

    plan = await _get_user_plan(user_id)
    period = _month_key() if plan == "pro" else _iso_week_key()
    cap = await _get_token_cap(user_id, plan, period)
    used_int = await _get_tokens_used(user_id, plan, period)

    remaining = max(0, int(cap) - int(used_int))
    return {"month": period, "cap": int(cap), "used": int(used_int), "remaining": int(remaining), "plan": plan}


@app.get("/api/billing/plans")
async def billing_plans():
    """Public metadata for UI rendering (Stripe integration lives in checkout-session + webhook)."""

    return {
        "plans": [
            {"id": "free", "name": "Free", "price": 0, "interval": "week", "cap": FREE_TOKEN_CAP},
            {"id": "pro", "name": "Pro", "price": 15, "interval": "month", "cap": PRO_TOKEN_CAP},
            {"id": "topup_250k", "name": "Token Pack", "price": 10, "interval": "once", "tokens": TOPUP_250K},
        ]
    }


@app.post("/api/billing/checkout-session")
async def billing_checkout_session(payload: dict, authorization: Optional[str] = Header(None)):
    """Stripe-ready endpoint.

    Expected payload: { kind: 'pro_monthly' | 'topup_250k' }

    In production, this should create a Stripe Checkout Session and return { url }.
    """

    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse(status_code=401, content={"error": "auth_required"})

    access_token = authorization.split(" ", 1)[1].strip()
    try:
        user_id, email = await _supabase_get_user_id(access_token)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "invalid_auth"})

    kind = str((payload or {}).get("kind") or "").strip().lower()
    if kind not in {"pro_monthly", "topup_250k"}:
        return JSONResponse(status_code=400, content={"error": "invalid_kind"})

    # Optional dev-mode: grant instantly without Stripe (so UI can be tested end-to-end).
    dev_grant = str(os.getenv("BILLING_DEV_GRANT", "0") or "0").strip().lower() in {"1", "true", "yes", "on"}
    if dev_grant:
        plan = await _get_user_plan(user_id)
        period = _month_key() if plan == "pro" else _iso_week_key()
        try:
            if kind == "pro_monthly":
                await _supabase_rpc("set_user_plan", {"p_user_id": user_id, "p_plan": "pro"})
            if kind == "topup_250k":
                await _supabase_rpc(
                    "add_period_allowance",
                    {"p_user_id": user_id, "p_period": period, "p_tokens": TOPUP_250K},
                )
        except Exception:
            pass
        return {"url": "/plans"}

    # If we don't have a webhook configured, we cannot apply entitlements after payment.
    # Avoid sending users to Stripe and then "nothing happens".
    stripe_webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET") or ""
    stripe_secret_key = os.getenv("STRIPE_SECRET_KEY") or ""
    if not stripe_webhook_secret.strip() or not stripe_secret_key.strip():
        return JSONResponse(
            status_code=501,
            content={
                "error": "stripe_webhook_not_configured",
                "detail": (
                    "Stripe webhook is not configured, so purchases cannot be applied automatically. "
                    "For local testing, set BILLING_DEV_GRANT=1. "
                    "For real payments, configure STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET and a webhook endpoint."
                ),
            },
        )

    # Payment Links mode (no server-side Checkout Session creation required).
    # NOTE: To actually grant plan/tokens after payment, configure the Stripe webhook.
    payment_link_pro = os.getenv("STRIPE_PAYMENT_LINK_PRO") or "https://buy.stripe.com/9B6aEW5dr8s9dqj2nt14401"
    payment_link_topup = os.getenv("STRIPE_PAYMENT_LINK_TOPUP_250K") or "https://buy.stripe.com/bJe14mbBP6k171VaTZ14402"
    url = payment_link_pro if kind == "pro_monthly" else payment_link_topup

    try:
        if email:
            parsed = urllib.parse.urlparse(url)
            q = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
            q["prefilled_email"] = str(email)
            url = urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(q)))
    except Exception:
        pass

    return {"url": url}


    # (Unused for now): server-side Checkout Sessions could be added later.


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


@app.post("/api/admin/set-plan")
async def admin_set_plan(request: Request, authorization: Optional[str] = Header(None)):
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

    payload = await request.json()
    target_email = str(payload.get("email") or "").strip().lower()
    plan = str(payload.get("plan") or "free").strip().lower()
    if plan not in {"free", "pro"}:
        plan = "free"

    if not target_email:
        return JSONResponse(status_code=400, content={"error": "bad_request", "detail": "Missing email"})

    try:
        user_id = await _supabase_rpc("admin_user_id_by_email", {"p_email": target_email})
        user_id_str = str(user_id or "").strip()
        if not user_id_str:
            return JSONResponse(status_code=404, content={"error": "not_found", "detail": "User not found"})

        out_plan = await _supabase_rpc("set_user_plan", {"p_user_id": user_id_str, "p_plan": plan})
        return {"ok": True, "email": target_email, "plan": str(out_plan or plan)}
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": "admin_set_plan_failed", "detail": str(exc)})


@app.post("/api/admin/grant-tokens")
async def admin_grant_tokens(request: Request, authorization: Optional[str] = Header(None)):
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

    payload = await request.json()
    target_email = str(payload.get("email") or "").strip().lower()
    tokens_raw = payload.get("tokens")
    try:
        tokens = int(tokens_raw)
    except Exception:
        tokens = 0

    if not target_email:
        return JSONResponse(status_code=400, content={"error": "bad_request", "detail": "Missing email"})
    if tokens <= 0:
        return JSONResponse(status_code=400, content={"error": "bad_request", "detail": "Tokens must be > 0"})

    try:
        user_id = await _supabase_rpc("admin_user_id_by_email", {"p_email": target_email})
        user_id_str = str(user_id or "").strip()
        if not user_id_str:
            return JSONResponse(status_code=404, content={"error": "not_found", "detail": "User not found"})

        plan = await _get_user_plan(user_id_str)
        period = _month_key() if plan == "pro" else _iso_week_key()

        added = await _supabase_rpc(
            "add_period_allowance",
            {"p_user_id": user_id_str, "p_period": period, "p_tokens": int(tokens)},
        )

        return {
            "ok": True,
            "email": target_email,
            "plan": plan,
            "period": period,
            "tokensAddedTotal": int(added or 0),
        }
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": "admin_grant_tokens_failed", "detail": str(exc)})


@app.post("/api/billing/webhook")
async def stripe_webhook(request: Request):
    """Stripe webhook for Payment Links / Checkout.

    Requires:
    - STRIPE_SECRET_KEY
    - STRIPE_WEBHOOK_SECRET
    """

    secret = os.getenv("STRIPE_WEBHOOK_SECRET") or ""
    api_key = os.getenv("STRIPE_SECRET_KEY") or ""
    if not secret.strip() or not api_key.strip():
        return JSONResponse(status_code=501, content={"error": "stripe_not_configured"})

    try:
        import stripe  # type: ignore
    except Exception:
        return JSONResponse(status_code=500, content={"error": "stripe_missing_dependency", "detail": "Install stripe"})

    stripe.api_key = api_key

    sig = request.headers.get("stripe-signature") or request.headers.get("Stripe-Signature")
    if not sig:
        return JSONResponse(status_code=400, content={"error": "missing_signature"})

    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(payload=payload, sig_header=sig, secret=secret)
    except Exception as exc:
        return JSONResponse(status_code=400, content={"error": "invalid_signature", "detail": str(exc)})

    etype = str(getattr(event, "type", "") or "")

    async def resolve_user_id(email: str | None) -> str | None:
        e = (email or "").strip().lower()
        if not e:
            return None
        try:
            uid = await _supabase_rpc("admin_user_id_by_email", {"p_email": e})
            uid_str = str(uid or "").strip()
            return uid_str or None
        except Exception:
            return None

    async def grant_pack(uid: str) -> None:
        plan = await _get_user_plan(uid)
        period = _month_key() if plan == "pro" else _iso_week_key()
        try:
            await _supabase_rpc(
                "add_period_allowance",
                {"p_user_id": uid, "p_period": period, "p_tokens": int(TOPUP_250K)},
            )
        except Exception:
            return

    async def set_plan(uid: str, plan: str) -> None:
        try:
            await _supabase_rpc("set_user_plan", {"p_user_id": uid, "p_plan": plan})
        except Exception:
            return

    try:
        if etype == "checkout.session.completed":
            session = event["data"]["object"]
            mode = str(session.get("mode") or "")
            cd = session.get("customer_details") or {}
            email = cd.get("email") or session.get("customer_email")
            uid = await resolve_user_id(email)
            if not uid:
                return {"ok": True}

            if mode == "subscription":
                await set_plan(uid, "pro")
                return {"ok": True}

            # One-time payments: treat $10 as the 250k pack.
            amount_total = session.get("amount_total")
            currency = str(session.get("currency") or "").lower()
            if currency == "usd" and int(amount_total or 0) == 1000:
                await grant_pack(uid)
            return {"ok": True}

        if etype == "customer.subscription.deleted":
            sub = event["data"]["object"]
            customer_id = sub.get("customer")
            if customer_id:
                try:
                    cust = stripe.Customer.retrieve(customer_id)
                    email = (cust or {}).get("email")
                except Exception:
                    email = None
                uid = await resolve_user_id(email)
                if uid:
                    await set_plan(uid, "free")
            return {"ok": True}

        if etype == "invoice.paid":
            inv = event["data"]["object"]
            customer_id = inv.get("customer")
            if customer_id:
                try:
                    cust = stripe.Customer.retrieve(customer_id)
                    email = (cust or {}).get("email")
                except Exception:
                    email = None
                uid = await resolve_user_id(email)
                if uid:
                    await set_plan(uid, "pro")
            return {"ok": True}
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": "webhook_failed", "detail": str(exc)})

    return {"ok": True}


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

    plan = await _get_user_plan(user_id)
    period = _month_key() if plan == "pro" else _iso_week_key()
    token_cap = await _get_token_cap(user_id, plan, period)
    used_int = await _get_tokens_used(user_id, plan, period)

    if used_int >= token_cap:
        return JSONResponse(
            status_code=402,
            content={
                "error": "token_limit_reached",
                "detail": f"Limite atteinte ({token_cap} tokens) pour la période {period}.",
                "period": period,
                "plan": plan,
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

    # Guardrails against huge payloads (common cause of upstream proxy resets/overflow)
    MAX_CHAT_MESSAGES_RAW_CHARS = _safe_int_env("MAX_CHAT_MESSAGES_RAW_CHARS", 250_000)
    MAX_MISTRAL_PROMPT_CHARS = _safe_int_env("MAX_MISTRAL_PROMPT_CHARS", 60_000)
    MAX_CHAT_FILES = _safe_int_env("MAX_CHAT_FILES", 6)
    MAX_SINGLE_FILE_BYTES = _safe_int_env("MAX_SINGLE_FILE_BYTES", 8_000_000)

    if len(messages) > MAX_CHAT_MESSAGES_RAW_CHARS:
        return JSONResponse(
            status_code=413,
            content={
                "error": "payload_too_large",
                "detail": "Historique trop volumineux. Démarre un nouveau chat ou supprime des messages.",
            },
        )

    def _content_len(v: object) -> int:
        if v is None:
            return 0
        if isinstance(v, str):
            return len(v)
        try:
            return len(json.dumps(v, ensure_ascii=False))
        except Exception:
            return len(str(v))

    def _approx_messages_chars(msgs: list[dict]) -> int:
        total = 0
        for m in msgs:
            if not isinstance(m, dict):
                continue
            total += _content_len(m.get("content"))
        return total

    def _trim_history_to_budget(msgs: list[dict], budget: int) -> list[dict]:
        if budget <= 0 or not msgs:
            return msgs

        system_msgs: list[dict] = []
        other_msgs: list[dict] = []
        for m in msgs:
            if not isinstance(m, dict):
                continue
            if str(m.get("role") or "") == "system":
                system_msgs.append(m)
            else:
                other_msgs.append(m)

        # Ensure system prompt itself doesn't dominate.
        for sm in system_msgs:
            c = sm.get("content")
            if isinstance(c, str) and len(c) > 6000:
                sm["content"] = _limit_text(c, max_chars=6000)

        remaining = budget - _approx_messages_chars(system_msgs)
        if remaining <= 0:
            return system_msgs

        kept_reversed: list[dict] = []
        for m in reversed(other_msgs):
            c_len = _content_len(m.get("content"))
            if c_len <= remaining:
                kept_reversed.append(m)
                remaining -= c_len
                continue

            # If we can't fit anything yet, truncate the most recent message.
            if not kept_reversed:
                truncated = dict(m)
                c = truncated.get("content")
                if isinstance(c, str) and remaining > 100:
                    truncated["content"] = _limit_text(c, max_chars=max(100, remaining))
                    kept_reversed.append(truncated)
            break

        kept = list(reversed(kept_reversed))
        return system_msgs + kept

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
        if len(files) > MAX_CHAT_FILES:
            return JSONResponse(
                status_code=413,
                content={
                    "error": "too_many_files",
                    "detail": f"Trop de fichiers (max {MAX_CHAT_FILES}).",
                },
            )
        file_texts = []
        for f in files:
            raw_peek = await f.read()
            if len(raw_peek) > MAX_SINGLE_FILE_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": "file_too_large",
                        "detail": f"Fichier trop volumineux (max {MAX_SINGLE_FILE_BYTES} bytes).",
                        "filename": f.filename,
                    },
                )
            # Put the bytes back for the extractor which expects to read the file.
            f.file.seek(0)
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

    # Prevent sending oversized prompts to the model.
    mistral_messages = _trim_history_to_budget(mistral_messages, MAX_MISTRAL_PROMPT_CHARS)

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

    await _add_tokens_used(user_id, plan, period, int(total_tokens))

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


def _looks_like_supported_audio(filename: str | None, content_type: str | None) -> bool:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext in {".mp3", ".wav"}:
        return True
    ct = (content_type or "").lower()
    return ct in {"audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"}


def _should_use_transcriptions_endpoint(model: str) -> bool:
    """Heuristic: Mistral's dedicated STT endpoint currently targets Voxtral Mini Transcribe."""

    m = (model or "").strip().lower()
    if not m:
        return False
    # Per docs, the optimized endpoint currently supports voxtral-mini-latest.
    return m.startswith("voxtral-mini")


async def _mistral_audio_transcriptions(
    *,
    api_key: str,
    model: str,
    raw_audio: bytes,
    filename: str,
    content_type: str,
    language: str | None = None,
) -> tuple[str, dict]:
    headers = {"Authorization": f"Bearer {api_key}"}
    data: dict[str, str] = {"model": model}
    if language and language.strip():
        data["language"] = language.strip()

    files = {
        # httpx supports raw bytes directly as file content
        "file": (filename, raw_audio, content_type),
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        try:
            r = await client.post(MISTRAL_AUDIO_TRANSCRIPTIONS_URL, headers=headers, data=data, files=files)
            r.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail: object
            try:
                detail = exc.response.json()
            except Exception:
                detail = exc.response.text
            status = int(getattr(exc.response, "status_code", 502) or 502)
            if 400 <= status < 500:
                raise RuntimeError(json.dumps({"error": "mistral_request_rejected", "status": status, "detail": detail}))
            raise RuntimeError(json.dumps({"error": "mistral_api_error", "status": status, "detail": detail}))
        except httpx.RequestError as exc:
            raise RuntimeError(json.dumps({"error": "mistral_request_failed", "detail": str(exc)}))

        try:
            data_json = r.json()
        except Exception as exc:
            raise RuntimeError(json.dumps({"error": "mistral_bad_json", "detail": str(exc), "raw": (r.text or "")[:2000]}))

    # Shape is usually: {"text": "...", ...}
    if isinstance(data_json, dict):
        txt = data_json.get("text")
        if isinstance(txt, str) and txt.strip():
            return txt.strip(), data_json
    if isinstance(data_json, str) and data_json.strip():
        return data_json.strip(), {}
    raise RuntimeError(json.dumps({"error": "mistral_unexpected_response", "detail": data_json}))


async def _mistral_chat_audio_to_json(
    *,
    api_key: str,
    model: str,
    audio_b64: str,
) -> tuple[str | None, str | None, dict]:
    """Legacy method: use chat endpoint with input_audio and JSON response_format."""

    instruction = (
        "Transcris cet audio et renvoie un JSON strict avec deux clés: "
        "spoken (transcription exacte dans la langue d'origine) et fr (traduction en français). "
        "Si la langue est déjà le français, fr doit être identique à spoken. "
        "Réponds uniquement avec le JSON (pas de texte autour, pas de markdown)."
    )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "input_audio", "input_audio": audio_b64},
                    {"type": "text", "text": instruction},
                ],
            }
        ],
        "response_format": {"type": "json_object"},
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
            status = int(getattr(exc.response, "status_code", 502) or 502)
            if 400 <= status < 500:
                raise RuntimeError(json.dumps({"error": "mistral_request_rejected", "status": status, "detail": detail}))
            raise RuntimeError(json.dumps({"error": "mistral_api_error", "status": status, "detail": detail}))
        except httpx.RequestError as exc:
            raise RuntimeError(json.dumps({"error": "mistral_request_failed", "detail": str(exc)}))

        try:
            data = r.json()
        except Exception as exc:
            raise RuntimeError(json.dumps({"error": "mistral_bad_json", "detail": str(exc), "raw": (r.text or "")[:2000]}))

    if not isinstance(data, dict):
        raise RuntimeError(json.dumps({"error": "mistral_unexpected_response", "detail": data}))

    assistant_content = (data.get("choices", [{}])[0] or {}).get("message", {}).get("content")
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

    if fr is None:
        fr = raw_text
    if spoken is None:
        spoken = raw_text

    return spoken, fr, data


async def _translate_to_french(*, api_key: str, text: str) -> tuple[str, dict]:
    src = (text or "").strip()
    if not src:
        return "", {}

    model = (VOXTRAL_TRANSLATE_MODEL or "").strip() or "mistral-small-latest"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    prompt = (
        "Traduis en français si nécessaire. "
        "Si le texte est déjà en français, renvoie-le inchangé. "
        "Réponds uniquement avec le texte final, sans guillemets ni markdown.\n\n" + src
    )
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.post(MISTRAL_API_URL, headers=headers, json=payload)
            r.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail: object
            try:
                detail = exc.response.json()
            except Exception:
                detail = exc.response.text
            status = int(getattr(exc.response, "status_code", 502) or 502)
            if 400 <= status < 500:
                raise RuntimeError(json.dumps({"error": "mistral_request_rejected", "status": status, "detail": detail}))
            raise RuntimeError(json.dumps({"error": "mistral_api_error", "status": status, "detail": detail}))
        except httpx.RequestError as exc:
            raise RuntimeError(json.dumps({"error": "mistral_request_failed", "detail": str(exc)}))

        try:
            data = r.json()
        except Exception:
            data = {}

    assistant_content = (data.get("choices", [{}])[0] or {}).get("message", {}).get("content") if isinstance(data, dict) else None
    out = _extract_assistant_text(assistant_content).strip()
    return (out or src), (data if isinstance(data, dict) else {})


def _convert_audio_to_wav(raw: bytes, input_suffix: str) -> bytes:
    """Convertit n'importe quel format audio supporté par ffmpeg en wav PCM 16kHz mono."""

    if imageio_ffmpeg is None:
        raise RuntimeError("imageio-ffmpeg not installed")

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    in_suffix = input_suffix if input_suffix.startswith(".") else f".{input_suffix}"
    if not in_suffix or in_suffix == ".":
        in_suffix = ".webm"

    in_path = out_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=in_suffix, delete=False) as in_f:
            in_f.write(raw)
            in_path = in_f.name

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as out_f:
            out_path = out_f.name

        cmd = [
            ffmpeg_exe,
            "-y",
            "-i",
            in_path,
            "-ac",
            "1",
            "-ar",
            "16000",
            out_path,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            stderr = (proc.stderr or "").strip()
            raise RuntimeError(stderr or "ffmpeg conversion failed")

        with open(out_path, "rb") as f:
            return f.read()
    finally:
        for p in (in_path, out_path):
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass


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
    try:

        plan = await _get_user_plan(user_id)
        period = _month_key() if plan == "pro" else _iso_week_key()
        token_cap = await _get_token_cap(user_id, plan, period)
        used_int = await _get_tokens_used(user_id, plan, period)
        if used_int >= token_cap:
            return JSONResponse(
                status_code=402,
                content={
                    "error": "token_limit_reached",
                    "detail": f"Limite atteinte ({token_cap} tokens) pour la période {period}.",
                    "period": period,
                    "plan": plan,
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

        # Normalize audio to maximize compatibility.
        # Browser sends webm/ogg; STT endpoints are most reliable with wav/mp3.
        converted_to_wav = False
        if not _looks_like_supported_audio(file.filename, file.content_type):
            try:
                ext = os.path.splitext(file.filename or "")[1].lower() or ".webm"
                raw = _convert_audio_to_wav(raw, ext)
                converted_to_wav = True
            except Exception as exc:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": "audio_conversion_failed",
                        "detail": str(exc),
                    },
                )

            # Re-check size after conversion (wav can be larger)
            if len(raw) > 10 * 1024 * 1024:
                return JSONResponse(status_code=413, content={"error": "audio_too_large"})

        if not VOXTRAL_TRANSCRIBE_MODEL or not str(VOXTRAL_TRANSCRIBE_MODEL).strip():
            return JSONResponse(status_code=500, content={"error": "missing_voxtral_model"})

        model = str(VOXTRAL_TRANSCRIBE_MODEL).strip()

        spoken = ""
        fr = ""
        data: dict = {}
        try:
            forced = VOXTRAL_TRANSCRIBE_ENDPOINT
            use_transcriptions = False
            if forced == "transcriptions":
                use_transcriptions = True
            elif forced == "chat":
                use_transcriptions = False
            else:
                use_transcriptions = _should_use_transcriptions_endpoint(model)

            if use_transcriptions:
                # Standardize uploaded bytes as wav so we control codec/sample rate.
                # (If already mp3/wav, no conversion happened.)
                # Important: if we converted to wav, we must also update filename and content-type.
                filename = file.filename or ("audio.wav" if converted_to_wav else "audio")
                if converted_to_wav:
                    filename = "audio.wav"
                    ct = "audio/wav"
                else:
                    # Normalize content-type (strip codecs: "audio/webm;codecs=opus" -> "audio/webm")
                    ct_raw = ((file.content_type or "").split(";", 1)[0]).strip().lower()
                    ext = os.path.splitext(filename)[1].lower()
                    if ext == ".wav":
                        ct = "audio/wav"
                    elif ext == ".mp3":
                        ct = "audio/mpeg"
                    else:
                        ct = ct_raw or "application/octet-stream"
                spoken, meta = await _mistral_audio_transcriptions(
                    api_key=mistral_api_key,
                    model=model,
                    raw_audio=raw,
                    filename=filename,
                    content_type=ct,
                    language=None,
                )
                data = meta if isinstance(meta, dict) else {}
                fr, _tmeta = await _translate_to_french(api_key=mistral_api_key, text=spoken)
            else:
                audio_b64 = base64.b64encode(raw).decode("utf-8")
                s, t, meta = await _mistral_chat_audio_to_json(
                    api_key=mistral_api_key,
                    model=model,
                    audio_b64=audio_b64,
                )
                spoken = (s or "").strip()
                fr = (t or "").strip()
                data = meta if isinstance(meta, dict) else {}
        except RuntimeError as exc:
            # Helpers encode structured errors as JSON in the exception message.
            msg = str(exc)
            try:
                payload_err = json.loads(msg)
                code = str((payload_err or {}).get("error") or "")
                detail = (payload_err or {}).get("detail")
                status = int((payload_err or {}).get("status") or 502)
                if code:
                    return JSONResponse(status_code=status if 400 <= status <= 599 else 502, content={"error": code, "detail": detail})
            except Exception:
                pass
            return JSONResponse(status_code=502, content={"error": "mistral_api_error", "detail": msg})

        usage = data.get("usage") or {}
        total_tokens = usage.get("total_tokens")
        if total_tokens is None:
            # fallback approximation (audio is unknown -> minimal)
            approx_source = fr or spoken
            total_tokens = max(1, int(len(approx_source) / 4))

        await _add_tokens_used(user_id, plan, period, int(total_tokens))

        return {"spoken": spoken, "text": fr}

    except Exception as exc:
        # Last-resort safety: never return plain "Internal Server Error" without context.
        tb = traceback.format_exc()
        print("/api/transcribe internal error:")
        print(tb)
        return JSONResponse(
            status_code=500,
            content={
                "error": "transcribe_internal",
                "detail": f"{type(exc).__name__}: {exc}",
            },
        )


@app.get("/{full_path:path}", response_class=HTMLResponse)
async def spa_fallback(full_path: str):
    # Permet à Vite/React Router de fonctionner en prod (refresh sur /chat, etc.)
    if os.path.isfile(INTERFACE_INDEX):
        return FileResponse(INTERFACE_INDEX, headers={"Cache-Control": "no-store"})
    return HTMLResponse("Not Found", status_code=404)
