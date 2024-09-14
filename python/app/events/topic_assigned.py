from events.base import Event


class TopicAssigned(Event):
    room: str
    conference: str
    conferenceId: str
    topic: str
    startTime: str
    endTime: str
