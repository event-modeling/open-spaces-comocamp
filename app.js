let run_tests = false;
let port = 3002;
let slice_tests = [];
const sync_time = 0;
let eventstore = "./event-stream";
const event_seq_padding = '0000';
// create the eventstore if it doesn't exist
if (process.argv.some(arg => arg.startsWith('--') && arg !== '--tests')) { // bad parameters
    console.error('Error: Unrecognized parameter(s)');
    process.exit(1);
} else if (process.argv.includes('--tests')) { // run the tests
    run_tests = true;
}// run the server
const { v4: uuidv4 } = require('uuid');

const express = require("express");
const app = express();
const fs = require("fs");
const multer = require("multer");
const upload = multer();
app.set("view engine", "mustache");
app.engine("mustache", require("mustache-express")());
app.use(express.static('public'));
app.use(express.json());

if (!fs.existsSync(eventstore)) fs.mkdirSync(eventstore);

function get_events() { 
    return  fs.readdirSync(eventstore).sort().map(file => { return JSON.parse(fs.readFileSync(`${eventstore}/${file}`, "utf8")); }); }
function push_event(event, data = "") {
    // get count of events in eventstore
    const event_count = fs.readdirSync(eventstore).filter(file => file.endsWith('_event.json')).length;
    const event_seq = event_seq_padding.slice(0, event_seq_padding.length - event_count.toString().length) + event_count;
    fs.writeFileSync(`${eventstore}/${event_seq}-${event.type}-${data}_event.json`, JSON.stringify(event));
    if (sync_time === 0 ) notify_processors(event); 
}
const processors = [];

function notify_processors(event = null) {
    if (event === null) { processors.forEach(processor => processor.function(get_events())); return;}
    processors.forEach(processor => { if (processor.events.includes(event.type)) processor.function(get_events()); });}

if (sync_time > 0) setInterval(notify_processors, sync_time);

app.get("/time-slots", (req, res) => {
    res.render("time-slots", { time_slots: time_slots_state_view(get_events()) });
});


function add_time_slot(history, command) {


    // Helper function to convert time string (HH:mm) to minutes
    function timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // Validate required fields
    if (!command.start_time || !command.end_time || !command.name) {
        throw new Error("Start time, end time, and name are required");
    }

    // Convert times to minutes for easier comparison
    const newStart = timeToMinutes(command.start_time);
    const newEnd = timeToMinutes(command.end_time);

    // Validate time order
    if (newStart >= newEnd) {
        throw new Error("End time must be after start time");
    }

    // Check for overlaps with existing time slots
    const hasOverlap = history
        .filter(event => event.type === "time_slot_added_event")
        .some(event => {
            const existingStart = timeToMinutes(event.start_time);
            const existingEnd = timeToMinutes(event.end_time);
            return (newStart < existingEnd && newEnd > existingStart);
        });

    if (hasOverlap) {
        throw new Error("Time slot is overlapping with others that are already defined");
    }

    return {
        type: "time_slot_added_event",
        start_time: command.start_time,
        end_time: command.end_time,
        name: command.name,
        timestamp: command.timestamp || new Date().toISOString()
    };
}

slice_tests.push({ slice_name: "Add Time Slot State Change",
    timelines: [
        {
            timeline_name: "Happy Path",
            checkpoints: [
                {
                    event: {
                        type: "time_slot_added_event",
                        start_time: "09:30",
                        end_time: "10:25",
                        name: "1st Session",
                        timestamp: "2024-01-23T10:00:00Z"
                    },
                    command: {
                        start_time: "09:30",
                        end_time: "10:25",
                        name: "1st Session",
                        timestamp: "2024-01-23T10:00:00Z"
                    },
                    test: function first_time_slot_should_be_added_when_valid(events, command, event) {
                        const result = add_time_slot(events, command);
                        assert(result.type === event.type, "Should be a time_slot_added_event");
                        assert(result.start_time === event.start_time, "Start time should match");
                        assert(result.end_time === event.end_time, "End time should match");
                        assert(result.name === event.name, "Name should match");
                    }
                },
                {
                    event: {
                        type: "time_slot_added_event",
                        start_time: "10:30",
                        end_time: "11:25",
                        name: "2nd Session",
                        timestamp: "2024-01-23T10:01:00Z"
                    },
                    command: {
                        start_time: "10:30",
                        end_time: "11:25",
                        name: "2nd Session",
                        timestamp: "2024-01-23T10:01:00Z"
                    },
                    test: function second_non_overlapping_slot_should_be_added(events, command, event) {
                        const result = add_time_slot(events, command);
                        assert(result.type === event.type, "Should be a time_slot_added_event");
                        assert(result.start_time === event.start_time, "Start time should match");
                        assert(result.end_time === event.end_time, "End time should match");
                        assert(result.name === event.name, "Name should match");
                    }
                },
                {
                    exception: "Time slot is overlapping with others that are already defined",
                    command: {
                        start_time: "10:00",
                        end_time: "11:00",
                        name: "1st Session",
                        timestamp: "2024-01-23T10:02:00Z"
                    },
                    test: function overlapping_slot_should_be_rejected(events, command, exception) {
                        let caught_error = run_with_expected_error(add_time_slot, events, command);
                        assert(caught_error !== null, "Should throw an error for overlapping slots");
                        assert(caught_error === exception, "Should throw overlap error message");
                    }
                }
            ]
        }
    ]
});

