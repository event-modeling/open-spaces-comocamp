class TopicVoteEvent {
    constructor({ timestamp, id, userId, topicId, conferenceId }) {
        this.timestamp = timestamp;
        this.id = id;
        this.userId = userId;
        this.topicId = topicId;
        this.conferenceId = conferenceId;
        this.type = 'TopicVoteEvent';
    }
}
module.exports = TopicVoteEvent;
