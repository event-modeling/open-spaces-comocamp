import uuid
from datetime import datetime

import uvicorn
from fastapi import FastAPI
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from starlette import status
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from fastapi.responses import RedirectResponse

from starlette.staticfiles import StaticFiles
from starlette.templating import Jinja2Templates

from commands.add_room import AddRoomCD
from events.base import Event
from commands.CommandsHandler import CommandsHandler
from events_store.events_store import EventStore

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
def rooms_and_time_slots_view(conference_id: str):
    events_list: list = EventStore.get_all_events()
    result = None
    for event in events_list:
        if event.get('type') == 'ConferenceClaimed' and event.get('conferenceId') == conference_id:
            result = event
            break
    return result


# state view for payment
@app.get('/rooms_and_time_slots')
def get_cart(request: Request, conference_id: str):
    """
    Endpoint to view checkout page

    :return:
    """
    events = rooms_and_time_slots_view(conference_id)

    if not events:
        return templates.TemplateResponse(
            request=request, name="conference_not_found.jinja2", context={
                "data": events
            }
        )
    else:
        return templates.TemplateResponse(
            request=request, name="rooms_and_time_slots.jinja2", context={
                "data": events
            }
        )


@app.get("/add_rooms")
async def add_rooms(request: Request):
    """
    Endpoint to add a room

    :param request:
    :return:
    """
    events = EventStore.get_all_events()
    conference_name = None
    conference_id = None
    for event in events:
        if event.get('type') == 'ConferenceClaimed':
            conference_name = event.get('name')
            conference_id = event.get('conferenceId')
            break
    return templates.TemplateResponse(
        request=request, name="add_room.jinja2", context={
            "data": {
                "conference_id": conference_id,
                "conference_name": conference_name
            },
        }
    )


# command handler for adding a room
@app.post("/add_room")
async def add_room(request: Request):
    """

    :param request:
    :return:
    """
    payload = await request.json()
    print(payload)
    handler = CommandsHandler()
    event_id: str = str(uuid.uuid4())
    timestamp = datetime.now().isoformat()

    command = AddRoomCD(
        **{
            'conferenceId': payload.get('conferenceId'),
            'room': payload.get('roomName'),
            'capacity': payload.get('capacity')
        }
    )
    handler.add_room_command(event_id, timestamp, command)
    # redirect to rooms_and_time_slots view
    return RedirectResponse(
        url=f'rooms_and_time_slots?conference_id={command.conferenceId}',
        status_code=status.HTTP_302_FOUND
    )


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
