import uuid
from datetime import datetime
from typing import Annotated

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
from commands.CommandsHandler import CommandsHandler
from events_store.events_store import EventStore
from fastapi import Form


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
def cart_state_view(username: str, conference: str):
    events_list: list = EventStore.get_all_events()
    result = None
    for event in events_list:
        if event.get('type') == 'UserAddedConferenceToCart' and event.get('username') == username and event.get('conference') == conference:
            result = event
            break
    return result


# state view for payment
@app.get('/cart')
def get_cart(request: Request, username: str, conference: str):
    """
    Endpoint to view checkout page

    :return:
    """
    events = cart_state_view(username, conference)

    if not events:
        return templates.TemplateResponse(
            request=request, name="cart_view_empty.jinja2", context={
                "data": events
            }
        )
    else:
        return templates.TemplateResponse(
            request=request, name="cart_view.jinja2", context={
                "data": events
            }
        )


# command handler for request payment
@app.post("/request_payment")
def request_payment(
        request: Request,
        name: Annotated[str, Form()],
        username: Annotated[str, Form()],
        conference: Annotated[str, Form()],
        amount: Annotated[float, Form()],
        currency: Annotated[str, Form()],
):
    """
    Command handler for request payment

    :param name:
    :param username:
    :param conference:
    :param amount:
    :param currency:

    :return:
    """
    handler = CommandsHandler()
    event_id: str = str(uuid.uuid4())
    timestamp = datetime.now().isoformat()
    command = RequestPaymentCD(**{
        'name': name,
        'username': username,
        'conference': conference,
        'amount': amount,
        'currency': currency
    })
    handler.request_payment_command(event_id, timestamp, command)
    return templates.TemplateResponse(request=request, name="payment_requested.jinja2", context={})


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
