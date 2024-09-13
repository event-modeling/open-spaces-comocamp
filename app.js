const NameOpenSpaceCD = require("./commands/NameOpenSpaceCD");
const AddTimeSlot = require("./commands/AddTimeSlot");
const RequestConfIdCD = require("./commands/RequestConfIdCD");
const ClaimConferenceCD = require("./commands/ClaimConferenceCD");

const OpenSpaceNamedEvent = require("./events/OpenSpaceNamedEvent");
const DateRangeSetEvent = require("./events/DateRangeSetEvent");
const TopicSubmittedEvent = require("./events/TopicSubmittedEvent");
const TimeSlotAdded = require("./events/TimeSlotAdded");
const RequestedConfIdEvent = require("./events/RequestedConfIdEvent");
const ConferenceClaimedEvent = require("./events/ConferenceClaimedEvent");
const ConferenceOpenedEvent = require("./events/ConferenceOpenedEvent");
if (process.argv.includes("--run-tests")) {
  run_tests();
  process.exit(0);
}
const VoterRegisteredRequestedEvent = require("./events/VoterRegisteredRequestedEvent");
const VoterRegisteredEvent = require("./events/VoterRegisteredEvent");

const EventEmitter = require('events');
const eventEmitter = new EventEmitter();


const port = 3000;
const fs = require("fs");
const express = require("express");
const app = express();
const { engine } = require("express-handlebars");
const { v4: uuidv4 } = require("uuid");
const { env } = require("process");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.engine("handlebars", engine({ defaultLayout: false }));
app.set("view engine", "handlebars");
app.set("views", "./views");


const EVENT_STORE_PATH = __dirname + "/eventstore/";
function writeEventIfIdNotExists(event) {
  if (
    fs.readdirSync(EVENT_STORE_PATH).filter((file) => file.includes(event.id))
      .length === 0
  ) {
    fs.writeFileSync(
      `${EVENT_STORE_PATH}${event.timestamp
        .replace(/:/g, "-")
        .replace(/\..+/, "")}-${event.id}-${event.type}.json`,
      JSON.stringify(event)
    );
    eventEmitter.emit('eventWritten', event); // Emitting an event for every new event written
    if (event.type === 'VoterRegisteredRequestedEvent') {
      eventEmitter.emit('VoterRegisteredRequested', event);
    }
  } else {
    console.log(`Event ${event.id} already exists`);
  }
}

function getAllEvents() {
  return fs
    .readdirSync(EVENT_STORE_PATH)
    .filter((file) => file.endsWith(".json"))
    .map((file) =>
      JSON.parse(fs.readFileSync(EVENT_STORE_PATH + file, "utf8"))
    );
}
/**
  @param {array} events
  @param {string} firstEvent
  @param {array} subsquentEvents
*/
function rehydrate(events, firstEvent, subsquentEvents = []) {

  let ev = [];
  for (const event of events) {
    const { id } = event;
    if (event.type === firstEvent) {
      ev.push(event);
    }

    if (subsquentEvents.includes(event.type)) {
      const i = ev.findIndex((event) => event.id === id);
      let tmp = ev[i];

      if (tmp) {
        ev[i] = { ...tmp, ...event };
      }
    }
  }

  return ev;
}

app.get("/", (req, res) => {
  res.redirect("/topsecret");
});

app.get("/conferences", (req, res) => {

  const conferenceEvents = getAllEvents().filter((event) => {

    if (
      event.type === "ConferenceClaimedEvent" ||
      event.type === "ConferenceOpenedEvent"
    ) {
      if (event.type === "ConferenceOpenedEvent") {
        event.opened = true;
      }

      return event;
    }
  });
  console.log(conferenceEvents)
  const ev = rehydrate(conferenceEvents, "ConferenceClaimedEvent", [
    "ConferenceOpenedEvent",
  ])[0];
  console.log(ev)
  const page = ev?.id ? `
  <div>
    <div><h1>${ev.name}</h1></div>
    <div>
      <a href="/room?conferenceId=${ev.id}"><button>Add Room</button></a>
      <a href="/timeslot?"><button>Add Time Slot</button></a>
      <button hx-vals='{"id": "${ev.id}"}' hx-post="/openConference" hx-swap="outerHTML">Open Registration</button>
    </div>
  </div>
  ` : "<h1>You don't have a conference created";

  res.send(page);
});

