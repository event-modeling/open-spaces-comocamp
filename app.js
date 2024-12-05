let run_tests = false;
let port = 3002;
let test_collection = [];
let urls = [];
const sync_time = 8000;
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
app.set("view engine", "mustache");
app.engine("mustache", require("mustache-express")());
app.use(express.static('public'));
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
const processors = [{
    function: gen_conf_id_processor,
    events: ["unique_id_requested_event"]
}];

function notify_processors(event = null) {
    if (event === null) { processors.forEach(processor => processor.function(get_events())); return;}
    processors.forEach(processor => { if (processor.events.includes(event.type)) processor.function(get_events()); });}

if (sync_time > 0) setInterval(notify_processors, sync_time);

function rooms_state_view(history) {
    return history.reduce((acc, event) => {
        switch(event.type) {
            case "room_added_event":
                acc.push(event.room_name);
                break;
            case "room_renamed_event":
                const index = acc.indexOf(event.old_name);
                if (index !== -1) {
                    acc[index] = event.new_name;
                }
                break;
            case "room_deleted_event":
                const deleteIndex = acc.indexOf(event.room_name);
                if (deleteIndex !== -1) {
                    acc.splice(deleteIndex, 1);
                }
                break;
        }
        return acc;
    }, []);
}
test_collection.push({
    slice_name: "rooms state view",
    sample_history: [         
        { type: "room_added_event", room_name: "Auditorium", timestamp: "2024-01-23T10:00:00Z" },
        { type: "room_added_event", room_name: "CS100", timestamp: "2024-01-23T10:01:00Z" },
        { type: "room_added_event", room_name: "CS200", timestamp: "2024-01-23T10:02:00Z" },
        { type: "room_renamed_event", old_name: "Auditorium", new_name: "Main Hall", timestamp: "2024-01-23T10:03:00Z" },
        { type: "room_deleted_event", room_name: "CS200", timestamp: "2024-01-23T10:04:00Z" }
    ],
    tests: [
        { test_name: "no history should return empty array",
            event_count: 0,
            test: (history) => {
                const result = rooms_state_view(history);
                assert(result.length === 0, "No rooms should be returned");
            }
        },
        { test_name: "one room added should return one room in correct position",
            event_count: 1,
            test: (history) => {
                const result = rooms_state_view(history);
                assert(result.length === 1, "One room should be returned");
                assert(result[0] === "Auditorium", "First room should be Auditorium");
            }
        },
        { test_name: "two rooms added should return both rooms in correct order",
            event_count: 2,
            test: (history) => {
                const result = rooms_state_view(history);
                assert(result.length === 2, "Two rooms should be returned");
                assert(result[0] === "Auditorium", "First room should be Auditorium");
                assert(result[1] === "CS100", "Second room should be CS100");
            }
        },
        { test_name: "three rooms added should return all rooms in correct order",
            event_count: 3,
            test: (history) => {
                const result = rooms_state_view(history);
                assert(result.length === 3, "Three rooms should be returned");
                assert(result[0] === "Auditorium", "First room should be Auditorium");
                assert(result[1] === "CS100", "Second room should be CS100");
                assert(result[2] === "CS200", "Third room should be CS200");
            }
        },
        { test_name: "renamed room should show new name in correct position",
            event_count: 4,
            test: (history) => {
                const result = rooms_state_view(history);
                assert(result.length === 3, "Three rooms should be returned");
                assert(result[0] === "Main Hall", "First room should be Main Hall");
                assert(result[1] === "CS100", "Second room should be CS100");
                assert(result[2] === "CS200", "Third room should be CS200");
            }
        },
        { test_name: "deleted room should maintain order of remaining rooms",
            event_count: 5,
            test: (history) => {
                const result = rooms_state_view(history);
                assert(result.length === 2, "Two rooms should be returned");
                assert(result[0] === "Main Hall", "First room should be Main Hall");
                assert(result[1] === "CS100", "Second room should be CS100");
            }
        }
    ]
});
            
const rooms_url = "/rooms"; urls.push(rooms_url);
app.get(rooms_url, (req, res) => {
    //render a view of rooms. pass in a collection of rooms
    res.render("rooms", { rooms: rooms_state_view(get_events()) });
});

const time_slots_url = "/time-slots"; urls.push(time_slots_url);
app.get(time_slots_url, (req, res) => {
    res.render("time-slots", { time_slots: [] });
});

const request_conf_id_url = "/request-conf-id"; urls.push(request_conf_id_url);
app.get(request_conf_id_url, (req, res) => {
    push_event({ type: "unique_id_requested_event", timestamp: new Date().toISOString() });
    res.sendStatus(200);
});

function todo_gen_conf_id_sv(history) {
    return history.reduce((acc, current_event) => {
        switch(current_event.type) {
            case "unique_id_requested_event":
                if (acc.last_event !== null && acc.last_event.type === "unique_id_requested_event") break;
                acc.todos.push({ conf_id: "" });
                break;
            case "unique_id_generated_event":
                if (   acc.last_event === null 
                    || acc.last_event.type !== "unique_id_requested_event"
                    || acc.todos.length === 0
                    || acc.todos[acc.todos.length - 1].conf_id !== "") 
                    break;
                acc.todos[acc.todos.length - 1].conf_id = current_event.conf_id;
                break;
        }
        acc.last_event = current_event;
        return acc;
    }, { todos: [], last_event: null }).todos;
}

const todo_gen_conf_ids_url = "/todo-gen-conf-ids"; urls.push(todo_gen_conf_ids_url);
app.get(todo_gen_conf_ids_url, (req, res) => {
    res.render("todo-gen-conf-ids", { conf_ids: todo_gen_conf_id_sv(get_events()) });
});

function gen_conf_id_processor(history) {
    console.log("Looking for conf ID request in:");
    const conf_ids = todo_gen_conf_id_sv(history);
    console.log(JSON.stringify(conf_ids, null, 2));
    if (   conf_ids.length === 0
        || conf_ids[conf_ids.length - 1].conf_id !== "") {
        console.log("No conf ID request found.");
        return;
    }
    console.log("Found conf ID request.");
    conf_ids.forEach(todo => { if (todo.conf_id === "") generate_unique_id(); });
}

function generate_unique_id() {
    const conf_id = uuidv4();
    push_event({ type: "unique_id_generated_event", conf_id: conf_id, timestamp: new Date().toISOString() }, 'id:' + conf_id);
    console.log("Generated unique ID: " + conf_id);
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
function tests() {
    let summary = "";
    console.log("🧪 Tests are running...");
    test_collection.forEach(slice => {
        summary += `🍰 Testing slice: ${slice.slice_name}\n`;
        
        slice.tests.forEach(test_case => {
            try {
                test_case.test(slice.sample_history.slice(0,test_case.event_count));
                summary += ` ✅ Test passed: ${test_case.test_name}\n`;
            } catch (error) {
                summary += ` ❌ Test failed: ${test_case.test_name}\n`;
                console.log("💥 Test failed in Slice '" + slice.slice_name + "' with test '" + test_case.test_name + "'");
                console.error(error);
            }
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
    urls.forEach(url => {
        console.log("  http://localhost:" + port + url);
    });
});     