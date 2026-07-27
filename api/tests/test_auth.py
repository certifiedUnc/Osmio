from .conftest import auth


def test_login_and_me(client, ids):
    resp = client.post("/auth/login", json={"email": "stu@t.dev", "password": "password"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    me = client.get("/auth/me", headers=auth(token))
    assert me.status_code == 200
    assert me.json()["email"] == "stu@t.dev"
    assert me.json()["role"] == "student"


def test_wrong_password_rejected(client, ids):
    resp = client.post("/auth/login", json={"email": "stu@t.dev", "password": "nope"})
    assert resp.status_code == 401


def test_unauthenticated_is_rejected(client, ids):
    assert client.get("/me/courses").status_code == 401


def test_student_cannot_create_quiz(client, ids, student_token):
    resp = client.post(
        f"/instructor/courses/{ids['course']}/quizzes",
        headers=auth(student_token),
        json={"title": "x", "questions": [{"prompt": "p", "options": ["a", "b"], "correct_index": 0}]},
    )
    assert resp.status_code == 403
