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

    class Config:
        env_file = ".env"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
