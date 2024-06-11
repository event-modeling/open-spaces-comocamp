class TimeSlotAdded {
    constructor(start, end, name, timestamp, id) {
        this.start = start;
        this.end = end;
        this.name = name;
        this.timestamp = timestamp;
        this.id = id;
        this.type = 'TimeSlotAdded';
    }
}

module.exports = TimeSlotAdded;
