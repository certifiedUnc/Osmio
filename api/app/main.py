from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import Base, engine
from .routers import auth, lectures
from .seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    # PoC: create tables and seed a demo course on boot. Move to Alembic before the MVP.
    Base.metadata.create_all(engine)
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
app.include_router(lectures.router)


@app.get("/health")
def health():
    return {"status": "ok"}
