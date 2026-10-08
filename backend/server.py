from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import math
import json
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, status
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field


# =========================
# Config
# =========================
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
GPS_RADIUS_METERS = float(os.environ.get("GPS_RADIUS_METERS", "30"))

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("merch")


# =========================
# Helpers
# =========================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, username: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# =========================
# AI photo scoring (Gemini vision via Emergent LLM key)
# =========================
async def score_photo_async(photo_id: str, photo_base64: str) -> None:
    """Background task: ask Gemini to score the shelf photo and write result back to MongoDB."""
    if not EMERGENT_LLM_KEY or not photo_base64:
        return
    try:
        import json as _json
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"score-{photo_id}",
            system_message=(
                "You are a retail-merchandising auditor. Analyse the SHELF photo and respond with "
                "ONLY a compact JSON object on a single line. No prose, no markdown, no code fences. "
                "Schema: {\"shelf_share_pct\": int 0-100, \"quality\": \"good|fair|poor\", "
                "\"product_visibility\": \"good|fair|poor\", \"notes\": \"<=2 short sentences\"}."
            ),
        ).with_model("gemini", "gemini-2.5-flash")

        message = UserMessage(
            text=(
                "Score this shelf photo. shelf_share_pct = estimated % of visible shelf occupied by our brand "
                "(if not identifiable, treat dominant SKU as our brand). quality assesses focus, lighting, framing. "
                "product_visibility assesses how clearly individual SKUs can be read. Return only the JSON."
            ),
            file_contents=[ImageContent(image_base64=photo_base64)],
        )
        response = await chat.send_message(message)
        text = response.strip() if isinstance(response, str) else str(response).strip()
        # Strip code fences if any
        if text.startswith("```"):
            text = text.strip("`")
            if text.startswith("json"):
                text = text[4:]
        # Pick first {...} block
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("No JSON in response")
        parsed = _json.loads(text[start : end + 1])
        score = {
            "shelf_share_pct": int(max(0, min(100, parsed.get("shelf_share_pct", 0)))),
            "quality": str(parsed.get("quality", "fair")).lower(),
            "product_visibility": str(parsed.get("product_visibility", "fair")).lower(),
            "notes": str(parsed.get("notes", ""))[:240],
            "scored_at": utc_now(),
            "model": "gemini-2.5-flash",
        }
        # Normalise enums
        for k in ("quality", "product_visibility"):
            if score[k] not in ("good", "fair", "poor"):
                score[k] = "fair"
        await db.photo_uploads.update_one({"id": photo_id}, {"$set": {"ai_score": score}})
        logger.info(f"AI scored photo {photo_id}: share={score['shelf_share_pct']}")
        await generate_photo_feedback(photo_id, score)
    except Exception as e:
        logger.warning(f"AI scoring failed for {photo_id}: {e}")
        await db.photo_uploads.update_one(
            {"id": photo_id},
            {"$set": {"ai_score": {"error": str(e)[:160], "scored_at": utc_now()}}},
        )


# =========================
# Claude AI (text) — photo feedback, report summary, assistant chat
# =========================
CLAUDE_MODELS = {
    "sonnet-5.5": "claude-sonnet-5-5",
    "sonnet-5": "claude-sonnet-5",
    "haiku-4.5": "claude-haiku-4-5-20251001",
}
DEFAULT_CLAUDE = "sonnet-5.5"

LANG_RULE = "Always answer in Azerbaijani unless the user clearly writes in another language. Be concise, practical and friendly."

FEEDBACK_SYSTEM = (
    "You are a field-merchandising coach for sales representatives. You receive the AI vision score of a shelf photo "
    "(shelf share %, photo quality, product visibility, notes). Write 2-3 short sentences: what is good, what to fix on the "
    "shelf or in the photo, and one concrete next action. No headings, no bullet lists, no markdown. " + LANG_RULE
)

SUMMARY_SYSTEM = (
    "You are a retail sales operations analyst. You receive this week's visit-compliance data for a merchandising team. "
    "Write a compact executive summary for the manager with these sections in plain text (one short line each heading, no markdown #): "
    "1) Ümumi vəziyyət (overall status with the key numbers) 2) Diqqət tələb edən müştərilər (overdue / never visited — name up to 6) "
    "3) Nümayəndələr (who performs well, who is behind) 4) Risklər (fake GPS, unlocked locations, low shelf share) 5) Tövsiyələr (3 concrete actions). "
    "Keep it under 220 words. " + LANG_RULE
)

CHAT_SYSTEM = (
    "You are the in-app assistant of a merchandising / shelf-photo control app used by sales representatives and their managers. "
    "Reps visit customer stores and upload shelf photos only when within 30 m of the store's GPS location; each customer has a weekly visit plan. "
    "Use the live context below to answer questions about customers, visits, overdue stores, routes and AI shelf scores. "
    "If something is not in the context, say so honestly. Keep answers short (max ~120 words) and use plain text only: no markdown, no ** bold, no tables. " + LANG_RULE
)


def resolve_claude_model(key: Optional[str]) -> tuple[str, str]:
    k = key if key in CLAUDE_MODELS else DEFAULT_CLAUDE
    return k, CLAUDE_MODELS[k]


