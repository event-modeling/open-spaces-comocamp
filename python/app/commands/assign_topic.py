from commands.base import Command


class AssignTopicCD(Command):
    room: str
    conference: str
    conferenceId: str
    topic: str
    startTime: str
    endTime: str
