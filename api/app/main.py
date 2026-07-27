from contextlib import asynccontextmanager

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import admin, auth, discussions, instructor, lectures, me, partner, quizzes
from .seed import seed


def _run_migrations() -> None:
    # Bring the schema up to date via Alembic, then seed a demo course on a fresh database.
    command.upgrade(AlembicConfig("alembic.ini"), "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _run_migrations()
    seed()
    yield


app = FastAPI(title="osmio", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(instructor.router)
app.include_router(me.router)
app.include_router(lectures.router)
app.include_router(partner.router)
app.include_router(discussions.router)
app.include_router(quizzes.router)


@app.get("/health")
def health():
    return {"status": "ok"}
