from events.base import Event


class PaymentRequested(Event):
    username: str
    name: str
    amount: float
    currency: str = 'USD'
    conference: str
