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

    detail = client.get(f"/lectures/{body['id']}", headers=auth(instructor_token)).json()
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
    payload = b"\x1a\x45\xdf\xa3" + b"webm-body-bytes-for-streaming"  # EBML magic + body
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
    assert full.headers["content-type"] == "video/webm"
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


def test_recording_serves_mp4_container(client, ids, student_token, instructor_token, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    # An mp4 recording (Safari's MediaRecorder) has 'ftyp' at bytes 4-8.
    mp4 = b"\x00\x00\x00\x18ftypmp42mp4-body"
    rec = client.post(
        "/instructor/lectures/record",
        headers=auth(instructor_token),
        data={"course_id": ids["course"], "title": "Safari clip", "week": 1, "duration_s": 5},
        files={"file": ("lecture.mp4", mp4, "video/mp4")},
    )
    got = client.get(f"/lectures/{rec.json()['id']}/recording", headers=auth(student_token))
    assert got.status_code == 200
    assert got.headers["content-type"] == "video/mp4"


def test_recording_missing_when_no_source(client, ids, student_token):
    # The seeded lecture has no recording attached.
    assert client.get(f"/lectures/{ids['lecture']}/recording", headers=auth(student_token)).status_code == 404


def _outsider(client):
    return client.post("/auth/login", json={"email": "out@t.dev", "password": "password"}).json()["access_token"]


def test_lecture_content_requires_auth_and_enrollment(client, ids, student_token):
    lid = ids["lecture"]  # published, in the course the seeded student is enrolled in
    assert client.get(f"/lectures/{lid}").status_code == 401
    assert client.get(f"/lectures/{lid}", headers=auth(student_token)).status_code == 200
    assert client.get(f"/lectures/{lid}", headers=auth(_outsider(client))).status_code == 403

    assert client.get(f"/lectures/{lid}/transcript.txt").status_code == 401
    assert client.get(f"/lectures/{lid}/transcript.txt", headers=auth(student_token)).status_code == 200
    assert client.get(f"/lectures/{lid}/transcript.txt", headers=auth(_outsider(client))).status_code == 403


def test_unpublished_lecture_hidden_from_students(client, ids, student_token, instructor_token, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    rec = client.post(
        "/instructor/lectures/record",
        headers=auth(instructor_token),
        data={"course_id": ids["course"], "title": "Draft", "week": 1, "duration_s": 5},
        files={"file": ("lecture.webm", b"\x1a\x45\xdf\xa3body", "video/webm")},
    )
    draft_id = rec.json()["id"]  # status uploaded, not published
    # Enrolled student gets a 404 (existence hidden); the course instructor can still see it.
    assert client.get(f"/lectures/{draft_id}", headers=auth(student_token)).status_code == 404
    assert client.get(f"/lectures/{draft_id}", headers=auth(instructor_token)).status_code == 200


def test_question_author_is_the_authenticated_user(client, ids, student_token):
    lid = ids["lecture"]
    assert client.post(f"/lectures/{lid}/questions", json={"timestamp_ms": 0, "body": "hi"}).status_code == 401
    resp = client.post(
        f"/lectures/{lid}/questions",
        headers=auth(student_token),
        json={"timestamp_ms": 0, "body": "hi", "author": "Prof Impersonator"},
    )
    assert resp.status_code == 200
    assert resp.json()["author"] == "Stu Dent"  # derived from the user, not the request body


def test_course_content_requires_access(client, ids, student_token):
    cid = ids["course"]
    out = _outsider(client)
    assert client.get(f"/courses/{cid}/announcements", headers=auth(student_token)).status_code == 200
    assert client.get(f"/courses/{cid}/assignments", headers=auth(student_token)).status_code == 200
    assert client.get(f"/courses/{cid}/announcements", headers=auth(out)).status_code == 403
    assert client.get(f"/courses/{cid}/assignments", headers=auth(out)).status_code == 403


def test_watch_events_require_enrollment(client, ids, student_token):
    lid = ids["lecture"]
    assert client.post("/me/events", headers=auth(student_token), json={"lecture_id": lid, "seconds": 10}).status_code == 204
    assert client.post("/me/events", headers=auth(_outsider(client)), json={"lecture_id": lid, "seconds": 10}).status_code == 403


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
