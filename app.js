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

if (process.argv.includes("--run-tests")) {
  run_tests();
  process.exit(0);
}

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
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

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
  //const command = new CreateConferenceCD(id,name,subject,startDate,endDate,location,capacity,price);

  const event = new ConferenceCreatedEvent(id,name,subject,startDate,endDate,location,capacity,price);
  try {
    writeEventIfIdNotExists(event);
  } catch (err) {
    res.status(500).send('Failed to write event to the file system');
  }
})

module.exports = app;