def make_claude_chat(session_id: str, system_message: str, model_key: Optional[str] = None, history: Optional[list[dict]] = None):
    from emergentintegrations.llm.chat import LlmChat

    _, model = resolve_claude_model(model_key)
    initial = [{"role": "system", "content": system_message}] + (history or [])
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_message,
        initial_messages=initial,
    ).with_model("anthropic", model)


async def stream_claude(chat, text: str):
    from emergentintegrations.llm.chat import UserMessage, TextDelta, StreamDone

    async for ev in chat.stream_message(UserMessage(text=text)):
        if isinstance(ev, TextDelta):
            yield ev.content
        elif isinstance(ev, StreamDone):
            break


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"}


async def generate_photo_feedback(photo_id: str, score: dict) -> None:
    """Runs after Gemini scoring (still in background): Claude writes a short coaching note for the rep."""
    if not EMERGENT_LLM_KEY:
        return
    try:
        p = await db.photo_uploads.find_one({"id": photo_id}, {"_id": 0, "customer_code": 1})
        cust = await db.customers.find_one({"customer_code": p["customer_code"]}, {"_id": 0, "customer_name": 1}) if p else None
        customer_name = cust.get("customer_name") if cust else p.get("customer_code") if p else "?"
        model_key, model = resolve_claude_model(DEFAULT_CLAUDE)
        chat = make_claude_chat(f"feedback-{photo_id}", FEEDBACK_SYSTEM, model_key)
        prompt = (
            f"Müştəri: {customer_name}. Rəf payı: {score.get('shelf_share_pct')}%. "
            f"Şəkil keyfiyyəti: {score.get('quality')}. Məhsul görünürlüyü: {score.get('product_visibility')}. "
            f"Vizual qeydlər: {score.get('notes') or '-'}"
        )
        text = ""
        async for chunk in stream_claude(chat, prompt):
            text += chunk
        await db.photo_uploads.update_one(
            {"id": photo_id},
            {"$set": {"ai_feedback": {"text": text.strip()[:1200], "model": model, "created_at": utc_now()}}},
        )
        logger.info(f"Claude feedback written for photo {photo_id}")
    except Exception as e:
        logger.warning(f"Claude feedback failed for {photo_id}: {e}")


# =========================
# Models
# =========================
class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: str
    username: str
    name: str
    role: Literal["admin", "sales_rep"]
    sales_rep_code: Optional[str] = None


class LoginResponse(BaseModel):
    token: str
    user: UserOut


class CustomerOut(BaseModel):
    id: str
    customer_code: str
    customer_name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_locked: bool
    route_code: Optional[str] = None
    sales_rep_code: Optional[str] = None
    status: Literal["not_visited", "uploaded", "delayed"] = "not_visited"
    last_upload_at: Optional[str] = None
    visits_per_week: int = 1
    visits_this_week: int = 0


class ScheduleRequest(BaseModel):
    visits_per_week: int = Field(ge=0, le=7)


class ConfirmLocationRequest(BaseModel):
    customer_code: str
    latitude: float
    longitude: float


class PhotoUploadRequest(BaseModel):
    customer_code: str
    latitude: float
    longitude: float
    device_id: str
    photo_base64: str  # data without prefix
    is_mocked: bool = False


class PhotoOut(BaseModel):
    id: str
    customer_code: str
    customer_name: Optional[str] = None
    user_code: str
    username: Optional[str] = None
    latitude: float
    longitude: float
    distance: float
    upload_date: str
    device_id: str
    photo_base64: str
    ai_score: Optional[dict] = None
    ai_feedback: Optional[dict] = None


class FakeGpsLogOut(BaseModel):
    id: str
    user_code: str
    username: Optional[str] = None
    customer_code: Optional[str] = None
    latitude: float
    longitude: float
    reason: str
    created_at: str


# =========================
# App + Router
# =========================
app = FastAPI(title="Merchandising Shelf Photo Control API")
api = APIRouter(prefix="/api")


# =========================
# Auth dependency
# =========================
async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# =========================
# Status helpers
# =========================
async def compute_customer_status(customer_code: str, visits_per_week: int = 1) -> tuple[str, Optional[datetime], int]:
    """Returns (status, last_upload_dt, visits_this_week)."""
    week_ago = utc_now() - timedelta(days=7)
    visits_this_week = await db.photo_uploads.count_documents({
        "customer_code": customer_code,
        "upload_date": {"$gte": week_ago},
    })
    last = await db.photo_uploads.find_one(
        {"customer_code": customer_code},
        sort=[("upload_date", -1)],
        projection={"_id": 0, "upload_date": 1},
    )
    if not last:
        return "not_visited", None, visits_this_week
    last_dt = last["upload_date"]
    if isinstance(last_dt, str):
        last_dt = datetime.fromisoformat(last_dt)
    if last_dt.tzinfo is None:
        last_dt = last_dt.replace(tzinfo=timezone.utc)
    if visits_per_week > 0 and visits_this_week >= visits_per_week:
        return "uploaded", last_dt, visits_this_week
    if (utc_now() - last_dt) > timedelta(days=7):
        return "delayed", last_dt, visits_this_week
    return "uploaded", last_dt, visits_this_week


