class TopicSubmittedEvent {
    constructor(name, timestamp, id) {
        this.name = name;
        this.timestamp = timestamp;
        this.id = id;
        this.type = 'TopicSubmittedEvent';
        this.conferenceId = conferenceId;
        this.conferenceName = conferenceName;
    }
}
module.exports = TopicSubmittedEvent;

