class ConferenceCreatedEvent {
    constructor(id, room, conferenceId) {
        this.type = 'RoomAddedEvent';
        this.id = id;
        this.room = room;
        this.conferenceId = conferenceId;
        this.timestamp = new Date().toISOString()
    }
}

module.exports = ConferenceCreatedEvent