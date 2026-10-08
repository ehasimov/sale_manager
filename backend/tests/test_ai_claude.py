"""Backend tests for new Claude AI features (chat, report-summary, models, ai_feedback)."""
import os
import json
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://gps-shelf-upload.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "admin", "password": "Admin@2026"}
REP01 = {"username": "rep01", "password": "Rep@2026"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    return j["token"], j["user"]


@pytest.fixture(scope="session")
def admin_auth():
    return _login(ADMIN)


@pytest.fixture(scope="session")
def rep01_auth():
    return _login(REP01)


def h(token):
    return {"Authorization": f"Bearer {token}"}


def parse_sse(resp, max_time=90):
    """Yield (event, data_dict) tuples from an SSE response."""
    event = None
    buf = []
    started = time.time()
    for raw in resp.iter_lines(decode_unicode=True):
        if time.time() - started > max_time:
            break
        if raw is None:
            continue
        line = raw.strip("\r")
        if line == "":
            if event is not None:
                data_str = "\n".join(buf)
                try:
                    data = json.loads(data_str) if data_str else {}
                except Exception:
                    data = {"_raw": data_str}
                yield event, data
            event, buf = None, []
            continue
        if line.startswith("event:"):
            event = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            buf.append(line.split(":", 1)[1].lstrip())


# ------- /api/ai/models -------
class TestAiModels:
    def test_models_requires_auth(self):
        r = requests.get(f"{API}/ai/models", timeout=15)
        assert r.status_code == 401

    def test_models_returns_three(self, rep01_auth):
        token, _ = rep01_auth
        r = requests.get(f"{API}/ai/models", headers=h(token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) == 3
        keys = sorted([m["key"] for m in data])
        assert keys == ["haiku-4.5", "sonnet-5", "sonnet-5.5"]
        for m in data:
            assert m["key"] and m["model"] and m["label"]


# ------- /api/ai/chat (SSE) -------
class TestAiChat:
    def test_chat_requires_auth(self):
        r = requests.post(f"{API}/ai/chat", json={"message": "salam"}, timeout=15)
        assert r.status_code == 401

    def test_chat_empty_message_422(self, rep01_auth):
        token, _ = rep01_auth
        r = requests.post(f"{API}/ai/chat", json={"message": ""}, headers=h(token), timeout=15)
        assert r.status_code == 422

    def test_chat_too_long_422(self, rep01_auth):
        token, _ = rep01_auth
        r = requests.post(f"{API}/ai/chat", json={"message": "x" * 2001}, headers=h(token), timeout=15)
        assert r.status_code == 422

    def _run_chat(self, token, message, model=None):
        payload = {"message": message}
        if model is not None:
            payload["model"] = model
        with requests.post(f"{API}/ai/chat", json=payload, headers=h(token),
                           stream=True, timeout=100) as r:
            assert r.status_code == 200, f"status {r.status_code}: {r.text[:200]}"
            assert "text/event-stream" in r.headers.get("content-type", "")
            events = list(parse_sse(r, max_time=90))
        return events

    def test_chat_rep01_haiku_streams(self, rep01_auth):
        token, _ = rep01_auth
        events = self._run_chat(token, "Salam! Zəhmət olmasa qısa olaraq bu həftəki vəziyyətimi de.", model="haiku-4.5")
        kinds = [e[0] for e in events]
        assert "meta" in kinds, kinds
        assert kinds.count("delta") >= 1, f"no deltas: {events[:3]}"
        assert "done" in kinds, kinds
        meta = next(d for k, d in events if k == "meta")
        assert "claude-haiku-4-5" in meta["model"]
        done = next(d for k, d in events if k == "done")
        assert "id" in done and "model" in done and "created_at" in done
        full = "".join(d["text"] for k, d in events if k == "delta")
        assert len(full) > 10

    def test_chat_default_model_is_sonnet_5_5(self, admin_auth):
        token, _ = admin_auth
        events = self._run_chat(token, "Bu həftə üçün qısa icmal ver.")
        meta = next(d for k, d in events if k == "meta")
        assert meta["model"] == "claude-sonnet-5-5"

    def test_chat_invalid_model_falls_back_to_default(self, rep01_auth):
        token, _ = rep01_auth
        events = self._run_chat(token, "qısa cavab ver", model="totally-bogus-model")
        meta = next(d for k, d in events if k == "meta")
        assert meta["model"] == "claude-sonnet-5-5"


# ------- /api/ai/chat/history -------
class TestAiChatHistory:
    def test_history_no_token_401(self):
        r = requests.get(f"{API}/ai/chat/history", timeout=15)
        assert r.status_code == 401

    def test_history_persists_per_user_isolated(self, rep01_auth, admin_auth):
        rtok, _ = rep01_auth
        atok, _ = admin_auth
        # Clear rep01 first for clean slate
        requests.delete(f"{API}/ai/chat/history", headers=h(rtok), timeout=15)
        # Send a chat as rep01
        marker = "UNIQUE_REP01_MARKER_12345"
        with requests.post(f"{API}/ai/chat", json={"message": marker, "model": "haiku-4.5"},
                           headers=h(rtok), stream=True, timeout=100) as r:
            assert r.status_code == 200
            list(parse_sse(r, max_time=90))
        time.sleep(1)
        rhist = requests.get(f"{API}/ai/chat/history", headers=h(rtok), timeout=15).json()
        assert any(m["role"] == "user" and marker in m["content"] for m in rhist)
        assert any(m["role"] == "assistant" for m in rhist)
        # Admin must not see rep01's marker
        ahist = requests.get(f"{API}/ai/chat/history", headers=h(atok), timeout=15).json()
        assert not any(marker in (m.get("content") or "") for m in ahist)

    def test_history_delete_clears(self, rep01_auth):
        token, _ = rep01_auth
        d = requests.delete(f"{API}/ai/chat/history", headers=h(token), timeout=15)
        assert d.status_code == 200
        body = d.json()
        assert "deleted" in body and isinstance(body["deleted"], int)
        after = requests.get(f"{API}/ai/chat/history", headers=h(token), timeout=15).json()
        assert after == []


# ------- /api/ai/report-summary -------
class TestAiReportSummary:
    def test_rep_cannot_call_summary_403(self, rep01_auth):
        token, _ = rep01_auth
        r = requests.post(f"{API}/ai/report-summary", json={}, headers=h(token), timeout=15)
        assert r.status_code == 403

    def test_rep_cannot_get_latest_403(self, rep01_auth):
        token, _ = rep01_auth
        r = requests.get(f"{API}/ai/report-summary/latest", headers=h(token), timeout=15)
        assert r.status_code == 403

    def test_admin_summary_streams_and_latest_matches(self, admin_auth):
        token, _ = admin_auth
        with requests.post(f"{API}/ai/report-summary", json={"model": "haiku-4.5"},
                           headers=h(token), stream=True, timeout=120) as r:
            assert r.status_code == 200
            events = list(parse_sse(r, max_time=100))
        kinds = [e[0] for e in events]
        assert "meta" in kinds and "done" in kinds and kinds.count("delta") >= 1, kinds
        streamed = "".join(d["text"] for k, d in events if k == "delta").strip()
        assert len(streamed) > 20
        # Fetch latest
        time.sleep(1)
        latest = requests.get(f"{API}/ai/report-summary/latest", headers=h(token), timeout=15)
        assert latest.status_code == 200
        body = latest.json()
        assert body is not None
        for k in ("text", "model", "created_at"):
            assert k in body
        # Text matches what streamed (saved as stripped full)
        assert body["text"] == streamed


# ------- PhotoOut ai_feedback field regression -------
class TestPhotoAiFeedbackField:
    def test_admin_photos_includes_ai_feedback_key(self, admin_auth):
        token, _ = admin_auth
        r = requests.get(f"{API}/admin/photos", headers=h(token), timeout=20)
        assert r.status_code == 200
        photos = r.json()
        assert isinstance(photos, list)
        if photos:
            for p in photos[:5]:
                assert "ai_feedback" in p
                if p["ai_feedback"] is not None:
                    for k in ("text", "model", "created_at"):
                        assert k in p["ai_feedback"]

    def test_by_customer_includes_ai_feedback_key(self, rep01_auth):
        token, _ = rep01_auth
        r = requests.get(f"{API}/photo/by-customer/C001", headers=h(token), timeout=20)
        assert r.status_code == 200
        photos = r.json()
        assert isinstance(photos, list)
        if photos:
            for p in photos[:5]:
                assert "ai_feedback" in p


# ------- Regression: core endpoints still work -------
class TestRegression:
    def test_login_still_works(self):
        r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
        assert r.status_code == 200

    def test_reports_weekly(self, admin_auth):
        token, _ = admin_auth
        r = requests.get(f"{API}/reports/weekly", headers=h(token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ("total", "on_track", "overdue", "not_visited", "completion_pct", "items"):
            assert k in d

    def test_admin_analytics(self, admin_auth):
        token, _ = admin_auth
        r = requests.get(f"{API}/admin/analytics", headers=h(token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ("week_uploads", "by_rep", "total_uploads", "fake_gps_count",
                  "locked_customers", "total_customers"):
            assert k in d
