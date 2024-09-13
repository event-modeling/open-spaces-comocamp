class RegistrationOpenedEvent {
    constructor(conferenceId, id) {
        this.type = 'RegistrationOpenedEvent';
        this.id = id;
        this.timestamp = new Date().toISOString();
        this.conferenceId = conferenceId;
    }
}

module.exports = RegistrationOpenedEvent