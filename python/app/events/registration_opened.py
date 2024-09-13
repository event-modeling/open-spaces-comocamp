from events.base import Event


class RegistrationOpened(Event):
    conferenceId: str