# =========================
# Auth Endpoints
# =========================
@api.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    username = body.username.strip().lower()
    user = await db.users.find_one({"username": username})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token(user["id"], user["username"], user["role"])
    return LoginResponse(
        token=token,
        user=UserOut(
            id=user["id"],
            username=user["username"],
            name=user["name"],
            role=user["role"],
            sales_rep_code=user.get("sales_rep_code"),
        ),
    )


@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(
        id=user["id"],
        username=user["username"],
        name=user["name"],
        role=user["role"],
        sales_rep_code=user.get("sales_rep_code"),
    )


# =========================
# Customer Endpoints
# =========================
@api.get("/customers/by-user/{user_id}", response_model=List[CustomerOut])
async def customers_by_user(user_id: str, current: dict = Depends(get_current_user)):
    if current["role"] != "admin" and current["id"] != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    rep_code = target.get("sales_rep_code")
    query = {"sales_rep_code": rep_code} if rep_code else {}
    cursor = db.customers.find(query, {"_id": 0}).sort("customer_code", 1)
    out: list[CustomerOut] = []
    async for c in cursor:
        vpw = int(c.get("visits_per_week", 1))
        status_str, last_dt, vtw = await compute_customer_status(c["customer_code"], vpw)
        out.append(
            CustomerOut(
                id=c["id"],
                customer_code=c["customer_code"],
                customer_name=c["customer_name"],
                latitude=c.get("latitude"),
                longitude=c.get("longitude"),
                location_locked=bool(c.get("location_locked", False)),
                route_code=c.get("route_code"),
                sales_rep_code=c.get("sales_rep_code"),
                status=status_str,  # type: ignore
                last_upload_at=iso(last_dt),
                visits_per_week=vpw,
                visits_this_week=vtw,
            )
        )
    return out


@api.get("/customers/{customer_code}", response_model=CustomerOut)
async def get_customer(customer_code: str, current: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"customer_code": customer_code}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    if current["role"] != "admin" and c.get("sales_rep_code") != current.get("sales_rep_code"):
        raise HTTPException(status_code=403, detail="Forbidden")
    vpw = int(c.get("visits_per_week", 1))
    status_str, last_dt, vtw = await compute_customer_status(customer_code, vpw)
    return CustomerOut(
        id=c["id"],
        customer_code=c["customer_code"],
        customer_name=c["customer_name"],
        latitude=c.get("latitude"),
        longitude=c.get("longitude"),
        location_locked=bool(c.get("location_locked", False)),
        route_code=c.get("route_code"),
        sales_rep_code=c.get("sales_rep_code"),
        status=status_str,  # type: ignore
        last_upload_at=iso(last_dt),
        visits_per_week=vpw,
        visits_this_week=vtw,
    )


@api.post("/customer/confirm-location", response_model=CustomerOut)
async def confirm_location(body: ConfirmLocationRequest, current: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"customer_code": body.customer_code}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    if current["role"] != "admin" and c.get("sales_rep_code") != current.get("sales_rep_code"):
        raise HTTPException(status_code=403, detail="Forbidden")
    if c.get("location_locked"):
        raise HTTPException(status_code=409, detail="Location is locked. Contact admin to reset.")
    await db.customers.update_one(
        {"customer_code": body.customer_code},
        {
            "$set": {
                "latitude": float(body.latitude),
                "longitude": float(body.longitude),
                "location_locked": True,
                "location_set_at": utc_now(),
                "location_set_by": current["id"],
            }
        },
    )
    c2 = await db.customers.find_one({"customer_code": body.customer_code}, {"_id": 0})
    vpw = int(c2.get("visits_per_week", 1))
    status_str, last_dt, vtw = await compute_customer_status(body.customer_code, vpw)
    return CustomerOut(
        id=c2["id"],
        customer_code=c2["customer_code"],
        customer_name=c2["customer_name"],
        latitude=c2.get("latitude"),
        longitude=c2.get("longitude"),
        location_locked=True,
        route_code=c2.get("route_code"),
        sales_rep_code=c2.get("sales_rep_code"),
        status=status_str,  # type: ignore
        last_upload_at=iso(last_dt),
        visits_per_week=vpw,
        visits_this_week=vtw,
    )


