from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "sqlite:///./financeflow.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Define Base here
Base = declarative_base()

def init_db():
    # Import models inside this function to avoid circular import
    from . import models  
    Base.metadata.create_all(bind=engine)
