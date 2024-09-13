from events.base import Event


class ConferenceClaimed(Event):
    conferenceId: str
    name: str
    subject: str
    organizerToken: str
