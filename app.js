const NameOpenSpaceCD = require("./commands/NameOpenSpaceCD");
const AddTimeSlot = require("./commands/AddTimeSlot");
const RequestConfIdCD = require("./commands/RequestConfIdCD");
const CreateConferenceCD = require("./commands/CreateConferenceCD");

const OpenSpaceNamedEvent = require("./events/OpenSpaceNamedEvent");
const DateRangeSetEvent = require("./events/DateRangeSetEvent");
const TopicSubmittedEvent = require("./events/TopicSubmittedEvent");
const TimeSlotAdded = require("./events/TimeSlotAdded");
const RequestedConfIdEvent = require("./events/RequestedConfIdEvent");
const ConferenceCreatedEvent = require("./events/ConferenceCreatedEvent");
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
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
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

app.get("/", (req, res) => {
  res.redirect("/create_space");
});

app.get("/create_space", (req, res) => {
  res.render("create_space", {
    spaceName: OpenSpaceNameSV(getAllEvents()).spaceName,
    id: uuidv4(),
  });
});
app.post("/create_space", (req, res) => {
  const { spaceName, id } = req.body;
  const result = handleNameOpenSpaceCD(
    getAllEvents(),
    new NameOpenSpaceCD(spaceName, id, new Date().toISOString())
  );
  if (result.Error) {
    res.status(400).send(result.Error);
    return;
  }
  try {
    writeEventIfIdNotExists(result.Events[0]);
    res.redirect("/space_created_confirmation");
  } catch (err) {
    res
      .status(500)
      .send("Failed to write event to the file system" + JSON.stringify(err));
  }
});
app.get(/space_created_confirmation/, (req, res) => {
  res.render("space_created_confirmation", OpenSpaceNameSV(getAllEvents()));
});
function handleNameOpenSpaceCD(eventsArray, command) {
  if (command.spaceName.trim() === "") {
    return { Error: "Space name is required", Events: [] };
  }
  const lastEvent = eventsArray
    .filter((event) => event.type === "OpenSpaceNamedEvent")
    .sort((a, b) => a.timestamp - b.timestamp)
    .reverse()[0];
  if (lastEvent && lastEvent.spaceName.trim() === command.spaceName.trim()) {
    return { Error: "Space name already exists", Events: [] };
  }
  return {
    Error: "",
    Events: [
      new OpenSpaceNamedEvent(command.spaceName, command.timeStamp, command.id),
    ],
  };
}
function OpenSpaceNameSV(eventsArray) {
  const lastEvent = eventsArray
    .filter((event) => event.type === "OpenSpaceNamedEvent")
    .sort((a, b) => a.timestamp - b.timestamp)
    .reverse()[0];
  return lastEvent
    ? { spaceName: lastEvent.spaceName, errorMessage: "" }
    : { errorMessage: "No space has been created yet.", spaceName: "" };
}

app.get("/set_dates", (req, res) => {
  res.render("set_dates", {
    eventName: OpenSpaceNameSV(getAllEvents()).spaceName,
    id: uuidv4(),
  });
});
app.post("/set_dates", (req, res) => {
  const { startDate, endDate, id } = req.body;
  const dateRangeSetEvent = new DateRangeSetEvent(
    startDate,
    endDate,
    new Date().toISOString(),
    id
  );
  try {
    writeEventIfIdNotExists(dateRangeSetEvent);
    res.redirect("/set_dates_confirmation");
  } catch (err) {
    res.status(500).send("Failed to write date range event to the file system");
    return;
  }
});
app.get("/set_dates_confirmation", (req, res) => {
  res.render("set_dates_confirmation", OpenSpaceDateRangeSV(getAllEvents()));
});

app.get("/conferences", (req, res) => {
  const events = getAllEvents().filter((event) => {
    if (
      event.type === "ConferenceCreatedEvent" ||
      event.type === "ConferenceOpenedEvent"
    ) {
      if (event.type === "ConferenceOpenedEvent") {
        event.opened = true;
      }
      return event;
    }
  });

  let tableRows = "";
  for (const event of events) {
    tableRows += `<tr>
    <td>${event.start_date.slice(0, 10)}</td>
    <td>${event.end_date.slice(0, 10)}</td>
    <td>${event.name}</td>
    <td>${event.location}</td>
    <td>${event.capacity}</td>
    <td>${event.amount}</td>
    <td>
      ${
        event.open
          ? "<span>Open</span>"
          : '<button hx-post="/openConference" hx-swap="outerHTML">Open Registration</button>'
      }
    </td>
    </tr>`;
  }

  const table = `
  <table>
    <tablehead>
      <tr>
        <th>Start</th>
        <th>End</th>
        <th>Name</th>
        <th>Location</th>
        <th>Capacity</th>
        <th>Amount</th>
        <th></th>
      </tr>
    </tablehead>
    <tablebody>
      ${tableRows}
    </tablebody>
  </table>
  `;

  res.send(table);
});


