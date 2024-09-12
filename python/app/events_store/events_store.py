import json
import os

from events.base import Event


class EventStore:
    event_store_path = '/app/eventstore'

    @staticmethod
    def get_all_events() -> list[dict]:
        """
        Get all events from event_store_path using filter and map.

        :return:
        """
        # get all files from event_store_path ending with .json
        files = os.listdir(EventStore.event_store_path)
        event_files = [f for f in files if f.endswith('.json')]
        events = []
        for f in event_files:
            with open(f'{EventStore.event_store_path}/{f}', 'r') as file:
                event_dict = json.loads(file.read())
                events.append(event_dict)
        return events

    @staticmethod
    def write_event_if_id_not_exists(event: type(Event)):
        """
        Check if file with filename containing event.id exists in event_store_path and if not, write event to file.
        Filename should be {event.timestamp}-{event.id}-{event.type}.json

        :param event:
        :return:
        """
        event_id = event.id
        event_timestamp = event.timestamp
        formatted_timestamp = event_timestamp.replace(':', '-').rsplit('.', 1)[0]
        event_type = event.event_type
        filename = f'{event_timestamp}-{event_id}-{event_type}.json'
        if filename in os.listdir(EventStore.event_store_path):
            return {
                'message': f'Event with id {event_id} already exists'
            }
        with open(f'{EventStore.event_store_path}/{filename}', 'w') as f:
            f.write(event.json())
        return event_id
