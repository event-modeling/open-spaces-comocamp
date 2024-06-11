class AddTimeSlot {
    constructor(start, end, name, id, timeStamp) {
        this.start = start;
        this.end = end;
        this.name = name;
        this.id = id;
        this.timeStamp = timeStamp;        
        this.type = 'AddTimeSlot';
    }
}

module.exports = AddTimeSlot;
