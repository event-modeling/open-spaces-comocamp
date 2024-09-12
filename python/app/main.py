import json
import os

import uvicorn
from fastapi import FastAPI

from events.base import Event


class EventStore:
    event_store_path = 'eventstore'

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
            return {'message': f'Event with id {event_id} already exists'}
        with open(f'{EventStore.event_store_path}/{filename}', 'w') as f:
            f.write(event.json())
        return event_id


app = FastAPI()


@app.get("/events")
def get_home():
    """
    Endpoint to test event store retrieval of all events from this slice
    :return:
    """
    return EventStore.get_all_events()


@app.post("/event")
def post_event(event: Event):
    """
    Endpoint to test event store writing of events from this slice

    :param event:
    :return:
    """
    event_id = EventStore.write_event_if_id_not_exists(event)
    return {'message': f'Event written with id {event_id}'}



uvicorn.run(app, host="0.0.0.0", port=5656)