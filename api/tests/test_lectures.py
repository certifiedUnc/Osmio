from app.config import settings

from .conftest import auth


def test_record_lecture_creates_and_attaches(client, ids, instructor_token, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))

    resp = client.post(
        "/instructor/lectures/record",
        headers=auth(instructor_token),
        data={"course_id": ids["course"], "title": "Recorded lecture", "week": 3, "duration_s": 42},
        files={"file": ("lecture.webm", b"fake-webm-bytes", "video/webm")},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["title"] == "Recorded lecture"
    assert body["week"] == 3
    assert body["duration_s"] == 42
    assert body["status"] == "uploaded"
    assert body["published"] is False

    detail = client.get(f"/lectures/{body['id']}").json()
    assert detail["has_recording"] is True

    # The bytes actually landed on the uploads volume.
    assert any(p.read_bytes() == b"fake-webm-bytes" for p in tmp_path.iterdir())


def test_record_lecture_rejects_empty(client, ids, instructor_token, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    resp = client.post(
        "/instructor/lectures/record",
        headers=auth(instructor_token),
        data={"course_id": ids["course"], "title": "Empty", "week": 1, "duration_s": 0},
        files={"file": ("lecture.webm", b"", "video/webm")},
    )
    assert resp.status_code == 400


def test_recording_streams_to_enrolled_and_blocks_others(
    client, ids, student_token, instructor_token, tmp_path, monkeypatch
):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    payload = b"fake-webm-bytes-for-streaming"
    rec = client.post(
        "/instructor/lectures/record",
        headers=auth(instructor_token),
        data={"course_id": ids["course"], "title": "Streamable", "week": 1, "duration_s": 10},
        files={"file": ("lecture.webm", payload, "video/webm")},
    )
    lecture_id = rec.json()["id"]

    # The enrolled student can play the whole clip.
    full = client.get(f"/lectures/{lecture_id}/recording", headers=auth(student_token))
    assert full.status_code == 200
    assert full.content == payload
    assert "attachment" not in full.headers.get("content-disposition", "")

    # A scrubbing player sends Range headers; the server answers with partial content.
    ranged = client.get(
        f"/lectures/{lecture_id}/recording",
        headers={**auth(student_token), "Range": "bytes=0-3"},
    )
    assert ranged.status_code == 206
    assert ranged.content == payload[:4]

    # A student in no course cannot reach it.
    outsider = client.post("/auth/login", json={"email": "out@t.dev", "password": "password"}).json()["access_token"]
    assert client.get(f"/lectures/{lecture_id}/recording", headers=auth(outsider)).status_code == 403


def test_recording_missing_when_no_source(client, ids, student_token):
    # The seeded lecture has no recording attached.
    assert client.get(f"/lectures/{ids['lecture']}/recording", headers=auth(student_token)).status_code == 404


def test_record_lecture_requires_own_course(client, ids, student_token, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    # A student has no instructor role, so the endpoint's role guard rejects the request.
    resp = client.post(
        "/instructor/lectures/record",
        headers=auth(student_token),
        data={"course_id": ids["course"], "title": "Nope", "week": 1, "duration_s": 5},
        files={"file": ("lecture.webm", b"data", "video/webm")},
    )
    assert resp.status_code == 403