app.post("/openConference", (req, res) => {
  const { id } = req.body;

  console.log(req.body);
  const lastEvent = getAllEvents().filter((event) => event.id === id)[0];
  if (lastEvent?.id) {
    const event = new ConferenceOpenedEvent(id);

    fs.writeFileSync(
      `${EVENT_STORE_PATH}${String(event.timestamp)
        .replace(/:/g, "-")
        .replace(/\..+/, "")}-${event.id}-${event.type}.json`,
      JSON.stringify(event)
    );

    res.send("<span>Open</span>");
    return true;
  }

  res.send(
    `<button hx-vals='{"id": "${id}"}' hx-post="/openConference" hx-swap="outerHTML">Open Registration</button>`
  );
});
app.get("/attendee/conferences", (req, res) => {
  const search = req.query.search;
  const all_conferences = ConferencesSV(getAllEvents());
  const conferences = search ? all_conferences.filter(x => x.name.includes(search)) : all_conferences;
  return res.render('attendee_conferences', { search, conferences })
})
function ConferencesSV(events) {
  return events
    .reduce(function(sv, event) {
      switch(event.type){
        case 'ConferenceCreated': {
          const { id, name, capacity, amount } = event;
          sv.push({ id, name, capacity, amount, registration_open: false, attendees: 0 });
          break;
        }
        case 'RegistrationOpened': {
          const { id } = event;
          const item  = sv.find(x => x.id === id);
          item && (item.registration_open = true);
          break;
        }
        case 'RegisteredUser': {
          const { conference_id } = event;
          const item  = sv.find(x => x.id === conference_id);
          item && (item.attendees++);
          break;
        }
      }
      return sv;
    }, [])
}


app.get('/topsecret', (req, res) => {
  res.render('claim_conf', { conferenceId: uuidv4(), organizerToken: uuidv4() })
});
app.post('/setup_conf', (req,res) => {
  const { conferenceId, name, subject, organizerToken } = req.body ;
  const event = new ConferenceClaimedEvent(conferenceId,name,subject,organizerToken,uuidv4(),new Date().toISOString());
  try {
    writeEventIfIdNotExists(event);
    res.redirect("/conferences");
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to write event to the file system');
  }
})

eventEmitter.on('VoterRegisteredRequested', (event) => {
  console.log(`1VoterRegisteredRequestedEvent received: ${event.id}`);
  const command = new VoterRegisteredEvent(timestamp=event.timestamp, id=uuidv4(), requestId=event.id, voterId=event.voterId, openSpaceId=event.openSpaceId);
  console.log(`2VoterRegisteredEvent received: ${command.id}`);
  writeEventIfIdNotExists(command);
});

function VoterRegisteredRequestedCountSV(eventsArray, openSpaceId) {
  const voterRegisteredEvents = eventsArray.filter(event => event.type === 'VoterRegisteredRequestedEvent' && event.openSpaceId === openSpaceId);
  return voterRegisteredEvents.length > 0 ? voterRegisteredEvents.map(event => ({ voterId: event.voterId, openSpaceId: event.openSpaceId })) : [{ errorMessage: 'No voters have been registered for this open space.', voterId: '', openSpaceId: '' }];
}
function VoterRegisteredCountSV(eventsArray, openSpaceId) {
  const voterRegisteredEvents = eventsArray.filter(event => event.type === 'VoterRegisteredEvent' && event.openSpaceId === openSpaceId);
  return voterRegisteredEvents.length > 0 ? voterRegisteredEvents.map(event => ({ voterId: event.voterId, openSpaceId: event.openSpaceId })) : [{ errorMessage: 'No voters have been registered for this open space.', voterId: '', openSpaceId: '' }];
}

eventEmitter.on('eventWritten', (event) => {
  console.log(`1Event written: ${event.type} with ID: ${event.id}`);
  console.log('2event', event);
});

function setupEventListeners() {
  eventEmitter.on('VoterRegistrationRequested', (event) => {
    console.log(`VoterRegistrationRequestedEvent received: ${event.id}`);
    const command = new VoterRegisteredEvent(event.id, event.timestamp, event.voterId, event.openSpaceId);
    writeEventIfIdNotExists(command);
  });
  eventEmitter.on('eventWritten', (event) => {
    console.log(`2Event written: ${event.type} with ID: ${event.id}`);
  });
}

app.post('/submit_topic', (req, res) => {
  const { name } = req.body;
  const topicEvent = new TopicSubmittedEvent(name, new Date().toISOString(), uuidv4());
  try {
    writeEventIfIdNotExists(topicEvent);
    res.redirect('/submit_topic');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to submit topic');
  }
});

app.get('/submit_topic', (req, res) => {
  const topics = listTopicsStateView(getAllEvents());
  res.render('submit_topic', { eventName: "Your Event Name", topics });
});

function listTopicsStateView(eventsArray) {
  const topicSubmittedEvents = eventsArray.filter(event => event.type === 'TopicSubmittedEvent');
  return topicSubmittedEvents.map(event => ({ name: event.name, id: event.id }));
}



if (process.argv.includes("--run-tests")) {
  run_tests();
  process.exit(0);
}

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});


function run_tests() {
  // const tests = require('./tests');
  // tests.run_tests();
  console.log("Running tests");
  // setupEventListeners();
  writeEventIfIdNotExists(new VoterRegisteredRequestedEvent( timestamp=new Date().toISOString(), id=uuidv4(), voterId=uuidv4(), openSpaceId=5));
  console.log(VoterRegisteredRequestedCountSV(getAllEvents(), 5));
  console.log(VoterRegisteredCountSV(getAllEvents(), 5));
  process.exit(0);
}

module.exports = app;
