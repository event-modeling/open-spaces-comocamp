class TopicSubmittedEvent {
    constructor(name, type, topic, timestamp) {
        this.name = name;
        this.type = type;
        this.topic = topic;
        this.timestamp = timestamp;
    }
}
module.exports = TopicSubmittedEvent;

