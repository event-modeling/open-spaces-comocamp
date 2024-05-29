const port = 3000;
const fs = require('fs');
const express = require('express');
const app = express();
const { engine } = require('express-handlebars');
const { v4: uuidv4 } = require('uuid');
app.use(express.urlencoded({ extended: true })); 
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.engine('handlebars', engine({ defaultLayout: false }));
app.set('view engine', 'handlebars');
app.set('views', './views');
app.listen(port, () => { console.log(`Example app listening at http://localhost:${port}`); });

const EVENT_STORE_PATH = __dirname + '/eventstore/';
function getAllEventFileNames(filterFunction) { return fs.readdirSync(EVENT_STORE_PATH).filter(filterFunction)};
function writeEventIfIdNotExists(event) { if (fs.readdirSync(EVENT_STORE_PATH).filter(file => file.includes(event.id)).length === 0) { fs.writeFileSync(`${EVENT_STORE_PATH}${event.timestamp.replace(/:/g, '-').replace(/\..+/, '')}-${event.id}-${event.constructor.name}.json`, JSON.stringify(event)); } }
function getLastEvent(eventType) { try { return JSON.parse(fs.readFileSync(EVENT_STORE_PATH + getAllEventFileNames(file => file.includes(eventType)).sort().reverse()[0], 'utf8'));
} catch (err) { return null; } }

const OpenSpaceNamedEvent = require('./events/OpenSpaceNamedEvent');
const DateRangeSetEvent = require('./events/DateRangeSetEvent');
const TopicSubmittedEvent = require('./events/TopicSubmittedEvent');

app.get('/', (req, res) => { res.redirect('/create_space'); });

app.get('/create_space', (req, res) => { res.render('create_space', { spaceName: OpenSpaceNameSV().spaceName, id: uuidv4() }); });
app.post('/create_space', (req, res) => {
  const {spaceName, id} = req.body;
  const openSpaceEvent = new OpenSpaceNamedEvent(spaceName, new Date().toISOString(), id);
  if (!spaceName.trim()) { res.status(400).send('Space name is required'); return; }
  try { writeEventIfIdNotExists(openSpaceEvent);
    res.render('space_created_confirmation', OpenSpaceNameSV());
  } catch (err) { res.status(500).send('Failed to write event to the file system'); }
});
function OpenSpaceNameSV() {
  const lastEvent = getLastEvent('OpenSpaceNamedEvent');
  return lastEvent ? { spaceName: lastEvent.spaceName, errorMessage: ''} : { errorMessage: 'No space has been created yet.', spaceName: ''};
}

app.get('/set_dates', (req, res) => { res.render('set_dates', { eventName: OpenSpaceNameSV().spaceName, id: uuidv4() }); });
app.post('/set_dates', (req, res) => {
  const { startDate, endDate, id } = req.body;
  const dateRangeSetEvent = new DateRangeSetEvent(startDate, endDate, new Date().toISOString(), id);
  try { writeEventIfIdNotExists(dateRangeSetEvent); 
    res.render('set_dates_confirmation', OpenSpaceDateRangeSV());
  } catch (err) { res.status(500).send('Failed to write date range event to the file system'); return; }
});
function OpenSpaceDateRangeSV() {
  const lastEvent = getLastEvent('DateRangeSetEvent');
  return lastEvent ? { errorMessage: '', startDate: lastEvent.startDate, endDate: lastEvent.endDate } : { errorMessage: 'Date range not set yet.', startDate: '', endDate: '' };
}

app.get('/submit_topic', (req, res) => { res.render('submit_topic', { eventName: OpenSpaceNameSV().spaceName, id: uuidv4() }); });
app.post('/submit_topic', (req, res) => {
    const { name, type, topic, id } = req.body;
    const topicSubmittedEvent = new TopicSubmittedEvent(name, type, topic, new Date().toISOString(), id);
    try {
        writeEventIfIdNotExists(topicSubmittedEvent);
        res.render('sessions', { sessions: SessionsSV() });
    } catch (err) { res.status(500).send('Failed to write event to the file system'); }
});
function SessionsSV() {
    const eventFiles = getAllEventFileNames(event => event.endsWith('TopicSubmittedEvent.json'));
    return eventFiles.map(eventPath => JSON.parse(fs.readFileSync(EVENT_STORE_PATH + eventPath, 'utf8')));
}

module.exports = app;