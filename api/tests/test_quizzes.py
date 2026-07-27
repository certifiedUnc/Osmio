from .conftest import auth


def test_quiz_hides_correct_answer(client, ids, student_token):
    resp = client.get(f"/quizzes/{ids['quiz']}", headers=auth(student_token))
    assert resp.status_code == 200
    q = resp.json()["questions"][0]
    assert "correct_index" not in q
    assert q["options"] == ["3", "4", "5"]


def test_correct_attempt_scores_full(client, ids, student_token):
    resp = client.post(f"/quizzes/{ids['quiz']}/attempts", headers=auth(student_token), json={"answers": [1]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["score"] == 1 and body["total"] == 1
    assert body["results"][0]["is_correct"] is True


def test_wrong_attempt_scores_zero(client, ids, student_token):
    body = client.post(f"/quizzes/{ids['quiz']}/attempts", headers=auth(student_token), json={"answers": [0]}).json()
    assert body["score"] == 0
    assert body["results"][0]["correct_index"] == 1


def test_instructor_creates_quiz(client, ids, instructor_token):
    resp = client.post(
        f"/instructor/courses/{ids['course']}/quizzes",
        headers=auth(instructor_token),
        json={"title": "New quiz", "questions": [{"prompt": "Pick b", "options": ["a", "b"], "correct_index": 1}]},
    )
    assert resp.status_code == 201
    assert resp.json()["question_count"] == 1
