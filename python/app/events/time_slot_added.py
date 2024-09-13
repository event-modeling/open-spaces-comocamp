from events.base import Event


class TimeSlotAdded(Event):
    conferenceId: str
    startTime: str
    endTime: str
