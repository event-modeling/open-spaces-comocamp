class ConfIdGeneratedEvent {
    constructor(id, confId, timestamp) {
      this.id = id;
      this.confId = confId;
      this.timestamp = timestamp;
      this.type = 'ConfIdGeneratedEvent';
    }
  }
  
  module.exports = ConfIdGeneratedEvent;