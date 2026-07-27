from app.config import settings

from .conftest import TEST_KEY


def test_missing_key_rejected(client, ids):
    assert client.get("/partner/v1/courses").status_code == 401


def test_bad_key_rejected(client, ids):
    assert client.get("/partner/v1/courses", headers={"X-API-Key": "osk_wrong_xxx"}).status_code == 401


def test_lists_only_licensed_courses(client, ids):
    resp = client.get("/partner/v1/courses", headers={"X-API-Key": TEST_KEY})
    assert resp.status_code == 200
    codes = [c["code"] for c in resp.json()]
    assert codes == ["CS1"]  # licensed for CS1, not CS2


def test_unlicensed_course_forbidden(client, ids):
    resp = client.get(f"/partner/v1/courses/{ids['course2']}", headers={"X-API-Key": TEST_KEY})
    assert resp.status_code == 403


def test_usage_meter_counts_calls(client, ids):
    for _ in range(3):
        client.get("/partner/v1/courses", headers={"X-API-Key": TEST_KEY})
    usage = client.get("/partner/v1/usage", headers={"X-API-Key": TEST_KEY}).json()
    assert usage["partner"] == "TestCo"
    assert usage["total"] >= 4  # 3 course calls + the usage call


def test_rate_limit_returns_429(client, ids, monkeypatch):
    monkeypatch.setattr(settings, "partner_rate_limit_per_min", 2)
    codes = [client.get("/partner/v1/courses", headers={"X-API-Key": TEST_KEY}).status_code for _ in range(3)]
    assert codes[:2] == [200, 200]
    assert codes[2] == 429
