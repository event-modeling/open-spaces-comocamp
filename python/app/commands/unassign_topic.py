from commands.base import Command


class UnassignTopicCD(Command):
    room: str
    conference: str
    conferenceId: str
    topic: str
    startTime: str
    endTime: str