# =========================
# Photo Upload
# =========================
@api.post("/photo/upload", response_model=PhotoOut)
async def upload_photo(body: PhotoUploadRequest, current: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"customer_code": body.customer_code}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    if current["role"] != "admin" and c.get("sales_rep_code") != current.get("sales_rep_code"):
        raise HTTPException(status_code=403, detail="Forbidden")

    if c.get("latitude") is None or c.get("longitude") is None:
        raise HTTPException(status_code=400, detail="Customer location not set")

    if body.is_mocked:
        await db.fake_gps_logs.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": current["id"],
            "user_code": current.get("sales_rep_code") or current["username"],
            "username": current["username"],
            "customer_code": body.customer_code,
            "latitude": body.latitude,
            "longitude": body.longitude,
            "reason": "Mock location detected by device",
            "created_at": utc_now(),
        })
        raise HTTPException(status_code=400, detail="Fake/mock GPS detected. Upload blocked.")

    distance = haversine_meters(c["latitude"], c["longitude"], body.latitude, body.longitude)
    if distance > GPS_RADIUS_METERS:
        await db.fake_gps_logs.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": current["id"],
            "user_code": current.get("sales_rep_code") or current["username"],
            "username": current["username"],
            "customer_code": body.customer_code,
            "latitude": body.latitude,
            "longitude": body.longitude,
            "reason": f"Out of range: {distance:.1f}m (limit {GPS_RADIUS_METERS}m)",
            "created_at": utc_now(),
        })
        raise HTTPException(
            status_code=400,
            detail=f"Out of range: {distance:.1f}m. Move within {int(GPS_RADIUS_METERS)}m of the customer.",
        )

    photo_id = str(uuid.uuid4())
    now = utc_now()
    photo_doc = {
        "id": photo_id,
        "customer_code": body.customer_code,
        "user_id": current["id"],
        "user_code": current.get("sales_rep_code") or current["username"],
        "username": current["username"],
        "latitude": float(body.latitude),
        "longitude": float(body.longitude),
        "distance": float(distance),
        "photo_base64": body.photo_base64,
        "upload_date": now,
        "device_id": body.device_id,
    }
    await db.photo_uploads.insert_one(photo_doc)

    # Fire-and-forget AI scoring (don't block upload response)
    import asyncio as _asyncio
    _asyncio.create_task(score_photo_async(photo_id, body.photo_base64))

    return PhotoOut(
        id=photo_id,
        customer_code=body.customer_code,
        customer_name=c["customer_name"],
        user_code=photo_doc["user_code"],
        username=current["username"],
        latitude=photo_doc["latitude"],
        longitude=photo_doc["longitude"],
        distance=photo_doc["distance"],
        upload_date=iso(now),
        device_id=body.device_id,
        photo_base64=body.photo_base64,
        ai_score=None,
    )


@api.get("/photo/by-customer/{customer_code}", response_model=List[PhotoOut])
async def photos_by_customer(customer_code: str, current: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"customer_code": customer_code}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    if current["role"] != "admin" and c.get("sales_rep_code") != current.get("sales_rep_code"):
        raise HTTPException(status_code=403, detail="Forbidden")
    cursor = db.photo_uploads.find({"customer_code": customer_code}, {"_id": 0}).sort("upload_date", -1)
    out: list[PhotoOut] = []
    async for p in cursor:
        out.append(PhotoOut(
            id=p["id"],
            customer_code=p["customer_code"],
            customer_name=c["customer_name"],
            user_code=p.get("user_code", ""),
            username=p.get("username"),
            latitude=p["latitude"],
            longitude=p["longitude"],
            distance=p["distance"],
            upload_date=iso(p["upload_date"]),
            device_id=p.get("device_id", ""),
            photo_base64=p.get("photo_base64", ""),
            ai_score=p.get("ai_score"),
            ai_feedback=p.get("ai_feedback"),
        ))
    return out


