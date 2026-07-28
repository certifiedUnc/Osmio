from app.config import settings

from .conftest import auth


def test_upload_list_download_delete(client, ids, student_token, instructor_token, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    aid = ids["assignment"]

    up = client.post(
        f"/assignments/{aid}/files",
        headers=auth(student_token),
        files={"file": ("solution.py", b"print('hi')", "text/x-python")},
    )
    assert up.status_code == 201
    fid = up.json()["id"]
    assert up.json()["filename"] == "solution.py"
    assert up.json()["size_bytes"] == len(b"print('hi')")

    mine = client.get("/me/assignments", headers=auth(student_token)).json()
    a = next(x for x in mine if x["id"] == aid)
    assert [f["filename"] for f in a["submission"]["files"]] == ["solution.py"]

    owner_dl = client.get(f"/submission-files/{fid}", headers=auth(student_token))
    assert owner_dl.status_code == 200
    assert owner_dl.content == b"print('hi')"

    assert client.get(f"/submission-files/{fid}", headers=auth(instructor_token)).status_code == 200

    outsider = client.post("/auth/login", json={"email": "out@t.dev", "password": "password"}).json()["access_token"]
    assert client.get(f"/submission-files/{fid}", headers=auth(outsider)).status_code == 403

    assert client.delete(f"/submission-files/{fid}", headers=auth(student_token)).status_code == 204
    after = client.get("/me/assignments", headers=auth(student_token)).json()
    assert next(x for x in after if x["id"] == aid)["submission"]["files"] == []


def test_unenrolled_student_cannot_upload(client, ids):
    outsider = client.post("/auth/login", json={"email": "out@t.dev", "password": "password"}).json()["access_token"]
    resp = client.post(
        f"/assignments/{ids['assignment']}/files",
        headers=auth(outsider),
        files={"file": ("x.txt", b"data", "text/plain")},
    )
    assert resp.status_code == 403
