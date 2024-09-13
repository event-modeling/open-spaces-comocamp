class ConferenceClaimedEvent {
    constructor(conferenceId,name,subject,organizerToken,timestamp) {
        this.type = 'ConferenceClaimedEvent';
        this.conferenceId = conferenceId;
        this.name = name;
        this.subject = subject;
        this.organizerToken = organizerToken;
        this.timestamp = timestamp;
    }
}

module.exports = ConferenceClaimedEvent