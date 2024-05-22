const express = require('express');
const { engine } = require('express-handlebars');
const app = express();
app.use(express.urlencoded({ extended: true })); // Add this line
app.engine('handlebars', engine({ defaultLayout: false }));
app.set('view engine', 'handlebars');
app.set('views', './views');
const port = 3000;
const RoomCreatedEvent = require('./events/RoomCreatedEvent');
const OpenSpaceNamedEvent = require('./events/OpenSpaceNamedEvent');

app.get('/', (req, res) => {
  const date = new Date();
  res.send(`Hello, the current server time is: ${date.toISOString()}`);
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

app.get('/rooms', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.post('/add-room', (req, res) => {
  const roomName = req.body.roomName;
  if (!roomName) {
    res.status(400).send('Room name is required');
  } else {
    const fs = require('fs');
    const eventPath = __dirname + '/eventstore/RoomAddedEvent.json';
    const roomEvent = new RoomCreatedEvent(roomName, new Date().toISOString());

    fs.appendFile(eventPath, JSON.stringify(roomEvent), (err) => {
      if (err) {
        res.status(500).send('Failed to write event to the file system');
      } else {
        // Assuming showRooms is a function that returns a list of all rooms
        const roomsList = showSchedule();
        res.status(201).send(roomsList);
      }
    });
  }
});

const scheduleData = {
    schedule: [
        {
            day: 'Monday',
            slot: ['Topic A1', 'Topic A2', 'Topic A3', 'Topic A4', 'Topic A5']
        },
        {
            day: 'Tuesday',
            slot: ['Topic B1', 'Topic B2', 'Topic B3', 'Topic B4', 'Topic B5']
        },
        {
            day: 'Wednesday',
            slot: ['Topic C1', 'Topic C2', 'Topic C3', 'Topic C4', 'Topic C5']
        }
    ]
};
app.get('/schedule', (req, res) => {
    res.render('schedule', { layout: false, schedule: scheduleData.schedule });
});
app.get('/create_space', (req, res) => {
  res.render('create_space', {
    currentDate: new Date().toISOString()
  });
});

app.post('/name_the_open_space', (req, res) => {
  const spaceName = req.body.spaceName;
  if (!spaceName) {
    res.status(400).send('Space name is required');
  } else {
    const fs = require('fs');
    const timestamp = new Date().toISOString();
    const formattedTimestamp = timestamp.replace(/:/g, '-').replace(/\..+/, '');
    const eventPath = __dirname + '/eventstore/OpenSpaceNamedEvent.json';
    const openSpaceEvent = new OpenSpaceNamedEvent(spaceName, timestamp);
    fs.appendFile(eventPath, JSON.stringify(openSpaceEvent), (err) => {
      if (err) {
        res.status(500).send('Failed to write event to the file system');
      } else {
        res.render('create_space', {
          spaceName: spaceName,
          currentDate: timestamp
        });
      }
    });
  }
});



module.exports = app;

