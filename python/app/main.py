import json
import os

import uvicorn
from fastapi import FastAPI
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.staticfiles import StaticFiles
from starlette.templating import Jinja2Templates

from commands.request_payment import RequestPaymentCD
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


app = FastAPI(docs_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory='./static'), name="static")
templates = Jinja2Templates(directory="app/templates")


@app.get("/events")
def get_events():
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
    return {
        'message': f'Event written with id {event_id}'
    }


# state view for cart
def cart_state_view(events_list: list[type(Event)]):
    events = [
        event for event in
        events_list
        if event.get('type') == 'UserAddedConferenceToCart'
    ]
    result = events[-1] if events else None
    return result


# state view for payment
@app.get('/cart')
def get_cart(request: Request):
    """
    Endpoint to view checkout page

    :return:
    """
    events = EventStore.get_all_events()
    return templates.TemplateResponse(
        request=request, name="cart_view.jinja2", context={
            "data": events
        }
    )


# command handler for request payment
@app.post("/request_payment")
def request_payment(command: RequestPaymentCD):
    """
    Command handler for request payment

    :param command:
    :return:
    """
    if not command.amount:
        return {
            'message': 'Amount is required'
        }
    if not command.conference:
        return {
            'message': 'Conference is required'
        }
    if not command.username:
        return {
            'message': 'Username is required'
        }
    if not command.name:
        return {
            'message': 'Name is required'
        }
    EventStore.write_event_if_id_not_exists(
        Event(**{
            'type': 'PaymentRequested',
            'amount': command.amount,
            'currency': command.currency,
            'conference': command.conference,
            'username': command.username,
            'name': command.name

        })
    )
    return {
        'message': 'Payment requested'
    }


@app.get("/openapi.json", include_in_schema=False)
async def get_open_api_endpoint():
    return JSONResponse(get_openapi(
        title='python-slice',
        version='0.0.1',
        routes=app.routes
    ))


@app.get("/docs", include_in_schema=False)
async def get_documentation(request: Request):
    return get_swagger_ui_html(openapi_url="openapi.json", title="docs")


uvicorn.run(app, host="0.0.0.0", port=5656, root_path='/python')
