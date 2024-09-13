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
const ConferenceOpenedEvent = require("./events/ConferenceOpenedEvent");
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
app.use(express.json());

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
  const ev = rehydrate(events, "ConferenceCreatedEvent", [
    "ConferenceOpenedEvent",
  ]);

  let tableRows = "";
  for (const event of ev) {
    tableRows += `<tr>
    <td><a href="#">${event.name}</a></td>
    <td>${event.start_date.slice(0, 10)}</td>
    <td>${event.end_date.slice(0, 10)}</td>
    <td>${event.location}</td>
    <td>${event.capacity}</td>
    <td>$ ${event.amount}</td>
    <td>
      ${
        event.opened
          ? "<span>Open</span>"
          : `  <script src="https://unpkg.com/htmx.org@2.0.2"></script>
              <button hx-vals='{"id": "${event.id}"}' hx-post="/openConference" hx-swap="outerHTML">Open Registration</button>
          `
      }
    </td>
    </tr>`;
  }

  const table = `
  <table>
    <tablehead>
      <tr>
        <th>Name</th>
        <th>Start</th>
        <th>End</th>
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
