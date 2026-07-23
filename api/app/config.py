from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://osmio:osmio@db:5432/osmio"
    cors_origins: str = "http://localhost:3000"

    # Cloudflare Stream
    cf_account_id: str = ""
    cf_stream_token: str = ""

    # Groq (transcription)
    groq_api_key: str = ""

    class Config:
        env_file = ".env"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
