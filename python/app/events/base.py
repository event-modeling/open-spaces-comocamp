from pydantic import BaseModel


class Event(BaseModel):
    id: str
    type: str
    timestamp: str
