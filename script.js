document.getElementById('bookingForm').addEventListener('submit', function(event) {
    event.preventDefault(); // Prevent the form from submitting normally

    const roomNumber = document.getElementById('roomNumber').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;

    // Simulate an event creation
    console.log('Booking Event Created:');
    console.log(`Room Number: ${roomNumber}`);
    console.log(`Start Time: ${startTime}`);
    console.log(`End Time: ${endTime}`);

    // Here you would typically send this data to a server or handle it according to your application's needs
    alert(`Room ${roomNumber} booked from ${startTime} to ${endTime}`);
});