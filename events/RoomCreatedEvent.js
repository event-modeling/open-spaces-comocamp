module.exports = class RoomCreatedEvent {
    constructor(roomName, timestamp) {
      this.roomName = roomName;
      this.timestamp = timestamp;
    }
  }
