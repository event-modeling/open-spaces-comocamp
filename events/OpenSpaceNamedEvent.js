class OpenSpaceNamedEvent {
  constructor(spaceName, timestamp, id) {
    this.spaceName = spaceName;
    this.timestamp = timestamp;
    this.id = id;
    this.type = 'OpenSpaceNamedEvent';
  }
}

module.exports = OpenSpaceNamedEvent;


