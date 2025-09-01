from sqlalchemy import Column, Integer, String, Float, Date
from .db import Base  # Only import Base, nothing else

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    description = Column(String, index=True)
    amount = Column(Float)
    currency = Column(String, default="INR")
    date = Column(Date)
    category = Column(String, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "description": self.description,
            "amount": self.amount,
            "currency": self.currency,
            "date": str(self.date),
            "category": self.category,
        }
