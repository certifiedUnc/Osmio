# osmio

Lecture delivery platform for recorded lectures with synchronized transcripts and timestamped
Q&A, plus a licensable content API for partner apps.

## Running locally

Needs Docker and Node.

```bash
make install    # install web dependencies (first time only)
make dev        # start API + Postgres, then the web app
```

- Web: http://localhost:3000
- API: http://localhost:8000 (`/health`, `/docs`)

Log in with `admin@osmio.dev`, `instructor@osmio.dev`, or `student@osmio.dev` (password
`password`). On first boot the API creates the tables and seeds a demo course.

If ports 3000 or 8000 are taken, override them:

```bash
make dev API_PORT=8090 WEB_PORT=3100
```

Other tasks: `make down` (stop), `make reset` (stop and wipe the database), `make logs`.
Run `make` on its own to list everything.

For real video and transcripts, copy `api/.env.example` to `api/.env`, fill in the Cloudflare
Stream / Groq keys, then `make ingest COURSE=1 TITLE="..." WEEK=1 VIDEO_URL=...`.

## Layout

- `api/`: FastAPI + Postgres (auth, courses, lectures, transcripts, Q&A, calendar, partners)
- `web/`: Next.js frontend
