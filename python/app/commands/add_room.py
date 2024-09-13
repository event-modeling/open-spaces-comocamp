from commands.base import Command


class AddRoomCD(Command):
    conferenceId: str
    room: str
    capacity: int
