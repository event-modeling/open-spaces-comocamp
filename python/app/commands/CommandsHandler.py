from commands.add_room import AddRoomCD
from commands.add_time_slot import AddTimeSlotCD

from events.room_added import RoomAdded
from events.time_slot_added import TimeSlotAdded
from events_store.events_store import EventStore


class CommandsHandler:
    def add_room_command(
            self, event_id: str, timestamp: str, command: AddRoomCD
    ):
        """
        Command handler for add_room

        :param timestamp:
        :param event_id:
        :param command:
        :return:
        """

        EventStore.write_event_if_id_not_exists(
            RoomAdded(**{
                'id': event_id,
                'type': 'RoomAdded',
                'timestamp': timestamp,
                'conferenceId': command.conferenceId,
                'room': command.room,
                'capacity': command.capacity
            })
        )

    def add_time_slot_command(
        self, event_id: str, timestamp: str, command: AddTimeSlotCD
    ):
        """
        Command handler for add_time_slot

        :param event_id:
        :param timestamp:
        :param command:
        :return:
        """
        EventStore.write_event_if_id_not_exists(
            TimeSlotAdded(**{
                'id': event_id,
                'type': 'TimeSlotAdded',
                'timestamp': timestamp,
                'conferenceId': command.conferenceId,
                'startTime': command.startTime,
                'endTime': command.endTime
            })
        )
