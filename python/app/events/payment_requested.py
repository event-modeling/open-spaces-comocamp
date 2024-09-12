from pydantic import BaseModel


class PaymentRequested(BaseModel):
    username: str
    name: str
    amount: float
    currency: str = 'USD'
    conference: str