function OpenSpaceDateRangeSV(events) {
  const lastEvent = events
    .filter((event) => event.type === "DateRangeSetEvent")
    .sort((a, b) => a.timestamp - b.timestamp)
    .reverse()[0];
  return lastEvent
    ? {
        errorMessage: "",
        startDate: lastEvent.startDate,
        endDate: lastEvent.endDate,
      }
    : { errorMessage: "Date range not set yet.", startDate: "", endDate: "" };
}

app.get("/rooms", (req, res) => {
  res.render("rooms");
});

app.get("/time_slots", (req, res) => {
  const timeOptions = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const time = `${hour.toString().padStart(2, "0")}:${minute
        .toString()
        .padStart(2, "0")}`;
      timeOptions.push(time);
    }
  }
  const events = getAllEvents();
  const timeSlots = TimeSlotsSV(events);
  res.render("time_slots", {
    id: uuidv4(),
    timeSlots: timeSlots,
    timeOptions: timeOptions,
  });
});
app.post("/add_time_slot", (req, res) => {
  const { start, end, name, id } = req.body;
  const command = new AddTimeSlot(
    start,
    end,
    name,
    id,
    new Date().toISOString()
  );
  const result = handleAddTimeSlotCD(getAllEvents(), command);
  if (result.Error) {
    res.status(400).send(result.Error);
    return;
  }
  try {
    result.Events.forEach((event) => writeEventIfIdNotExists(event));
    res.redirect("/time_slots");
  } catch (err) {
    res
      .status(500)
      .send("Failed to write event to the file system" + JSON.stringify(err));
  }
});
function handleAddTimeSlotCD(eventsArray, command) {
  const timeSlotAddedEvents = eventsArray
    .filter((event) => event.type === "TimeSlotAdded")
    .sort((a, b) => a.timestamp - b.timestamp);
  const timeSlotExists = timeSlotAddedEvents.some(
    (event) =>
      event.start === command.start &&
      event.end === command.end &&
      event.name.trim().toLowerCase() === command.name.trim().toLowerCase()
  );
  if (timeSlotExists) {
    return { Error: "Time slot already exists", Events: [] };
  }
  const timeSlotOverlaps = timeSlotAddedEvents.some(
    (event) =>
      (command.start >= event.start && command.start < event.end) ||
      (command.end > event.start && command.end <= event.end) ||
      (command.start <= event.start && command.end >= event.end)
  );
  if (timeSlotOverlaps) {
    return { Error: "Time slot overlaps an existing slot", Events: [] };
  }
  return {
    Events: [
      new TimeSlotAdded(
        command.start,
        command.end,
        command.name,
        command.timeStamp,
        command.id
      ),
    ],
  };
}
function TimeSlotsSV(events) {
  return events
    .filter((event) => event.type === "TimeSlotAdded")
    .map((event) => ({ start: event.start, end: event.end, name: event.name }));
}

app.get("/create_conf_id", (req, res) => {
  res.render("create_conf_id");
});
app.post("/create_conf_id", (req, res) => {
  const timeStamp = new Date().toISOString();
  const confId = uuidv4();
  const requestConfIdCommand = new RequestConfIdCD(confId, timeStamp);
  const event = new RequestedConfIdEvent(confId, timeStamp);
  writeEventIfIdNotExists(event);
  res.redirect("/create_conf_id_confirmation");
});

app.get("/submit_topic", (req, res) => {
  res.render("submit_topic", {
    eventName: OpenSpaceNameSV(getAllEvents()).spaceName,
    id: uuidv4(),
  });
});
app.post("/submit_topic", (req, res) => {
  const { name, type, topic, id } = req.body;
  const topicSubmittedEvent = new TopicSubmittedEvent(
    name,
    type,
    topic,
    new Date().toISOString(),
    id
  );
  try {
    writeEventIfIdNotExists(topicSubmittedEvent);
    res.redirect("/sessions");
  } catch (err) {
    res.status(500).send("Failed to write event to the file system");
  }
});
app.get("/sessions", (req, res) => {
  res.render("sessions", { sessions: SessionsSV(getAllEvents()) });
});
function SessionsSV(events) {
  return events
    .filter((event) => event.type === "TopicSubmittedEvent")
    .sort((a, b) => a.timestamp - b.timestamp);
}
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


app.get('/setup_conf', (req, res) => { res.render('setup_conf', { id: uuidv4() })});
app.post('/setup_conf', (req,res) => {
  const { id, name, subject, startDate, endDate, location, capacity, price } = req.body ;
  const command = new CreateConferenceCD(id,name,subject,startDate,endDate,location,capacity,price);

  const event = new ConferenceCreatedEvent(id,name,subject,startDate,endDate,location,capacity,price);
  try {
    writeEventIfIdNotExists(event);
  } catch (err) {
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
