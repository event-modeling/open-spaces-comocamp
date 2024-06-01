class DateRangeSetEvent {
  constructor(startDate, endDate, timestamp, id) {
    this.startDate = startDate;
    this.endDate = endDate;
    this.timestamp = timestamp;
    this.id = id;
    this.type = 'DateRangeSetEvent';
  }
}

module.exports = DateRangeSetEvent;


