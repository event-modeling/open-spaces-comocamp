class ConferenceCreatedEvent {
    constructor(id,name,subject,startDate,endDate,location,capacity,price,timestamp) {
        this.type = 'ConferenceCreatedEvent';
        this.id = id;
        this.name = name;
        this.subject = subject;
        this.startDate = startDate;
        this.endDate = endDate;
        this.location = location;
        this.capacity = capacity;
        this.price = price;
        this.timestamp = timestamp;
    }
}

module.exports = ConferenceCreatedEvent