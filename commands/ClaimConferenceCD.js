class ClaimConferenceCD {
    constructor(conferenceId,name,subject,organizerToken) {
        this.type = 'ClaimConference';
        this.conferenceId = conferenceId;
        this.name = name;
        this.subject = subject;
        this.organizerToken = organizerToken;
    }
}

module.exports = ClaimConferenceCD