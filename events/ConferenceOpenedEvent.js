class ConferenceCreatedEvent {
    constructor(id) {
        this.type = 'ConferenceOpenedEvent';
        this.id = id;
        this.timestamp = new Date().toISOString()
    }
}

module.exports = ConferenceCreatedEvent