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

No `.env` files are required for a normal run; the defaults handle it.

## Commands

Run `make` with no arguments to list these.

| Command | What it does |
| --- | --- |
| `make install` | Install web dependencies (first time only) |
| `make dev` | Start the API + Postgres in the background, then the web app |
| `make up` | Start the API + Postgres in the background |
| `make api` | Start the API + Postgres in the foreground (with logs) |
| `make web` | Start just the web app |
| `make logs` | Tail the API logs |
| `make down` | Stop the API + Postgres (keeps the database) |
| `make reset` | Stop and wipe the database (reseeds on next start) |
| `make ingest` | Ingest a real lecture (see below) |

Variables, appended to any command:

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PORT` | `8000` | Host port for the API |
| `WEB_PORT` | `3000` | Host port for the web app (also sets the API's CORS origin) |

```bash
make dev API_PORT=8090 WEB_PORT=3100   # run on alternate ports when 3000/8000 are busy
make reset && make dev                 # start from a fresh, reseeded database
```

### Real video and transcripts (optional)

Not needed for a normal run. With Cloudflare Stream + Groq keys:

```bash
cp api/.env.example api/.env           # fill in CF_ACCOUNT_ID, CF_STREAM_TOKEN, GROQ_API_KEY
make ingest COURSE=1 TITLE="Ranking pages with PageRank" WEEK=7 \
  VIDEO_URL=https://your-host/lecture.mp4
```

## Layout

- `api/`: FastAPI + Postgres (auth, courses, lectures, transcripts, Q&A, calendar, partners)
- `web/`: Next.js frontend
