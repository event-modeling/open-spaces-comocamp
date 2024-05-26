class TopicSubmittedEvent {
    constructor(name, type, topic, timestamp, id) {
        this.name = name;
        this.type = type;
        this.topic = topic;
        this.timestamp = timestamp;
        this.id = id;
    }
}
module.exports = TopicSubmittedEvent;

