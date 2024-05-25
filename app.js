const express = require('express');
const { engine } = require('express-handlebars');
const app = express();
app.use(express.urlencoded({ extended: true })); 
app.use(express.static('public'));
app.engine('handlebars', engine({ defaultLayout: false }));
app.set('view engine', 'handlebars');
app.set('views', './views');
const port = 3000;
const RoomCreatedEvent = require('./events/RoomCreatedEvent');
const OpenSpaceNamedEvent = require('./events/OpenSpaceNamedEvent');
const DateRangeSetEvent = require('./events/DateRangeSetEvent');
const TopicSubmittedEvent = require('./events/TopicSubmittedEvent');
const fs = require('fs');

const EVENT_STORE_PATH = __dirname + '/eventstore/';

function appendEventToFile(event, fileName) {
  const filePath = EVENT_STORE_PATH + fileName;
  fs.appendFile(filePath, JSON.stringify(event), (err) => {
    if (err) {
      console.error('Failed to write event to the file system', err);
      return false;
    }
    return true;
  });
}

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
    const roomEvent = new RoomCreatedEvent(roomName, new Date().toISOString());

    if (appendEventToFile(roomEvent, 'RoomAddedEvent.json')) {
      // Assuming showRooms is a function that returns a list of all rooms
      const roomsList = showSchedule();
      res.status(201).send(roomsList);
    } else {
      res.status(500).send('Failed to write event to the file system');
    }
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
app.get('/set_dates', (req, res) => {
    const spaceViewData = OpenSpaceNameSV();
    res.render('set_dates', {
        eventName: spaceViewData.spaceName || 'EM Open Spaces' // Dynamically set based on the latest open space event
    });
});

app.get('/submit_topic', (req, res) => {
    const spaceViewData = OpenSpaceNameSV();
    res.render('submit_topic', {
        eventName: spaceViewData.spaceName || 'EM Open Spaces' // Dynamically set based on the latest open space event
    });
});

const getAllEventFileNames = (filterFunction) => {
  return fs.readdirSync(EVENT_STORE_PATH).filter(filterFunction);
};



const OpenSpaceNameSV = () => {
  const eventFiles = getAllEventFileNames(event => event.endsWith('OpenSpaceNamedEvent.json'));
  if (eventFiles.length === 0) {
    return { errorMessage: 'Open Space not named yet.', spaceName: '', currentDate: '' };
  }
  const eventPath = eventFiles.sort().reverse()[0]; // Assuming filenames are date prefixed and sortable as strings
  const lastEvent = JSON.parse(fs.readFileSync(EVENT_STORE_PATH + eventPath, 'utf8'));
  return { errorMessage: '', spaceName: lastEvent.spaceName, currentDate: lastEvent.timestamp };
};


const CreateEventFileNameWithPath = (eventName, eventTime) => {
  const formattedTime = eventTime.replace(/:/g, '-').replace(/\..+/, '');
  console.log(`${EVENT_STORE_PATH}${formattedTime}${eventName}Event.json`);
  return `${EVENT_STORE_PATH}${formattedTime}-${eventName}Event.json`;
}

const OpenSpaceDateRangeSV = () => {
  const eventFiles = getAllEventFileNames(event => event.endsWith('DateRangeSetEvent.json'));
  if (eventFiles.length === 0) {
    return { errorMessage: 'Date range not set yet.', startDate: '', endDate: '' };
  }
  const eventPath = eventFiles.sort().reverse()[0]; // Assuming filenames are date prefixed and sortable as strings
  const lastEvent = JSON.parse(fs.readFileSync(EVENT_STORE_PATH + eventPath, 'utf8'));
  return { errorMessage: '', startDate: lastEvent.startDate, endDate: lastEvent.endDate };
};

app.post('/name_the_open_space', (req, res) => {
  const spaceName = req.body.spaceName;
  if (!spaceName) {
    res.status(400).send('Space name is required');
  } else {
    const openSpaceEvent = new OpenSpaceNamedEvent(spaceName, new Date().toISOString());
    const eventPath = CreateEventFileNameWithPath('OpenSpaceNamed', openSpaceEvent.timestamp);
    console.log(eventPath);
    try {
      fs.appendFileSync(eventPath, JSON.stringify(openSpaceEvent));
      const spaceViewData = OpenSpaceNameSV();
      res.render('space_created_confirmation', spaceViewData);
    } catch (err) {
      console.error('Failed to write event to the file system', err);
      res.status(500).send('Failed to write event to the file system');
    }
  }
});

// Middleware to parse POST data
app.use(express.urlencoded({ extended: true }));

// Route to handle form submission
app.post('/submit_dates', (req, res) => {
    const { startDate, endDate } = req.body;

    const dateRangeSetEvent = new DateRangeSetEvent(startDate, endDate, new Date().toISOString());
    const eventPath = CreateEventFileNameWithPath('DateRangeSet', dateRangeSetEvent.timestamp);
    try {
      fs.appendFileSync(eventPath, JSON.stringify(dateRangeSetEvent));
    } catch (err) {
      console.error('Failed to write date range event to the file system', err);
      res.status(500).send('Failed to write date range event to the file system');
      return;
    }
    const openSpaceDateRange = OpenSpaceDateRangeSV();
    res.render('set_dates_confirmation', openSpaceDateRange);
});

app.post('/submit_topic', (req, res) => {
    const { name, type, topic } = req.body;
    const timestamp = new Date().toISOString();
    const topicSubmittedEvent = new TopicSubmittedEvent(name, type, topic, timestamp);

    try {
        const eventPath = CreateEventFileNameWithPath('TopicSubmitted', timestamp);
        fs.appendFileSync(eventPath, JSON.stringify(topicSubmittedEvent));
        res.send('Topic submitted successfully');
    } catch (err) {
        console.error('Failed to write topic submission event to the file system', err);
        res.status(500).send('Failed to write event to the file system');
    }
});

module.exports = app;

