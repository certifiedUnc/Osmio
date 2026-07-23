# osmio

Lecture delivery platform — recorded lectures with synchronized transcripts and timestamped
Q&A, plus a licensable content API for partner apps.

## Running locally

Needs Docker.

```bash
docker compose up --build
```

- API: http://localhost:8000 (`/health`, `/docs`)
- Postgres: localhost:5432 (`osmio` / `osmio`)

On first boot the API creates the tables and seeds a demo course so there's something to look
at. Copy `api/.env.example` to `api/.env` and fill in the Cloudflare Stream / Groq keys when
wiring video and transcription.

## Layout

- `api/` — FastAPI + Postgres (courses, lectures, transcripts, questions)
- `web/` — frontend (coming next)
