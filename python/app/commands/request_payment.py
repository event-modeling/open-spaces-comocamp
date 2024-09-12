from commands.base import Command


class RequestPaymentCD(Command):
    username: str
    name: str
    amount: float
    currency: str = 'USD'
    conference: str
