from events.base import Event


class TopicSuggested(Event):
    conference: str
    conferenceId: str
    topic: str
    username: str
