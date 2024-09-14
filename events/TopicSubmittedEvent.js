class TopicSubmittedEvent {
    constructor(name, timestamp, id, conferenceId, conferenceName) {
        this.name = name;
        this.timestamp = timestamp;
        this.id = id;
        this.type = 'TopicSubmittedEvent';
        this.conferenceId = conferenceId;
        this.conferenceName = conferenceName;
    }
}
module.exports = TopicSubmittedEvent;

