document.getElementById('bookingForm').addEventListener('submit', function(event) {
    event.preventDefault(); // Prevent the form from submitting normally

    const roomNumber = document.getElementById('roomNumber').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const userId = '123'; // This would typically be fetched from the user session

    // Command to book room
    bookRoom(roomNumber, userId, startTime, endTime);
});

function bookRoom(roomId, userId, startTime, endTime) {
    // Simulate checking room availability and booking logic
    if (isRoomAvailable(roomId, startTime, endTime)) {
        // Room is available, book it
        console.log('RoomBooked Event Fired:');
        console.log(`Room Number: ${roomId}`);
        console.log(`Start Time: ${startTime}`);
        console.log(`End Time: ${endTime}`);

        // Update read models
        updateRoomAvailability(roomId, startTime, endTime);
        updateUserBookings(userId, roomId, startTime, endTime);

        alert(`Room ${roomId} booked from ${startTime} to ${endTime}`);
    } else {
        // Room is not available
        console.log('BookingFailed Event Fired:');
        console.log(`Reason: Room not available`);

        alert('Booking failed: Room not available');
    }
}

function isRoomAvailable(roomId, startTime, endTime) {
    // This function would check against the RoomAvailability read model
    return true; // Simplified for example
}

function updateRoomAvailability(roomId, startTime, endTime) {
    // Update the RoomAvailability read model
    const roomBookedEvent = new RoomBooked(roomId, userId, startTime, endTime);
    console.log(roomBookedEvent);
}

function updateUserBookings(userId, roomId, startTime, endTime) {
    // Update the UserBookings read model
}