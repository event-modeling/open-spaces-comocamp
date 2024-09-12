from commands.base import Command


class RequestPayment(Command):
    username: str
    name: str
    amount: float
    currency: str = 'USD'
    conference: str
