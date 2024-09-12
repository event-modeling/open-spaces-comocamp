from events.base import Event


class UserAddedConferenceToCart(Event):
    username: str
    name: str
    conference: str
    amount: float
    currency: str = 'USD'
