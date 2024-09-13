from events_store.events_store import EventStore


class HostedConferencesList:
    @staticmethod
    def get_data(conference_id: str):
        events_list: list = EventStore.get_all_events()
        time_slot_result = []
        for event in events_list:
            if event.get('conferenceId') == conference_id and event.get('type') == 'TimeSlotAdded':
                time_slot_result.append(event)
        room_added_result = []
        for event in events_list:
            if event.get('conferenceId') == conference_id and event.get('type') == 'RoomAdded':
                room_added_result.append(event)
                break
        conference_result = None
        for event in events_list:
            if event.get('conferenceId') == conference_id and event.get('type') == 'ConferenceClaimed':
                conference_result = event
                break

        rooms = []
        for room in room_added_result:
            rooms.append({
                'room': room.get('room'),
                'timeSlots': ', '.join(
                    [f"{event.get('startTime')} - {event.get('endTime')}"
                     for event in time_slot_result]),
            })

        # combine the results into one structure containing the conference and its time slots joined by commas and rooms
        result = {
            'conferenceId': conference_id,
            'name': conference_result.get('name'),
            'subject': conference_result.get('subject'),
            'rooms': rooms
        }

        return result
