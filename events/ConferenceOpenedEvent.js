class ConferenceOpenedEvent {
    constructor(conferenceId, id) {
        this.type = 'ConferenceOpenedEvent';
        this.id = id;
        this.timestamp = new Date().toISOString();
        this.conferenceId = conferenceId;
    }
}

module.exports = ConferenceOpenedEvent