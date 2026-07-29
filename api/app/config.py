from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://osmio:osmio@db:5432/osmio"
    cors_origins: str = "http://localhost:3000"

    # Auth
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 60 * 24 * 7

    # Cloudflare Stream
    cf_account_id: str = ""
    cf_stream_token: str = ""

    # Groq (transcription)
    groq_api_key: str = ""

    # Processing pipeline: delay per stage so status is observable while polling (seconds).
    pipeline_stage_delay_s: float = 1.5

    # Partner content API: max requests per key per minute before returning 429.
    partner_rate_limit_per_min: int = 60

    # Assignment file uploads. Stored on a local volume for now; swap for object storage in prod.
    upload_dir: str = "/data/uploads"
    max_upload_bytes: int = 25 * 1024 * 1024  # 25 MB

    # Lecture recordings captured in the browser. Larger than a document upload; the transcriber
    # still tops out around Groq's 25 MB limit, past which it falls back to a placeholder transcript.
    max_recording_bytes: int = 200 * 1024 * 1024  # 200 MB

    class Config:
        env_file = ".env"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
