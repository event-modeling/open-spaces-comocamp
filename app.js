// app that uses express to show forms and uses musche type of view engine  

const express = require("express");
const app = express();

app.set("view engine", "mustache");
app.engine("mustache", require("mustache-express")());

app.use(express.static('public'));

app.get("/rooms", (req, res) => {
  //render a view of rooms. pass in a collection of rooms
  res.render("rooms", { rooms: ["room1", "room2", "room3"] });
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