app.post("/time-slots", upload.none(), (req, res) => {
    const command = {
        start_time: req.body.startTime,
        end_time: req.body.endTime,
        name: req.body.name,
        timestamp: new Date().toISOString()
    };

    try {
        const event = add_time_slot(get_events(), command);
        push_event(event);
        res.redirect("/time-slots");
    } catch (error) {
        console.error("Error adding time slot:", error.message);
        res.status(400).send(error.message);
    }
});

function time_slots_state_view(history) {
    return history
        .filter(event => event.type === "time_slot_added_event")
        .map(event => ({
            start_time: event.start_time,
            end_time: event.end_time,
            name: event.name
        }));
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function assertEqual(a, b, message) { if (a !== b) throw new Error(message + ". Expected: '" + b + "' but got: '" + a + "'"); }
function assertNotEqual(a, b, message) { if (a === b) throw new Error(message + ". Did not expect: '" + b + "' but got the same thing."); }
function run_with_expected_error(command_handler, events, command) {
    let caught_error = null;
    try {
        command_handler(events, command);
    } catch (error) {
        console.log("Caught error: " + JSON.stringify(error, null, 2));
        caught_error = error.message;
    }
    return caught_error; }
function tests() {
    let summary = "";
    console.log("🧪 Tests are running...");
    slice_tests.forEach(slice => {
        summary += `🍰 Testing slice: ${slice.slice_name}\n`;
        slice.timelines.forEach(timeline => {
            summary += ` ⏱️  Testing timeline: ${timeline.timeline_name}\n`;
            timeline.checkpoints.reduce((acc, checkpoint) => {
                console.log("!!! ---- at checkingpoint: " + JSON.stringify(checkpoint, null, 2));
                console.log("checking for progress marker");
                summary += checkpoint.progress_marker ? `  🦉 ${checkpoint.progress_marker}\n` : '';
                console.log("checking for test");
                if (checkpoint.test !== undefined ) {
                    try {
                        console.log("running test with the event stream: " + JSON.stringify(acc.events, null, 2));
                        if (checkpoint.command) { // state change test
                            if (checkpoint.event && !checkpoint.exception) { // testing success
                                checkpoint.test(
                                    Given = acc.events, 
                                    When = checkpoint.command, 
                                    Then = checkpoint.event); 
                            } else if (checkpoint.exception && !checkpoint.event) { // testing exception
                                checkpoint.test(
                                    Given = acc.events, 
                                    When = checkpoint.command, 
                                    Then = checkpoint.exception); 
                            } else { // bad chckpoint structure
                                throw new Error("Bad checkpoint structure: command but no event/exception");
                            }
                        } else if (checkpoint.state) { // state view test
                            checkpoint.test(
                                Given = acc.events, 
                                Then = checkpoint.state); 
                        }
                        console.log("test passed");
                        summary += `  ✅ Test passed: ${checkpoint.test.name}\n`;
                    } catch (error) {
                        console.log("test failed");
                        summary += `  ❌ Test failed: ${checkpoint.test.name} due to: ${error.message}\n`;
                        console.log("💥 Test failed in Slice '" + slice.slice_name + "' with test '" + checkpoint.test.name + "'");
                        console.error(error);
                    }
                }
                if (checkpoint.event) acc.events.push(checkpoint.event);
                return acc;
            }, { events: []});
        });
    });
    console.log("🧪 Tests are finished");
    console.log("📊 Tests summary:");
    console.log(summary);
    process.exit(0);
}

if (run_tests) tests();
else app.listen(port, () => { 
    console.log("Server is running on port " + port + " click on http://localhost:" + port + "/");
    app._router.stack
        .filter(r => r.route) // Filter out middleware and focus on routes
        .map(r => r.route)
        .reduce((acc, route) => { if (acc.find(r => r.path === route.path)) return acc; acc.push(route); return acc; }, [])
        .forEach(route => {
            console.log(`  http://localhost:${port}${route.path}`);
        });
});     
