class RequestedConfIdEvent {
    constructor(id, timeStamp) {
        this.id = id;
        this.timestamp = timeStamp;
        this.type = 'RequestedConfIdEvent';
    }
}

module.exports = RequestedConfIdEvent;
