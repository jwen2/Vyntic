"""
SQLAlchemy database setup.
Uses SQLite for local/PoC — swap connection string to PostgreSQL for production.
"""
import json
from sqlalchemy import create_engine, Column, String, Integer, Text, ForeignKey, event
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session

from app.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # SQLite-specific; remove for Postgres
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class DealRow(Base):
    __tablename__ = "deals"

    deal_id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    document_count = Column(Integer, default=0)
    stage = Column(String, default="Screening")
    tags_json = Column(Text, default="[]")  # JSON-encoded list; use Postgres ARRAY later

    documents = relationship("DocumentRow", back_populates="deal", cascade="all, delete-orphan")

    @property
    def tags(self) -> list[str]:
        return json.loads(self.tags_json) if self.tags_json else []

    @tags.setter
    def tags(self, value: list[str]):
        self.tags_json = json.dumps(value)


class DocumentRow(Base):
    __tablename__ = "documents"

    doc_id = Column(String, primary_key=True, index=True)
    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    page_count = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)

    deal = relationship("DealRow", back_populates="documents")


def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=engine)


def get_db() -> Session:
    """Get a database session. Caller must close it."""
    return SessionLocal()
