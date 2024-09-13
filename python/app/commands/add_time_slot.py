from commands.base import Command


class AddTimeSlotCD(Command):
    conferenceId: str
    startTime: str
    endTime: str
