// app that uses express to show forms and uses musche type of view engine  

const express = require("express"); const app = express(); const fs = require("fs");

(function setupExpressAndMustache() {
  app.set("view engine", "mustache");
  app.engine("mustache", require("mustache-express")());
  app.use(express.static('public'));
  app.listen(3000, () => {
    console.log("Server is running on port 3000");
  });
})();


function get_events() {
  return fs.readdirSync("./event-stream").map(file => {
    return JSON.parse(fs.readFileSync(`./event-stream/${file}`, "utf8"));
  });
}

function time_slots_state_view() {
  return get_events().reduce((acc, event) => {
    if (event.type === "time_slot_added_event") {
      acc.push(event.time_slot);
    }
    return acc;
  }, []);
}

app.get("/time-slots", (req, res) => {
  res.render("time-slots", { time_slots: time_slots_state_view() });
});
