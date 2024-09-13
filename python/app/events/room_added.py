from events.base import Event


class RoomAdded(Event):
    conferenceId: str
    room: str
    capacity: int
