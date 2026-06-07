# app/settings.py
import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    BACKEND_BASE_URL: str = os.getenv("BACKEND_BASE_URL", "https://devops-backend-uzw2.onrender.com")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip()
    SECRET_KEY: str = os.getenv("SECRET_KEY", "").strip()
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    DATABASE_URL: str = os.getenv("DATABASE_URL", "").strip()
    FERNET_KEY: str = os.getenv("FERNET_KEY", "").strip()
    FERNET_SECRET: str = os.getenv("FERNET_SECRET", "").strip()

    def validate(self):
        missing = [attr for attr in [
            "OPENAI_API_KEY",
            "SECRET_KEY",
            "DATABASE_URL",
            "FERNET_KEY",
            "FERNET_SECRET"
        ] if not getattr(self, attr)]
        if missing:
            raise RuntimeError(f"Variables d'environnement manquantes: {', '.join(missing)}")

settings = Settings()
