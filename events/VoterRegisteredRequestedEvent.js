class VoterRegisteredRequestedEvent {
  constructor(timestamp, id, voterId, openSpaceId) {
    this.timestamp = timestamp;
    this.id = id;
    this.type = 'VoterRegisteredRequestedEvent';
    this.voterId = voterId;
    this.openSpaceId = openSpaceId;
  }
}

module.exports = VoterRegisteredRequestedEvent;


