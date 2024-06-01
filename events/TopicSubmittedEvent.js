class TopicSubmittedEvent {
    constructor(name, sessionType, topic, timestamp, id) {
        this.name = name;
        this.sessionType = sessionType;
        this.topic = topic;
        this.timestamp = timestamp;
        this.id = id;
        this.type = 'TopicSubmittedEvent';
    }
}
module.exports = TopicSubmittedEvent;

