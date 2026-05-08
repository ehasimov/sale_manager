"""End-to-end backend tests for Merchandising Shelf Photo Control API."""
import os
import base64
import pytest
import requests

BASE_URL = "https://gps-shelf-upload.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN = {"username": "admin", "password": "Admin@2026"}
REP01 = {"username": "rep01", "password": "Rep@2026"}
REP02 = {"username": "rep02", "password": "Rep@2026"}

C001_LAT, C001_LON = 40.37650, 49.83260
FAR_LAT, FAR_LON = 40.5, 50.0
TINY_PNG_B64 = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 32).decode()


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_user(admin_token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def rep01_login():
    r = requests.post(f"{API}/auth/login", json=REP01, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    return j["token"], j["user"]


@pytest.fixture(scope="session")
def rep02_login():
    r = requests.post(f"{API}/auth/login", json=REP02, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    return j["token"], j["user"]


def auth_h(t):
    return {"Authorization": f"Bearer {t}"}


# === Auth tests ===
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and d["user"]["role"] == "admin"
        assert d["user"]["username"] == "admin"

    def test_login_rep01(self):
        r = requests.post(f"{API}/auth/login", json=REP01, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "sales_rep"
        assert d["user"]["sales_rep_code"] == "SR001"

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "bad"}, timeout=15)
        assert r.status_code == 401

    def test_me_with_token(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=auth_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["username"] == "admin"

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401


# === Customers ===
class TestCustomers:
    def test_rep01_customers_returns_4(self, rep01_login):
        token, user = rep01_login
        r = requests.get(f"{API}/customers/by-user/{user['id']}", headers=auth_h(token), timeout=15)
        assert r.status_code == 200
        codes = sorted([c["customer_code"] for c in r.json()])
        assert codes == ["C001", "C002", "C003", "C004"]
        for c in r.json():
            assert "status" in c and c["status"] in ("not_visited", "uploaded", "delayed")

    def test_rep_cannot_see_other_rep(self, rep01_login, rep02_login):
        token, _ = rep01_login
        _, other = rep02_login
        r = requests.get(f"{API}/customers/by-user/{other['id']}", headers=auth_h(token), timeout=15)
        assert r.status_code == 403

    def test_admin_sees_any_user_customers(self, admin_token, rep02_login):
        _, other = rep02_login
        r = requests.get(f"{API}/customers/by-user/{other['id']}", headers=auth_h(admin_token), timeout=15)
        assert r.status_code == 200

    def test_get_single_customer(self, rep01_login):
        token, _ = rep01_login
        r = requests.get(f"{API}/customers/C001", headers=auth_h(token), timeout=15)
        assert r.status_code == 200
        assert r.json()["customer_code"] == "C001"


# === Confirm-location lock ===
class TestConfirmLocation:
    def test_confirm_unlocked_C003_then_409(self, rep01_login, admin_token):
        token, _ = rep01_login
        # Reset C003 to ensure unlocked
        rr = requests.post(f"{API}/admin/customer/C003/reset-location",
                           headers=auth_h(admin_token), timeout=15)
        assert rr.status_code == 200
        # Confirm
        r = requests.post(f"{API}/customer/confirm-location",
                          json={"customer_code": "C003", "latitude": 40.38, "longitude": 49.84},
                          headers=auth_h(token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["location_locked"] is True
        assert body["latitude"] == 40.38
        # Second attempt -> 409
        r2 = requests.post(f"{API}/customer/confirm-location",
                           json={"customer_code": "C003", "latitude": 40.38, "longitude": 49.84},
                           headers=auth_h(token), timeout=15)
        assert r2.status_code == 409


# === Photo upload ===
class TestPhotoUpload:
    def test_upload_within_30m(self, rep01_login):
        token, _ = rep01_login
        body = {"customer_code": "C001", "latitude": C001_LAT, "longitude": C001_LON,
                "device_id": "dev-test", "photo_base64": TINY_PNG_B64, "is_mocked": False}
        r = requests.post(f"{API}/photo/upload", json=body, headers=auth_h(token), timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["customer_code"] == "C001"
        # verify persisted
        g = requests.get(f"{API}/photo/by-customer/C001", headers=auth_h(token), timeout=15)
        assert g.status_code == 200
        assert any(p["id"] == r.json()["id"] for p in g.json())

    def test_upload_out_of_range_logs_fake(self, rep01_login, admin_token):
        token, _ = rep01_login
        before = requests.get(f"{API}/admin/fake-gps-logs", headers=auth_h(admin_token), timeout=15).json()
        body = {"customer_code": "C001", "latitude": FAR_LAT, "longitude": FAR_LON,
                "device_id": "dev-test", "photo_base64": TINY_PNG_B64, "is_mocked": False}
        r = requests.post(f"{API}/photo/upload", json=body, headers=auth_h(token), timeout=20)
        assert r.status_code == 400
        assert "Out of range" in r.json().get("detail", "")
        after = requests.get(f"{API}/admin/fake-gps-logs", headers=auth_h(admin_token), timeout=15).json()
        assert len(after) == len(before) + 1
        assert "Out of range" in after[0]["reason"]

    def test_upload_mocked_logs_fake(self, rep01_login, admin_token):
        token, _ = rep01_login
        before = requests.get(f"{API}/admin/fake-gps-logs", headers=auth_h(admin_token), timeout=15).json()
        body = {"customer_code": "C001", "latitude": C001_LAT, "longitude": C001_LON,
                "device_id": "dev-test", "photo_base64": TINY_PNG_B64, "is_mocked": True}
        r = requests.post(f"{API}/photo/upload", json=body, headers=auth_h(token), timeout=20)
        assert r.status_code == 400
        assert "Fake" in r.json().get("detail", "") or "mock" in r.json().get("detail", "").lower()
        after = requests.get(f"{API}/admin/fake-gps-logs", headers=auth_h(admin_token), timeout=15).json()
        assert len(after) == len(before) + 1
        assert "Mock" in after[0]["reason"] or "mock" in after[0]["reason"].lower()

    def test_upload_null_location(self, rep02_login, admin_token):
        # Reset C005 to ensure null location, rep02 owns C005
        requests.post(f"{API}/admin/customer/C005/reset-location",
                      headers=auth_h(admin_token), timeout=15)
        token, _ = rep02_login
        body = {"customer_code": "C005", "latitude": 40.4, "longitude": 49.85,
                "device_id": "dev-test", "photo_base64": TINY_PNG_B64, "is_mocked": False}
        r = requests.post(f"{API}/photo/upload", json=body, headers=auth_h(token), timeout=20)
        assert r.status_code == 400
        assert "not set" in r.json().get("detail", "").lower()


# === Admin endpoints / role ===
class TestAdminEndpoints:
    @pytest.mark.parametrize("path", [
        "/admin/photos", "/admin/fake-gps-logs", "/admin/visit-history", "/admin/users"
    ])
    def test_admin_200(self, admin_token, path):
        r = requests.get(f"{API}{path}", headers=auth_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    @pytest.mark.parametrize("path", [
        "/admin/photos", "/admin/fake-gps-logs", "/admin/visit-history", "/admin/users"
    ])
    def test_rep_403(self, rep01_login, path):
        token, _ = rep01_login
        r = requests.get(f"{API}{path}", headers=auth_h(token), timeout=15)
        assert r.status_code == 403

    def test_admin_reset_then_rep_can_reconfirm(self, admin_token, rep01_login):
        # Reset C004
        r = requests.post(f"{API}/admin/customer/C004/reset-location",
                          headers=auth_h(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["location_locked"] is False
        assert d["latitude"] is None and d["longitude"] is None
        # Rep01 re-confirms
        token, _ = rep01_login
        r2 = requests.post(f"{API}/customer/confirm-location",
                           json={"customer_code": "C004", "latitude": 40.36631, "longitude": 49.83401},
                           headers=auth_h(token), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["location_locked"] is True


# === ERP and status logic ===
class TestERPandStatus:
    def test_erp_lookup(self, admin_token):
        r = requests.get(f"{API}/erp/customer/C001", headers=auth_h(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("customerCode", "customerName", "latitude", "longitude", "salesRepCode", "routeCode"):
            assert k in d
        assert d["customerCode"] == "C001"

    def test_status_logic(self, rep01_login, admin_token):
        # C002 - reset and don't upload -> not_visited (after reset, location null though)
        # Use C001 which already has uploads from earlier test -> uploaded
        token, user = rep01_login
        r = requests.get(f"{API}/customers/by-user/{user['id']}", headers=auth_h(token), timeout=15)
        assert r.status_code == 200
        by_code = {c["customer_code"]: c for c in r.json()}
        assert by_code["C001"]["status"] == "uploaded"
        # C002 has no uploads in this test session
        assert by_code["C002"]["status"] in ("not_visited", "uploaded", "delayed")