# =========================
# Admin Endpoints
# =========================
@api.post("/photo/{photo_id}/rescore", response_model=PhotoOut)
async def photo_rescore(photo_id: str, current: dict = Depends(get_current_user)):
    p = await db.photo_uploads.find_one({"id": photo_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Photo not found")
    if current["role"] != "admin" and p.get("user_id") != current["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    await score_photo_async(photo_id, p.get("photo_base64", ""))
    p2 = await db.photo_uploads.find_one({"id": photo_id}, {"_id": 0})
    cust = await db.customers.find_one({"customer_code": p2["customer_code"]}, {"_id": 0, "customer_name": 1})
    return PhotoOut(
        id=p2["id"],
        customer_code=p2["customer_code"],
        customer_name=cust.get("customer_name") if cust else None,
        user_code=p2.get("user_code", ""),
        username=p2.get("username"),
        latitude=p2["latitude"],
        longitude=p2["longitude"],
        distance=p2["distance"],
        upload_date=iso(p2["upload_date"]),
        device_id=p2.get("device_id", ""),
        photo_base64=p2.get("photo_base64", ""),
        ai_score=p2.get("ai_score"),
        ai_feedback=p2.get("ai_feedback"),
    )


@api.get("/admin/photos", response_model=List[PhotoOut])
async def admin_all_photos(_: dict = Depends(require_admin)):
    cursor = db.photo_uploads.find({}, {"_id": 0}).sort("upload_date", -1).limit(500)
    out: list[PhotoOut] = []
    async for p in cursor:
        cust = await db.customers.find_one({"customer_code": p["customer_code"]}, {"_id": 0, "customer_name": 1})
        out.append(PhotoOut(
            id=p["id"],
            customer_code=p["customer_code"],
            customer_name=cust.get("customer_name") if cust else None,
            user_code=p.get("user_code", ""),
            username=p.get("username"),
            latitude=p["latitude"],
            longitude=p["longitude"],
            distance=p["distance"],
            upload_date=iso(p["upload_date"]),
            device_id=p.get("device_id", ""),
            photo_base64=p.get("photo_base64", ""),
            ai_score=p.get("ai_score"),
            ai_feedback=p.get("ai_feedback"),
        ))
    return out


@api.get("/admin/fake-gps-logs", response_model=List[FakeGpsLogOut])
async def admin_fake_gps_logs(_: dict = Depends(require_admin)):
    cursor = db.fake_gps_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(500)
    out: list[FakeGpsLogOut] = []
    async for l in cursor:
        out.append(FakeGpsLogOut(
            id=l["id"],
            user_code=l.get("user_code", ""),
            username=l.get("username"),
            customer_code=l.get("customer_code"),
            latitude=l["latitude"],
            longitude=l["longitude"],
            reason=l["reason"],
            created_at=iso(l["created_at"]),
        ))
    return out


class VisitHistoryItem(BaseModel):
    user_code: str
    username: Optional[str] = None
    customer_code: str
    customer_name: Optional[str] = None
    upload_date: str
    distance: float


@api.get("/admin/visit-history", response_model=List[VisitHistoryItem])
async def admin_visit_history(_: dict = Depends(require_admin)):
    cursor = db.photo_uploads.find({}, {"_id": 0}).sort("upload_date", -1).limit(500)
    out: list[VisitHistoryItem] = []
    async for p in cursor:
        cust = await db.customers.find_one({"customer_code": p["customer_code"]}, {"_id": 0, "customer_name": 1})
        out.append(VisitHistoryItem(
            user_code=p.get("user_code", ""),
            username=p.get("username"),
            customer_code=p["customer_code"],
            customer_name=cust.get("customer_name") if cust else None,
            upload_date=iso(p["upload_date"]),
            distance=p["distance"],
        ))
    return out


@api.post("/admin/customer/{customer_code}/reset-location", response_model=CustomerOut)
async def admin_reset_location(customer_code: str, _: dict = Depends(require_admin)):
    c = await db.customers.find_one({"customer_code": customer_code}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    await db.customers.update_one(
        {"customer_code": customer_code},
        {"$set": {"latitude": None, "longitude": None, "location_locked": False, "location_set_at": None, "location_set_by": None}},
    )
    c2 = await db.customers.find_one({"customer_code": customer_code}, {"_id": 0})
    vpw = int(c2.get("visits_per_week", 1))
    status_str, last_dt, vtw = await compute_customer_status(customer_code, vpw)
    return CustomerOut(
        id=c2["id"],
        customer_code=c2["customer_code"],
        customer_name=c2["customer_name"],
        latitude=c2.get("latitude"),
        longitude=c2.get("longitude"),
        location_locked=False,
        route_code=c2.get("route_code"),
        sales_rep_code=c2.get("sales_rep_code"),
        status=status_str,  # type: ignore
        last_upload_at=iso(last_dt),
        visits_per_week=vpw,
        visits_this_week=vtw,
    )


@api.post("/admin/customer/{customer_code}/schedule", response_model=CustomerOut)
async def admin_set_schedule(customer_code: str, body: ScheduleRequest, _: dict = Depends(require_admin)):
    c = await db.customers.find_one({"customer_code": customer_code}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    await db.customers.update_one(
        {"customer_code": customer_code},
        {"$set": {"visits_per_week": int(body.visits_per_week)}},
    )
    c2 = await db.customers.find_one({"customer_code": customer_code}, {"_id": 0})
    vpw = int(c2.get("visits_per_week", 1))
    status_str, last_dt, vtw = await compute_customer_status(customer_code, vpw)
    return CustomerOut(
        id=c2["id"],
        customer_code=c2["customer_code"],
        customer_name=c2["customer_name"],
        latitude=c2.get("latitude"),
        longitude=c2.get("longitude"),
        location_locked=bool(c2.get("location_locked", False)),
        route_code=c2.get("route_code"),
        sales_rep_code=c2.get("sales_rep_code"),
        status=status_str,  # type: ignore
        last_upload_at=iso(last_dt),
        visits_per_week=vpw,
        visits_this_week=vtw,
    )


# =========================
# Reports & Analytics
# =========================
class WeeklyReportRow(BaseModel):
    customer_code: str
    customer_name: str
    sales_rep_code: Optional[str] = None
    route_code: Optional[str] = None
    visits_per_week: int
    visits_this_week: int
    last_upload_at: Optional[str] = None
    status: str  # not_visited | uploaded | delayed


class WeeklyReportSummary(BaseModel):
    total: int
    on_track: int
    overdue: int
    not_visited: int
    completion_pct: int
    items: List[WeeklyReportRow]


class DayBucket(BaseModel):
    date: str
    count: int


class AnalyticsOut(BaseModel):
    week_uploads: List[DayBucket]
    by_rep: List[dict]
    total_uploads: int
    fake_gps_count: int
    locked_customers: int
    total_customers: int


@api.get("/reports/weekly", response_model=WeeklyReportSummary)
async def weekly_report(current: dict = Depends(get_current_user)):
    """Weekly visit report. Sales rep sees only their customers; admin sees all."""
    if current["role"] == "admin":
        cursor = db.customers.find({}, {"_id": 0}).sort("customer_code", 1)
    else:
        rep_code = current.get("sales_rep_code")
        if not rep_code:
            return WeeklyReportSummary(total=0, on_track=0, overdue=0, not_visited=0, completion_pct=0, items=[])
        cursor = db.customers.find({"sales_rep_code": rep_code}, {"_id": 0}).sort("customer_code", 1)

    items: list[WeeklyReportRow] = []
    on_track = 0
    overdue = 0
    not_visited = 0
    async for c in cursor:
        vpw = int(c.get("visits_per_week", 1))
        status_str, last_dt, vtw = await compute_customer_status(c["customer_code"], vpw)
        if status_str == "uploaded":
            on_track += 1
        elif status_str == "delayed":
            overdue += 1
        else:
            not_visited += 1
        items.append(WeeklyReportRow(
            customer_code=c["customer_code"],
            customer_name=c["customer_name"],
            sales_rep_code=c.get("sales_rep_code"),
            route_code=c.get("route_code"),
            visits_per_week=vpw,
            visits_this_week=vtw,
            last_upload_at=iso(last_dt),
            status=status_str,
        ))
    total = len(items)
    completion = round((on_track / total) * 100) if total else 0
    return WeeklyReportSummary(total=total, on_track=on_track, overdue=overdue, not_visited=not_visited, completion_pct=completion, items=items)


@api.get("/admin/analytics", response_model=AnalyticsOut)
async def admin_analytics(_: dict = Depends(require_admin)):
    """7-day uploads bucketed by day + per-rep totals."""
    now = utc_now()
    week_start = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
    buckets: list[DayBucket] = []
    for i in range(7):
        day_start = week_start + timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        count = await db.photo_uploads.count_documents({
            "upload_date": {"$gte": day_start, "$lt": day_end}
        })
        buckets.append(DayBucket(date=day_start.date().isoformat(), count=count))

    # by rep
    pipeline = [
        {"$match": {"upload_date": {"$gte": week_start}}},
        {"$group": {"_id": {"user_code": "$user_code", "username": "$username"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    by_rep_raw = await db.photo_uploads.aggregate(pipeline).to_list(length=50)
    by_rep = [
        {"user_code": r["_id"].get("user_code"), "username": r["_id"].get("username"), "count": r["count"]}
        for r in by_rep_raw
    ]

    total_uploads = await db.photo_uploads.count_documents({})
    fake_gps_count = await db.fake_gps_logs.count_documents({})
    locked_customers = await db.customers.count_documents({"location_locked": True})
    total_customers = await db.customers.count_documents({})

    return AnalyticsOut(
        week_uploads=buckets,
        by_rep=by_rep,
        total_uploads=total_uploads,
        fake_gps_count=fake_gps_count,
        locked_customers=locked_customers,
        total_customers=total_customers,
    )


@api.get("/admin/users", response_model=List[UserOut])
async def admin_users(_: dict = Depends(require_admin)):
    cursor = db.users.find({}, {"_id": 0, "password_hash": 0}).sort("username", 1)
    out: list[UserOut] = []
    async for u in cursor:
        out.append(UserOut(
            id=u["id"],
            username=u["username"],
            name=u["name"],
            role=u["role"],
            sales_rep_code=u.get("sales_rep_code"),
        ))
    return out


# =========================
# ERP integration (mock service)
# =========================
@api.get("/erp/customer/{customer_code}")
async def erp_lookup(customer_code: str, _: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"customer_code": customer_code}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found in ERP")
    return {
        "customerCode": c["customer_code"],
        "customerName": c["customer_name"],
        "latitude": c.get("latitude"),
        "longitude": c.get("longitude"),
        "salesRepCode": c.get("sales_rep_code"),
        "routeCode": c.get("route_code"),
    }


@api.get("/")
async def root():
    return {"app": "merchandising", "ok": True}


# =========================
# Claude AI endpoints
# =========================
class AiModelOut(BaseModel):
    key: str
    model: str
    label: str


class AiSummaryRequest(BaseModel):
    model: Optional[str] = None


class AiSummaryOut(BaseModel):
    text: str
    model: str
    created_at: str


class AiChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    model: Optional[str] = None


class AiChatMessageOut(BaseModel):
    id: str
    role: str  # user | assistant
    content: str
    model: Optional[str] = None
    created_at: str


AI_MODEL_LABELS = {"sonnet-5.5": "Claude Sonnet 5.5", "sonnet-5": "Claude Sonnet 5", "haiku-4.5": "Claude Haiku 4.5"}


async def build_ai_context(current: dict) -> str:
    """Compact live snapshot of the user's (or whole team's) week for Claude prompts."""
    rep = await weekly_report(current)
    lines = [
        f"Bu həftə: cəmi {rep.total} müştəri, {rep.on_track} plan üzrə, {rep.overdue} gecikmiş, "
        f"{rep.not_visited} ziyarət olunmayıb, tamamlanma {rep.completion_pct}%."
    ]
    lines.append("Müştərilər (kod | ad | nümayəndə | marşrut | ziyarət bu həftə/plan | status | son yükləmə):")
    for it in rep.items[:60]:
        lines.append(
            f"- {it.customer_code} | {it.customer_name} | {it.sales_rep_code or '-'} | {it.route_code or '-'} | "
            f"{it.visits_this_week}/{it.visits_per_week} | {it.status} | {it.last_upload_at[:10] if it.last_upload_at else 'heç vaxt'}"
        )
    if len(rep.items) > 60:
        lines.append(f"... və daha {len(rep.items) - 60} müştəri.")

    photo_filter: dict = {} if current["role"] == "admin" else {"user_id": current["id"]}
    photo_filter["ai_score.shelf_share_pct"] = {"$exists": True}
    cursor = db.photo_uploads.find(photo_filter, {"_id": 0, "customer_code": 1, "ai_score": 1, "upload_date": 1}).sort("upload_date", -1).limit(15)
    scored = [s async for s in cursor]
    if scored:
        avg = round(sum(s["ai_score"]["shelf_share_pct"] for s in scored) / len(scored))
        lines.append(f"Son {len(scored)} şəklin orta AI rəf payı: {avg}%. Detallar: " + "; ".join(
            f"{s['customer_code']} {s['ai_score']['shelf_share_pct']}% ({s['ai_score'].get('quality')})" for s in scored
        ))

    if current["role"] == "admin":
        an = await admin_analytics(current)
        lines.append(
            "Son 7 gün yükləmələr: " + ", ".join(f"{d.date}: {d.count}" for d in an.week_uploads)
            + f". Cəmi yükləmə: {an.total_uploads}. Saxta GPS siqnalları: {an.fake_gps_count}. "
            f"Kilidlənmiş lokasiya: {an.locked_customers}/{an.total_customers}."
        )
        if an.by_rep:
            lines.append("Nümayəndə üzrə bu həftə: " + ", ".join(f"{r.get('username') or r.get('user_code')} = {r['count']}" for r in an.by_rep[:10]))
    return "\n".join(lines)


@api.get("/ai/models", response_model=List[AiModelOut])
async def ai_models(_: dict = Depends(get_current_user)):
    return [AiModelOut(key=k, model=v, label=AI_MODEL_LABELS[k]) for k, v in CLAUDE_MODELS.items()]


@api.post("/ai/report-summary")
async def ai_report_summary(body: AiSummaryRequest, current: dict = Depends(require_admin)):
    """Admin: stream a Claude-written executive summary of this week's visit report (SSE)."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="AI is not configured")
    model_key, model = resolve_claude_model(body.model)
    context = await build_ai_context(current)
    chat = make_claude_chat(f"summary-{current['id']}-{uuid.uuid4().hex[:8]}", SUMMARY_SYSTEM, model_key)

    async def gen():
        full = ""
        try:
            yield sse("meta", {"model": model})
            async for chunk in stream_claude(chat, "Həftəlik məlumat:\n" + context):
                full += chunk
                yield sse("delta", {"text": chunk})
            now = utc_now()
            await db.ai_summaries.insert_one({
                "id": str(uuid.uuid4()), "user_id": current["id"], "text": full.strip(), "model": model, "created_at": now,
            })
            yield sse("done", {"model": model, "created_at": iso(now)})
        except Exception as e:
            logger.warning(f"Claude summary failed: {e}")
            yield sse("error", {"message": str(e)[:200]})

    return StreamingResponse(gen(), media_type="text/event-stream", headers=SSE_HEADERS)


@api.get("/ai/report-summary/latest", response_model=Optional[AiSummaryOut])
async def ai_report_summary_latest(_: dict = Depends(require_admin)):
    doc = await db.ai_summaries.find_one({}, {"_id": 0}, sort=[("created_at", -1)])
    if not doc:
        return None
    return AiSummaryOut(text=doc["text"], model=doc["model"], created_at=iso(doc["created_at"]))


@api.get("/ai/chat/history", response_model=List[AiChatMessageOut])
async def ai_chat_history(current: dict = Depends(get_current_user)):
    cursor = db.ai_chat_messages.find({"user_id": current["id"]}, {"_id": 0}).sort("created_at", -1).limit(60)
    docs = [d async for d in cursor]
    docs.reverse()
    return [AiChatMessageOut(id=d["id"], role=d["role"], content=d["content"], model=d.get("model"), created_at=iso(d["created_at"])) for d in docs]


@api.delete("/ai/chat/history")
async def ai_chat_clear(current: dict = Depends(get_current_user)):
    res = await db.ai_chat_messages.delete_many({"user_id": current["id"]})
    return {"deleted": res.deleted_count}


@api.post("/ai/chat")
async def ai_chat(body: AiChatRequest, current: dict = Depends(get_current_user)):
    """Assistant chat with live visit context. Streams Claude tokens as SSE; history persisted per user."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="AI is not configured")
    model_key, model = resolve_claude_model(body.model)

    hist_cursor = db.ai_chat_messages.find({"user_id": current["id"]}, {"_id": 0, "role": 1, "content": 1}).sort("created_at", -1).limit(20)
    history = [h async for h in hist_cursor]
    history.reverse()

    context = await build_ai_context(current)
    who = f"İstifadəçi: {current.get('name') or current['username']} (rol: {current['role']}, kod: {current.get('sales_rep_code') or '-'})."
    chat = make_claude_chat(f"chat-{current['id']}", f"{CHAT_SYSTEM}\n\n{who}\n\nCANLI KONTEKST:\n{context}", model_key, history)

    now = utc_now()
    await db.ai_chat_messages.insert_one({
        "id": str(uuid.uuid4()), "user_id": current["id"], "role": "user", "content": body.message, "created_at": now,
    })

    async def gen():
        full = ""
        try:
            yield sse("meta", {"model": model})
            async for chunk in stream_claude(chat, body.message):
                full += chunk
                yield sse("delta", {"text": chunk})
            msg_id = str(uuid.uuid4())
            done_at = utc_now()
            await db.ai_chat_messages.insert_one({
                "id": msg_id, "user_id": current["id"], "role": "assistant", "content": full.strip(), "model": model, "created_at": done_at,
            })
            yield sse("done", {"id": msg_id, "model": model, "created_at": iso(done_at)})
        except Exception as e:
            logger.warning(f"Claude chat failed: {e}")
            yield sse("error", {"message": str(e)[:200]})

    return StreamingResponse(gen(), media_type="text/event-stream", headers=SSE_HEADERS)


# =========================
# Mount + CORS
# =========================
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# Seed
# =========================
async def seed():
    await db.users.create_index("username", unique=True)
    await db.customers.create_index("customer_code", unique=True)
    await db.photo_uploads.create_index("customer_code")
    await db.photo_uploads.create_index("upload_date")
    await db.fake_gps_logs.create_index("created_at")

    admin_username = os.environ["ADMIN_USERNAME"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    rep_username = os.environ["SALES_REP_USERNAME"].lower()
    rep_password = os.environ["SALES_REP_PASSWORD"]

    # Admin
    a = await db.users.find_one({"username": admin_username})
    if not a:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": admin_username,
            "name": "Administrator",
            "role": "admin",
            "sales_rep_code": None,
            "password_hash": hash_password(admin_password),
            "created_at": utc_now(),
        })
    else:
        if not verify_password(admin_password, a["password_hash"]):
            await db.users.update_one({"username": admin_username}, {"$set": {"password_hash": hash_password(admin_password)}})

    # Sales rep 01
    r = await db.users.find_one({"username": rep_username})
    if not r:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": rep_username,
            "name": "Aydin Memmedov",
            "role": "sales_rep",
            "sales_rep_code": "SR001",
            "password_hash": hash_password(rep_password),
            "created_at": utc_now(),
        })
    else:
        if not verify_password(rep_password, r["password_hash"]):
            await db.users.update_one({"username": rep_username}, {"$set": {"password_hash": hash_password(rep_password)}})

    # Sales rep 02
    r2 = await db.users.find_one({"username": "rep02"})
    if not r2:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": "rep02",
            "name": "Leyla Huseynova",
            "role": "sales_rep",
            "sales_rep_code": "SR002",
            "password_hash": hash_password("Rep@2026"),
            "created_at": utc_now(),
        })

    # Customers — Baku coordinates near Fountain Square
    seed_customers = [
        {"customer_code": "C001", "customer_name": "Bravo Market - Sahil",        "latitude": 40.37650, "longitude": 49.83260, "location_locked": True,  "route_code": "R001", "sales_rep_code": "SR001", "visits_per_week": 1},
        {"customer_code": "C002", "customer_name": "Araz Market - 28 May",         "latitude": 40.37973, "longitude": 49.84931, "location_locked": True,  "route_code": "R001", "sales_rep_code": "SR001", "visits_per_week": 1},
        {"customer_code": "C003", "customer_name": "OBA Market - Targovi",         "latitude": None,     "longitude": None,     "location_locked": False, "route_code": "R001", "sales_rep_code": "SR001", "visits_per_week": 1},
        {"customer_code": "C004", "customer_name": "Spar Express - Ichari Shahar", "latitude": 40.36631, "longitude": 49.83401, "location_locked": True,  "route_code": "R002", "sales_rep_code": "SR001", "visits_per_week": 2},
        {"customer_code": "C005", "customer_name": "Bazarstore - Yasamal",         "latitude": None,     "longitude": None,     "location_locked": False, "route_code": "R002", "sales_rep_code": "SR002", "visits_per_week": 1},
    ]
    for sc in seed_customers:
        existing = await db.customers.find_one({"customer_code": sc["customer_code"]})
        if not existing:
            doc = {"id": str(uuid.uuid4()), **sc, "location_set_at": None, "location_set_by": None}
            await db.customers.insert_one(doc)
        else:
            # Ensure visits_per_week exists on existing rows
            if existing.get("visits_per_week") is None:
                await db.customers.update_one(
                    {"customer_code": sc["customer_code"]},
                    {"$set": {"visits_per_week": sc["visits_per_week"]}},
                )

    logger.info("Seed complete")


@app.on_event("startup")
async def on_startup():
    await seed()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
