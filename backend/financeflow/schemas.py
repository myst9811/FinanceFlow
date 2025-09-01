from pydantic import BaseModel, Field, field_validator
from datetime import date

class TransactionIn(BaseModel):
    date: date
    amount: float
    currency: str = "INR"
    description: str = ""
