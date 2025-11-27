import os
from pydantic import BaseModel


class Settings(BaseModel):
    database_host: str = os.getenv("DATABASE_HOST", "localhost")
    database_port: int = int(os.getenv("DATABASE_PORT", "5432"))
    database_name: str = os.getenv("DATABASE_NAME", "aml")
    database_user: str = os.getenv("DATABASE_USER", "aml_user")
    database_password: str = os.getenv("DATABASE_PASSWORD", "aml_pass")
    nats_url: str = os.getenv("NATS_URL", "nats://localhost:4222")
    temporal_host: str = os.getenv("TEMPORAL_HOST", "localhost")
    temporal_port: int = int(os.getenv("TEMPORAL_PORT", "7233"))


settings = Settings()
