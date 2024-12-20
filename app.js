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


app.get("/time-slots", (req, res) => {
  res.render("time-slots", { time_slots: [] });
});
