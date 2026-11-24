from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(REPO_ROOT / ".env", ".env"), extra="ignore")

    database_url: str = "postgresql+asyncpg://prime:prime@localhost:5432/prime"
    jwt_secret: str = "prime-demo-only-secret-change-me-0123456789"
    fernet_key: str = ""                 # for TOTP secrets at rest; generated if empty in demo mode
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    demo_mode: bool = True
    demo_speed: float = 10.0
    model_dir: Path = REPO_ROOT / "ml_models"  # the team's pickles
    model_config_path: Path = REPO_ROOT / "ml" / "model_config.yaml"
    data_dir: Path = REPO_ROOT / "data"
    cors_origins: str = "http://localhost:5173"
    load_models_on_startup: bool = True
    db_nullpool: bool = False            # tests: avoid sharing pooled connections across event loops
    autostart_background: bool = True    # demo: start the calm Arm-01 replay on startup
    demo_mfa_code: str = "246810"        # accepted for seeded demo users when DEMO_MODE=true
    lockout_attempts: int = 5
    lockout_minutes: int = 5
    cookie_secure: bool = False          # set true behind HTTPS

    @property
    def sync_database_url(self) -> str:
        return self.database_url.replace("+asyncpg", "+psycopg")


@lru_cache
def get_settings() -> Settings:
    return Settings()
