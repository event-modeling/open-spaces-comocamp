from commands.add_room import AddRoomCD


from events.room_added import RoomAdded
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
