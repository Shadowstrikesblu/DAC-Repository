import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.env import load_app_env

load_app_env()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(
    DATABASE_URL,
    # echo=True inondait les logs (et coûtait un peu) : pilotable par env, OFF par défaut.
    echo=os.getenv("DAC_SQL_ECHO", "false").lower() == "true",
    future=True,  # Activation du mode SQLAlchemy 2.x
    # Robustesse du pool : évite la saturation (QueuePool limit ... timed out)
    # et les connexions mortes.
    pool_size=int(os.getenv("DAC_DB_POOL_SIZE", "20")),
    max_overflow=int(os.getenv("DAC_DB_MAX_OVERFLOW", "30")),
    pool_timeout=int(os.getenv("DAC_DB_POOL_TIMEOUT", "30")),
    pool_recycle=int(os.getenv("DAC_DB_POOL_RECYCLE", "1800")),
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

# Helper pour dépendance FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
