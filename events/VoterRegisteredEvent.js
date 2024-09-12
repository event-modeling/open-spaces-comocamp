class VoterRegisteredEvent {
  constructor(timestamp, id, requestId, voterId, openSpaceId) {
    this.timestamp = timestamp;
    this.id = id;
    this.requestId = requestId;
    this.type = 'VoterRegisteredEvent';
    this.voterId = voterId;
    this.openSpaceId = openSpaceId;
  }
}

module.exports = VoterRegisteredEvent;


