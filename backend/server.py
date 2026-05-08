from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import math
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field


# =========================
# Config
# =========================
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
GPS_RADIUS_METERS = float(os.environ.get("GPS_RADIUS_METERS", "30"))

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
async def compute_customer_status(customer_code: str) -> tuple[str, Optional[datetime]]:
    last = await db.photo_uploads.find_one(
        {"customer_code": customer_code},
        sort=[("upload_date", -1)],
        projection={"_id": 0, "upload_date": 1},
    )
    if not last:
        return "not_visited", None
    last_dt = last["upload_date"]
    if isinstance(last_dt, str):
        last_dt = datetime.fromisoformat(last_dt)
    if last_dt.tzinfo is None:
        last_dt = last_dt.replace(tzinfo=timezone.utc)
    age = utc_now() - last_dt
    if age > timedelta(days=7):
        return "delayed", last_dt
    return "uploaded", last_dt


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
        status_str, last_dt = await compute_customer_status(c["customer_code"])
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
    status_str, last_dt = await compute_customer_status(customer_code)
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
    status_str, last_dt = await compute_customer_status(body.customer_code)
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
        ))
    return out


# =========================
# Admin Endpoints
# =========================
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
    status_str, last_dt = await compute_customer_status(customer_code)
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
        {"customer_code": "C001", "customer_name": "Bravo Market - Sahil",        "latitude": 40.37650, "longitude": 49.83260, "location_locked": True,  "route_code": "R001", "sales_rep_code": "SR001"},
        {"customer_code": "C002", "customer_name": "Araz Market - 28 May",         "latitude": 40.37973, "longitude": 49.84931, "location_locked": True,  "route_code": "R001", "sales_rep_code": "SR001"},
        {"customer_code": "C003", "customer_name": "OBA Market - Targovi",         "latitude": None,     "longitude": None,     "location_locked": False, "route_code": "R001", "sales_rep_code": "SR001"},
        {"customer_code": "C004", "customer_name": "Spar Express - Ichari Shahar", "latitude": 40.36631, "longitude": 49.83401, "location_locked": True,  "route_code": "R002", "sales_rep_code": "SR001"},
        {"customer_code": "C005", "customer_name": "Bazarstore - Yasamal",         "latitude": None,     "longitude": None,     "location_locked": False, "route_code": "R002", "sales_rep_code": "SR002"},
    ]
    for sc in seed_customers:
        existing = await db.customers.find_one({"customer_code": sc["customer_code"]})
        if not existing:
            doc = {"id": str(uuid.uuid4()), **sc, "location_set_at": None, "location_set_by": None}
            await db.customers.insert_one(doc)

    logger.info("Seed complete")


@app.on_event("startup")
async def on_startup():
    await seed()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
