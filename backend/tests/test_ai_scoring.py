"""Iteration 3 — AI photo scoring tests (Gemini vision via Emergent LLM key)."""
import os
import time
import base64
import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = "https://gps-shelf-upload.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN = {"username": "admin", "password": "Admin@2026"}
REP01 = {"username": "rep01", "password": "Rep@2026"}
REP02 = {"username": "rep02", "password": "Rep@2026"}

C001_LAT, C001_LON = 40.37650, 49.83260


def _make_shelf_jpeg_b64() -> str:
    """Synthetic shelf photo with real visual features (rows, products, labels)."""
    img = Image.new('RGB', (640, 480), (220, 220, 200))
    d = ImageDraw.Draw(img)
    for y in (120, 240, 360):
        d.rectangle([0, y, 640, y + 5], fill=(80, 60, 40))
    colors = [(200, 30, 30), (30, 120, 200), (40, 160, 60),
              (220, 180, 30), (160, 30, 160), (220, 90, 30)]
    for row_y in (60, 180, 300, 420):
        for i, x in enumerate(range(10, 640, 80)):
            c = colors[(i + row_y) % len(colors)]
            d.rectangle([x, row_y - 50, x + 65, row_y + 50], fill=c, outline=(20, 20, 20))
            d.rectangle([x + 5, row_y - 30, x + 60, row_y - 10], fill=(255, 255, 255))
    import io
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=82)
    return base64.b64encode(buf.getvalue()).decode()


SHELF_JPEG_B64 = _make_shelf_jpeg_b64()


def auth_h(t): return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def rep01_login():
    r = requests.post(f"{API}/auth/login", json=REP01, timeout=15)
    assert r.status_code == 200
    j = r.json()
    return j["token"], j["user"]


@pytest.fixture(scope="module")
def rep02_login():
    r = requests.post(f"{API}/auth/login", json=REP02, timeout=15)
    assert r.status_code == 200
    j = r.json()
    return j["token"], j["user"]


# === Test 1: Upload returns ai_score=null, then scored after wait ===
class TestUploadTriggersBackgroundScoring:
    def test_upload_returns_ai_score_null_and_eventually_populated(self, rep01_login):
        token, _ = rep01_login
        body = {
            "customer_code": "C001",
            "latitude": C001_LAT, "longitude": C001_LON,
            "device_id": "ai-test-dev",
            "photo_base64": SHELF_JPEG_B64,
            "is_mocked": False,
        }
        r = requests.post(f"{API}/photo/upload", json=body, headers=auth_h(token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        photo_id = d["id"]
        # Response must include ai_score field and it must be null on immediate response
        assert "ai_score" in d
        assert d["ai_score"] is None

        # Wait for background scoring to complete
        ai_score = None
        for _ in range(15):  # up to 30s
            time.sleep(2)
            g = requests.get(f"{API}/photo/by-customer/C001", headers=auth_h(token), timeout=15)
            assert g.status_code == 200
            photos = g.json()
            target = next((p for p in photos if p["id"] == photo_id), None)
            assert target is not None, "Uploaded photo not found in by-customer list"
            if target.get("ai_score") is not None:
                ai_score = target["ai_score"]
                break
        assert ai_score is not None, "ai_score never populated after ~30s wait"
        # Either a populated score OR an explicit error dict
        if "error" in ai_score:
            assert isinstance(ai_score["error"], str)
        else:
            assert isinstance(ai_score.get("shelf_share_pct"), int)
            assert 0 <= ai_score["shelf_share_pct"] <= 100
            assert ai_score.get("quality") in ("good", "fair", "poor")
            assert ai_score.get("product_visibility") in ("good", "fair", "poor")
            assert isinstance(ai_score.get("notes", ""), str)
            assert len(ai_score.get("notes", "")) <= 240


# === Test 2: Rescore by admin returns populated ai_score (synchronous) ===
class TestRescoreEndpoint:
    @pytest.fixture(scope="class")
    def uploaded_photo_id(self, rep01_login):
        token, _ = rep01_login
        body = {
            "customer_code": "C001",
            "latitude": C001_LAT, "longitude": C001_LON,
            "device_id": "ai-rescore-dev",
            "photo_base64": SHELF_JPEG_B64,
            "is_mocked": False,
        }
        r = requests.post(f"{API}/photo/upload", json=body, headers=auth_h(token), timeout=20)
        assert r.status_code == 200
        return r.json()["id"]

    def test_rescore_admin_200_populated(self, admin_token, uploaded_photo_id):
        r = requests.post(f"{API}/photo/{uploaded_photo_id}/rescore",
                          headers=auth_h(admin_token), timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] == uploaded_photo_id
        ai = d.get("ai_score")
        assert ai is not None, "rescore must return populated ai_score"
        if "error" in ai:
            pytest.skip(f"AI scoring failed (LLM error): {ai['error']}")
        assert isinstance(ai.get("shelf_share_pct"), int)
        assert 0 <= ai["shelf_share_pct"] <= 100
        assert ai.get("quality") in ("good", "fair", "poor")
        assert ai.get("product_visibility") in ("good", "fair", "poor")
        assert isinstance(ai.get("notes", ""), str)
        assert len(ai.get("notes", "")) <= 240

    def test_rescore_invalid_id_404(self, admin_token):
        r = requests.post(f"{API}/photo/INVALID_ID_XYZ/rescore",
                          headers=auth_h(admin_token), timeout=15)
        assert r.status_code == 404, r.text

    def test_rescore_non_owner_403(self, rep02_login, uploaded_photo_id):
        # rep02 (SR002) is not owner of photo uploaded by rep01 (SR001)
        token, _ = rep02_login
        r = requests.post(f"{API}/photo/{uploaded_photo_id}/rescore",
                          headers=auth_h(token), timeout=15)
        assert r.status_code == 403, r.text

    def test_rescore_owner_can_rescore(self, rep01_login, uploaded_photo_id):
        token, _ = rep01_login
        r = requests.post(f"{API}/photo/{uploaded_photo_id}/rescore",
                          headers=auth_h(token), timeout=60)
        assert r.status_code == 200, r.text


# === Test 3: admin/photos contains ai_score field on each item ===
class TestAdminPhotosAIScoreField:
    def test_admin_photos_have_ai_score_key(self, admin_token):
        r = requests.get(f"{API}/admin/photos", headers=auth_h(admin_token), timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1, "Expected at least one uploaded photo from prior tests"
        for p in items:
            assert "ai_score" in p, f"Missing ai_score on photo {p.get('id')}"
            # ai_score may be None OR a dict
            assert (p["ai_score"] is None) or isinstance(p["ai_score"], dict)


# === Test 4: PhotoOut schema (by-customer) exposes ai_score field on all items ===
class TestByCustomerAIScoreField:
    def test_by_customer_has_ai_score_key(self, rep01_login):
        token, _ = rep01_login
        r = requests.get(f"{API}/photo/by-customer/C001", headers=auth_h(token), timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        for p in items:
            assert "ai_score" in p
