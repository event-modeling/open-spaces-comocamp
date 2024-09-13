class ConferenceClaimedEvent {
    constructor(conferenceId,name,subject,organizerToken,id,timestamp) {
        this.type = 'ConferenceClaimedEvent';
        this.conferenceId = conferenceId;
        this.name = name;
        this.subject = subject;
        this.organizerToken = organizerToken;
        this.id = id;
        this.timestamp = timestamp;
    }
}

module.exports = ConferenceClaimedEvent