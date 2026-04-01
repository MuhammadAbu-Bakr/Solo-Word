import os
import secrets
from dotenv import load_dotenv

load_dotenv()


def _require_env(key: str, default: str | None = None) -> str:
    """Return env var or a safe default, warning if missing in production."""
    value = os.environ.get(key, default)
    if value is None:
        raise RuntimeError(
            f"Required environment variable '{key}' is not set. "
            "Add it to your .env file."
        )
    return value


class Config:
    """Base configuration — shared across all environments."""


    SECRET_KEY: str = os.environ.get('SECRET_KEY') or secrets.token_hex(32)


    MAX_CONTENT_LENGTH: int = 64 * 1024   # 64 KB


    TTS_MAX_TEXT_LENGTH: int = 500         # chars
    TTS_PITCH_MIN: float = 0.5
    TTS_PITCH_MAX: float = 2.0
    TTS_RATE_MIN: float = 0.5
    TTS_RATE_MAX: float = 2.0


    AUDIO_FOLDER: str | None = None        
    AUDIO_MAX_AGE_SECONDS: int = 300       


    DEBUG: bool = False
    TESTING: bool = False


class DevelopmentConfig(Config):
    DEBUG: bool = True


class ProductionConfig(Config):
    DEBUG: bool = False

    @classmethod
    def validate(cls) -> None:
        """Call this at startup to catch missing production secrets early."""
        if not os.environ.get('SECRET_KEY'):
            raise RuntimeError(
                "SECRET_KEY must be set via environment variable in production."
            )


class TestingConfig(Config):
    TESTING: bool = True
    DEBUG: bool = True
   
    AUDIO_MAX_AGE_SECONDS: int = 0



config: dict[str, type[Config]] = {
    'development': DevelopmentConfig,
    'production':  ProductionConfig,
    'testing':     TestingConfig,
    'default':     DevelopmentConfig,
}