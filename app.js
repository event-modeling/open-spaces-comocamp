let run_tests = false;
let port = 3002;
let slice_tests = [];
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
    console.log("Processing history: " + JSON.stringify(history, null, 2));
    return history.reduce((acc, event) => {
        console.log("Processing event: " + JSON.stringify(event, null, 2));
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
slice_tests.push({
    slice_name: "rooms state view",
    timelines: [
        { timeline_name: "happy path",
            checkpoints: [
            { event: undefined,
            state: { rooms: [] },
            test: function no_rooms_should_be_returned_when_no_events_have_occurred(event_history, state) {
                    const result = rooms_state_view(event_history);
                    assert(result.length === state.rooms.length, "No rooms should be returned");
                }
            },
            { event: { type: "room_added_event", room_name: "Auditorium", timestamp: "2024-01-23T10:00:00Z" },
            state: { rooms: ["Auditorium"] },
                test: function one_room_should_be_returned_when_one_room_has_been_added(event_history, state) {
                    const result = rooms_state_view(event_history);
                    assert(result.length === state.rooms.length, "One room should be returned");
                    assert(result[0] === state.rooms[0], "First room should be Auditorium");
                }
            },
            {
                progress_marker: "at this point, the initial room reserves the name"
            },
            { event: { type: "room_added_event", room_name: "CS100", timestamp: "2024-01-23T10:01:00Z" },
            state: { rooms: ["Auditorium", "CS100"] },
                test: function two_rooms_should_be_returned_when_two_rooms_have_been_added(event_history, state) {
                    const result = rooms_state_view(event_history);
                    assert(result.length === state.rooms.length, "Two rooms should be returned");
                    assert(result[0] === state.rooms[0], "First room should be Auditorium");
                    assert(result[1] === state.rooms[1], "Second room should be CS100");
                }
            },
            { event: { type: "room_added_event", room_name: "CS200", timestamp: "2024-01-23T10:02:00Z" },
            state: { rooms: ["Auditorium", "CS100", "CS200"] },
            test: function three_rooms_should_be_returned_when_three_rooms_have_been_added(event_history, state) {
                    const result = rooms_state_view(event_history);
                    assert(result.length === state.rooms.length, "Three rooms should be returned");
                    assert(result[0] === state.rooms[0], "First room should be Auditorium");
                    assert(result[1] === state.rooms[1], "Second room should be CS100");
                    assert(result[2] === state.rooms[2], "Third room should be CS200");
                }
            },
            { event: { type: "room_renamed_event", old_name: "Auditorium", new_name: "Main Hall", timestamp: "2024-01-23T10:03:00Z" },
            state: { rooms: ["Main Hall", "CS100", "CS200"] },
            test: function renamed_room_should_show_new_name_in_correct_position(event_history, state) {
                    const result = rooms_state_view(event_history);
                    assert(result.length === state.rooms.length, "Three rooms should be returned");
                    assert(result[0] === state.rooms[0], "First room should be Main Hall");
                    assert(result[1] === state.rooms[1], "Second room should be CS100");
                    assert(result[2] === state.rooms[2], "Third room should be CS200");
                }
            },
            {
                event: { type: "room_added_event", room_name: "CS300", timestamp: "2024-01-23T10:04:00Z" },
                state: undefined,
                test: undefined
            }
            ,
            { event: { type: "room_deleted_event", room_name: "CS200", timestamp: "2024-01-23T10:04:00Z" },
            state: { rooms: ["Main Hall", "CS100"] },
            test: function deleted_room_should_maintain_order_of_remaining_rooms(event_history, state) {
                    const result = rooms_state_view(event_history);
                    assert(result.reduce((acc, room) => acc && room !== "CS200", true), "CS200 should not be in the result");
                } // function
            } // checkpoint
        ] // checkpoints
        } // timeline
    ] // timelines
    } // slice
); // push

slice_tests.push({
    slice_name: "todo_gen_conf_id_sv",
    timelines: [
        {
            timeline_name: "Happy Path",
            checkpoints: [
                {
                    event: undefined,
                    state: { todos: [] },
                    test: function empty_array_should_be_returned_when_no_events_exist(event_history, state) {
                        const result = todo_gen_conf_id_sv(event_history);
                        assert(result.length === 0, "Should return empty array");
                    }
                },
                {
                    event: { type: "unique_id_requested_event", timestamp: "2024-01-23T10:00:00Z" },
                    state: { todos: [{ conf_id: "" }] },
                    test: function empty_conf_id_should_be_added_on_request(event_history, state) {
                        const result = todo_gen_conf_id_sv(event_history);
                        assert(result.length === 1, "Should have one todo item");
                        assert(result[0].conf_id === "", "Conf ID should be empty");
                    }
                },
                {
                    event: { type: "unique_id_generated_event", conf_id: "1111-2222-3333", timestamp: "2024-01-23T10:01:00Z" },
                    state: { todos: [{ conf_id: "1111-2222-3333" }] },
                    test: function conf_id_should_be_updated_when_generated(event_history, state) {
                        const result = todo_gen_conf_id_sv(event_history);
                        assert(result.length === 1, "Should have one todo item");
                        assert(result[0].conf_id === "1111-2222-3333", "Conf ID should be updated");
                    }
                },
                {
                    progress_marker: "Second Request behaves the same way"
                },
                {
                    event: { type: "unique_id_requested_event", timestamp: "2024-01-23T10:02:00Z" },
                    state: { todos: [{ conf_id: "1111-2222-3333" }, { conf_id: "" }] },
                    test: function second_request_should_add_new_empty_conf_id(event_history, state) {
                        const result = todo_gen_conf_id_sv(event_history);
                        assert(result.length === 2, "Should have two todo items");
                        assert(result[0].conf_id === "1111-2222-3333", "First conf ID should remain");
                        assert(result[1].conf_id === "", "Second conf ID should be empty");
                    }
                },
                {
                    event: { type: "unique_id_generated_event", conf_id: "2222-3333-4444", timestamp: "2024-01-23T10:03:00Z" },
                    state: { todos: [{ conf_id: "1111-2222-3333" }, { conf_id: "2222-3333-4444" }] },
                    test: function second_conf_id_should_be_updated_when_generated(event_history, state) {
                        const result = todo_gen_conf_id_sv(event_history);
                        assert(result.length === 2, "Should have two todo items");
                        assert(result[0].conf_id === "1111-2222-3333", "First conf ID should remain");
                        assert(result[1].conf_id === "2222-3333-4444", "Second conf ID should be updated");
                    }
                }
            ]
        },
        {
            timeline_name: "A processor is idempotent",
            checkpoints: [
                {
                    event: { type: "unique_id_requested_event", timestamp: "2024-01-23T10:00:00Z" }
                },
                {
                    progress_marker: "A duplicate request of an ID will be ignored"
                },
                {
                    event: { type: "unique_id_requested_event", timestamp: "2024-01-23T10:01:00Z" },
                    state: { todos: [{ conf_id: "" }] },
                    test: function duplicate_request_should_be_ignored(event_history, state) {
                        const result = todo_gen_conf_id_sv(event_history);
                        assert(result.length === 1, "Should have only one todo item");
                        assert(result[0].conf_id === "", "Conf ID should still be empty");
                    }
                },
                {
                    event: { type: "unique_id_generated_event", conf_id: "3333-4444-5555", timestamp: "2024-01-23T10:02:00Z" }
                },
                {
                    progress_marker: "A duplicate provision of an ID will be ignored"
                },
                {
                    event: { type: "unique_id_generated_event", conf_id: "4444-5555-6666", timestamp: "2024-01-23T10:03:00Z" },
                    state: { todos: [{ conf_id: "3333-4444-5555" }] },
                    test: function duplicate_generation_should_be_ignored(event_history, state) {
                        const result = todo_gen_conf_id_sv(event_history);
                        assert(result.length === 1, "Should have only one todo item");
                        assert(result[0].conf_id === "3333-4444-5555", "Conf ID should not be changed");
                    }
                }
            ]
        },
        {
            timeline_name: "If no requests appear in the TODO list, a provided ID is ignored",
            checkpoints: [
                {
                    event: { type: "unique_id_generated_event", conf_id: "1111-2222-3333", timestamp: "2024-01-23T10:00:00Z" },
                    state: { todos: [] },
                    test: function generated_id_should_be_ignored_without_request(event_history, state) {
                        const result = todo_gen_conf_id_sv(event_history);
                        assert(result.length === 0, "Should have no todo items");
                    }
                }
            ]
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
    slice_tests.forEach(slice => {
        summary += `🍰 Testing slice: ${slice.slice_name}\n`;
        slice.timelines.forEach(timeline => {
            summary += ` ⏱️  Testing timeline: ${timeline.timeline_name}\n`;
            timeline.checkpoints.reduce((acc, checkpoint) => {
                if (checkpoint.event !== undefined) acc.event_stream.push(checkpoint.event);
                summary += checkpoint.progress_marker ? `  🦉 ${checkpoint.progress_marker}\n` : '';
                if (checkpoint.test === undefined ) return acc;
                try {
                    checkpoint.test(acc.event_stream, checkpoint.state);
                    summary += `  ✅ Test passed: ${checkpoint.test.name}\n`;
                } catch (error) {
                    summary += `  ❌ Test failed: ${checkpoint.test.name} due to: ${error.message}\n`;
                    console.log("💥 Test failed in Slice '" + slice.slice_name + "' with test '" + checkpoint.test.name + "'");
                    console.error(error);
                }
                return acc;
            }, { event_stream: []});
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