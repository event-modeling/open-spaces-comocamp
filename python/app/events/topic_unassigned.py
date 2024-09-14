from events.base import Event


class TopicUnassigned(Event):
    room: str
    conference: str
    conferenceId: str
    topic: str
    startTime: str
    endTime: str
