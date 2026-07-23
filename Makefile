# Osmio dev tasks.
# Ports default to 8000 (API) and 3000 (web). Override when they're busy, e.g.:
#   make dev API_PORT=8090 WEB_PORT=3100

API_PORT ?= 8000
WEB_PORT ?= 3000
API_URL  := http://localhost:$(API_PORT)

export API_PORT
export WEB_ORIGIN := http://localhost:$(WEB_PORT)

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: ## Install web dependencies
	cd web && npm install

.PHONY: up
up: ## Start API + Postgres in the background (builds if needed)
	docker compose up -d --build

.PHONY: api
api: ## Start API + Postgres in the foreground (with logs)
	docker compose up --build

.PHONY: web
web: ## Start the web app
	cd web && NEXT_PUBLIC_API_URL=$(API_URL) npm run dev -- -p $(WEB_PORT)

.PHONY: dev
dev: up web ## Start everything: API in the background, then the web app

.PHONY: logs
logs: ## Tail the API logs
	docker compose logs -f api

.PHONY: down
down: ## Stop API + Postgres
	docker compose down

.PHONY: reset
reset: ## Stop and wipe the database (reseeds on next start)
	docker compose down -v

.PHONY: ingest
ingest: ## Ingest a real lecture: make ingest COURSE=1 TITLE="..." WEEK=1 VIDEO_URL=...
	docker compose exec api python scripts/ingest_lecture.py \
		--course-id $(COURSE) --title "$(TITLE)" --week $(WEEK) --video-url "$(VIDEO_URL)"
