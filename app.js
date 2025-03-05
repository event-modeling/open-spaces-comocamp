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
app.use('/error.css', express.static('public/styles/error.css'));

function get_events() { 
    if (!fs.existsSync(eventstore)) fs.mkdirSync(eventstore);
    return  fs.readdirSync(eventstore).sort().map(file => { return JSON.parse(fs.readFileSync(`${eventstore}/${file}`, "utf8")); }); }
function push_event(event) {
    let event_type = event.meta.type;
    let summary = event.meta.summary ? event.meta.summary : "";
    if (!fs.existsSync(eventstore)) fs.mkdirSync(eventstore);
    const event_count = fs.readdirSync(eventstore).filter(file => file.endsWith('_event.json')).length;
    const event_seq = event_seq_padding.slice(0, event_seq_padding.length - event_count.toString().length) + event_count;
    fs.writeFileSync(`${eventstore}/${event_seq}-${event_type}-${summary}-event.json`, JSON.stringify(event));
    if (sync_time === 0 ) notify_processors(event); }
    
if (sync_time > 0) setInterval(notify_processors, sync_time);
function notify_processors(event = null) {
    if (event === null) { processors.forEach(processor => processor.function(get_events())); return;}
    processors.forEach(processor => { if (processor.events.includes(event.meta.type)) processor.function(get_events()); });}
const processors = [];

function change_state_via_http(command_handler, command) {
        let events = null;
        try { events = get_events();
    } catch (error) { console.error("Error getting events: " + error.message);
        return next({...error, status: 500}); }
        let event = null; 
        try { event = command_handler(events, command);
    } catch (error) { console.error("Error changing state: " + error.message);
        return next({...error, status: 422});}
        try { push_event(event);
        } catch (error) { console.error("Error pushing event: " + error.message); 
            return next({...error, status: 500}); }
} // change_state_via_http

function get_state_via_http(state_view) {
    let events = null;
    try { events = get_events();
    } catch (error) { console.error("Error getting events: " + error.message);
        return next({...error, status: 500}); }
    let state = null;
    try { state = state_view(events);
    } catch (error) { console.error("Error getting state: " + error.message);
        return next({...error, status: 500}); }
    return state;
} // get_state_via_http


app.get("/set-conference-name", (req, res) => { res.render("set-conference-name", { name: "" }); }); 

app.post('/set-conference-name', upload.none(), (req, res) => {
    change_state_via_http(set_conference_name, { name: req.body.conferenceName });
    res.redirect('/set-conference-name-confirmation');
}); // set_conference_name

const exception_conference_named_with_no_change = new Error("You didn't change the name. No change registered.");
function set_conference_name(history, command) {
    const current_name = history
        .filter(event => event.meta.type === "conference_named")
        .reduce((_, event) => event.name, null);
    if (current_name === command.name) throw exception_conference_named_with_no_change;
    return { name: command.name, meta: { type: "conference_named", summary: command.name }}; 
} 

slice_tests.push({ test_function: set_conference_name,
    timelines: [
        {
            timeline_name: "Happy Path",
            checkpoints: [
                {
                    event: { 
                        meta: { type: "conference_named" }, 
                        name: "EM Open Spaces", 
                    },
                    command: { 
                        name: "EM Open Spaces", 
                    },
                    purpose: "test that the conference name is set to the new name"
                }
            ]
        },
        {
            timeline_name: "Renames allowed",
            checkpoints: [
                { 
                    event: { 
                        meta: { type: "conference_named" }, 
                        name: "EM Open Spaces", 
                    }
                },
                {
                    event: { 
                        meta: { type: "conference_named" }, 
                        name: "Event Modeling Space", 
                    },
                    command: { 
                        name: "Event Modeling Space", 
                    },
                    purpose: "name should be changeable"
                }
            ]
        },
        {
            timeline_name: "Renames allowed multiple times",
            checkpoints: [
                { 
                    event: { 
                        meta: { type: "conference_named" }, 
                        name: "EM Open Spaces", 
                    }
                },
                { 
                    event: { 
                        meta: { type: "conference_named" }, 
                        name: "Event Modeling Space", 
                    }
                },
                {
                    event: { 
                        meta: { type: "conference_named" }, 
                        name: "Event Modeling Open Spaces", 
                    },
                    command: { 
                        name: "Event Modeling Open Spaces", 
                    },
                    purpose: "name should be changeable multiple times"
                }
            ]
        },
        {
            timeline_name: "Renames not allowed if new name is the same",
            checkpoints: [
                { 
                    event: { 
                        meta: { type: "conference_named" }, 
                        name: "EM Open Spaces", 
                    }
                },
                {
                    exception: exception_conference_named_with_no_change,
                    command: { 
                        name: "EM Open Spaces", 
                    },
                    purpose: "exception should be thrown if the conference name is not changed"
                }
            ]
        }
    ]
}); // test: Set Conference Name State Change

app.get("/set-conference-name-confirmation", (req, res) => {
    res.render("set-conference-name-confirmation", { conference_name: get_state_via_http(conference_name_state_view) });
}); // app.get("/set-conference-name-confirmation")

function conference_name_state_view(history) {
    const conference_name_event = history.findLast(event => event.meta.type === "conference_name_set");
    if (conference_name_event === undefined) return "";
    return conference_name_event.name;
} // conference_name_state_view

app.get("/set-dates", (req, res) => {
    res.render("set-dates", { dates: [] });
}); // app.get("/set-dates")

app.post("/set-dates", upload.none(), (req, res) => {
    change_state_via_http(set_dates, { startDate: req.body.startDate, endDate: req.body.endDate });
    res.redirect('/set-dates-confirmation');
}); // app.post("/set-dates")

const exception_dates_have_invalid_range = new Error("Start date must be before end date");
function set_dates(history, command) {
    const start_date = new Date(command.startDate);
    const end_date = new Date(command.endDate);
    if (start_date > end_date) throw exception_dates_have_invalid_range;
    return { start_date: command.startDate, end_date: command.endDate, meta: { type: "set_dates", summary: command.startDate + " to " + command.endDate } };
} // set_dates

app.get("/set-dates-confirmation",(_, r)=>{ r.render("set-dates-confirmation", get_state_via_http(conference_dates_state_view)); }); 

function conference_dates_state_view(history) {
    const conference_dates_event = history.findLast(event => event.meta.type === "set_dates");
    if (conference_dates_event === undefined) return { start_date: "", end_date: "" };
    return { start_date: conference_dates_event.start_date, end_date: conference_dates_event.end_date };
} // conference_dates_state_view

app.get("/rooms", (req, res) => { res.render("rooms", { rooms: get_state_via_http(rooms_state_view) }); });

function rooms_state_view(history) {
    return history.reduce((acc, event) => {
        switch(event.meta.type) {
            case "room_added": acc.push(event.room_name); break;
            case "room_renamed":
                const index = acc.indexOf(event.old_name);
                if (index !== -1) acc[index] = event.new_name;
                break;
            case "room_deleted":
                const deleteIndex = acc.indexOf(event.room_name);
                if (deleteIndex !== -1) acc.splice(deleteIndex, 1);
                break;
        }
        return acc;
    }, []);
} // rooms_state_view
slice_tests.push({ test_function: rooms_state_view,
    timelines: [
        { timeline_name: "happy path",
            checkpoints: [
            { event: { room_name: "Auditorium", meta: { type: "room_added" } },
                state: [],
                purpose: "no rooms should be returned when no events have occurred"
            },
            { event: { room_name: "CS100", meta: { type: "room_added" }},
                state: ["Auditorium"], 
                purpose: "one room should be returned when one room has been added"
            },
            { progress_marker: "at this point, the initial room reserves the name" },
            { event: { room_name: "CS200", meta: { type: "room_added" } },
                state: ["Auditorium", "CS100"],
                purpose: "two rooms should be returned when two rooms have been added"
            },
            { event: { old_name: "Auditorium", new_name: "Main Hall", meta: { type: "room_renamed" } },
                state: ["Auditorium", "CS100", "CS200"],
                purpose: "three rooms should be returned when three rooms have been added"
            },
            { event: { room_name: "CS300", meta: { type: "room_added" } },
                state: ["Main Hall", "CS100", "CS200"],
                purpose: "renamed room should show new name in correct position"
            },
            { event: { room_name: "CS200", meta: { type: "room_deleted" } } },
            { 
                state: ["Main Hall", "CS100", "CS300"],
                purpose: "deleted room should not be in the result"
            } // checkpoint
        ] // checkpoints
        } // timeline
    ] // timelines
    } // slice
); // test: rooms state view

app.post("/rooms", upload.none(), (req, res) => {
    change_state_via_http(add_room, { room_name: req.body.roomName });
    res.redirect("/rooms");
}); // app.post("/rooms")

const exception_room_already_exists = new Error("Room already exists");
function add_room(events, command) {
    if (events.some(event => event.meta.type === "room_added" && event.room_name === command.room_name)) 
        throw exception_room_already_exists;
    return { room_name: command.room_name, meta: { type: "room_added", summary: command.room_name } };
} // add_room

app.post("/time-slots", upload.none(), (req, res) => {
    change_state_via_http(add_time_slot, { start_time: req.body.startTime, end_time: req.body.endTime, name: req.body.name });
    res.redirect("/time-slots");
}); // app.post("/time-slots")

const exception_time_slot_required_fields_missing = new Error("Start time, end time, and name are required");
const exception_time_slot_time_order_invalid = new Error("End time must be after start time");
const exception_time_slot_overlapping = new Error("Time slot is overlapping with others that are already defined");
function add_time_slot(history, command) {
    function timeToMinutes(timeStr) { const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;}
    if (!command.start_time || !command.end_time || !command.name) throw exception_time_slot_required_fields_missing;

    const newStart = timeToMinutes(command.start_time);
    const newEnd = timeToMinutes(command.end_time);
    if (newStart >= newEnd) throw exception_time_slot_time_order_invalid;
    
    const hasOverlap = history
        .filter(event => event.meta.type === "time_slot_added")
        .some(event => {
            const existingStart = timeToMinutes(event.start_time);
            const existingEnd = timeToMinutes(event.end_time);
            return (newStart < existingEnd && newEnd > existingStart);
        });
    if (hasOverlap) throw exception_time_slot_overlapping;

    return { start_time: command.start_time, end_time: command.end_time, name: command.name,
        meta: { type: "time_slot_added", summary: command.start_time + " to " + command.end_time + " - " + command.name }
    };
} // add_time_slot

slice_tests.push({ test_function: add_time_slot,
    timelines: [
        {
            timeline_name: "Happy Path",
            checkpoints: [
                {
                    event: { start_time: "09:30", end_time: "10:25", name: "1st Session",
                        meta: { type: "time_slot_added" }
                    },
                    command: { start_time: "09:30", end_time: "10:25", name: "1st Session" },
                    purpose: "first time slot should be added when valid"
                },
                {
                    event: { start_time: "10:30", end_time: "11:25", name: "2nd Session",
                        meta: { type: "time_slot_added" }
                    },
                    command: { start_time: "10:30", end_time: "11:25", name: "2nd Session" },
                    purpose: "second time slot should be added when valid"
                },
                {
                    exception: exception_time_slot_overlapping,
                    command: { start_time: "11:00", end_time: "12:00", name: "1st Session" },
                    purpose: "overlapping at the end of the time slot should be rejected"
                },
                {
                    exception: exception_time_slot_overlapping,
                    command: { start_time: "10:00", end_time: "11:00", name: "1st Session" },
                    purpose: "overlapping at the start of the time slot should be rejected"
                },
                {
                    exception: exception_time_slot_overlapping,
                    command: { start_time: "10:45", end_time: "11:10", name: "1st Session" },
                    purpose: "overlapping time slot entirely within an existing time slot should be rejected"
                }
            ]
        }
    ]
}); // test: Add Time Slot State Change

app.get("/time-slots",(_,r)=>{ r.render("time-slots", { time_slots: get_state_via_http(time_slots_state_view) });});

function time_slots_state_view(history) {
    return history.reduce((acc, event) => {
        if (event.meta.type === "time_slot_added") acc.push({ ...event, meta: undefined });
        return acc;
    }, []); } // time_slots_state_view

app.get("/generate-conf-id", (_, r) => { r.render("generate-conf-id"); });

app.post("/generate-conf-id", (_, r) => { change_state_via_http(request_unique_id); r.redirect('/join-conference'); }); 

const exception_unique_id_already_requested = new Error("A request already exists");
function request_unique_id(history, command) {
    if (history.length > 0 && history[history.length - 1].meta.type === "unique_id_requested") throw exception_unique_id_already_requested;
    return { meta: { type: "unique_id_requested" } };
} // request_unique_id

slice_tests.push({ test_function: request_unique_id,
    timelines: [
        {
            timeline_name: "Happy Path",
            checkpoints: [        
                {
                    event: { meta: { type: "unique_id_requested" } },
                    command: {},
                    purpose: "request unique ID should be added when requested",
                },
                {
                    exception: exception_unique_id_already_requested,
                    command: {},
                    purpose: "request unique ID should throw an error when request already exists",
                },
                {
                    event: { conf_id: "1111-2222-3333", meta: { type: "conference_id_generated" } }
                },
                {
                    event: { meta: { type: "unique_id_requested" } },
                    command: {},
                    purpose: "request unique ID event should be added when requested after a conference ID has been generated"
                }
            ]
        }
    ]
}); // test: request_unique_id_sc

app.get("/todo-gen-conf-ids",(_, r)=>{ r.render("todo-gen-conf-ids", { conf_ids: get_state_via_http(todo_gen_conf_id_sv) }); }); 

function todo_gen_conf_id_sv(history) {
    return history.reduce((acc, current_event) => {
        switch(current_event.meta.type) {
            case "unique_id_requested":
                if (acc.last_event !== null && acc.last_event.meta.type === "unique_id_requested") break;
                acc.todos.push({ conf_id: "" });
                break;
            case "conference_id_generated":
                if (   acc.last_event === null 
                    || acc.last_event.meta.type !== "unique_id_requested"
                    || acc.todos.length === 0
                    || acc.todos[acc.todos.length - 1].conf_id !== "") 
                    break;
                acc.todos[acc.todos.length - 1].conf_id = current_event.conf_id;
                break;
        }
        acc.last_event = current_event;
        return acc;
    }, { todos: [], last_event: null }).todos;
} // todo_gen_conf_id_sv


slice_tests.push({ test_function: todo_gen_conf_id_sv,
    timelines: [
        {
            timeline_name: "Happy Path",
            checkpoints: [
                {
                    event: { meta: { type: "unique_id_requested" } },
                    state: [],
                    purpose: "empty array should be returned when no events exist"
                },
                {
                    event: { meta: { type: "conference_id_generated" }, conf_id: "1111-2222-3333" },
                    state: [{ conf_id: "" }],
                    purpose: "empty conf ID should be added on request"
                },
                {
                    event: { meta: { type: "some_other_event" } },
                    state: [{ conf_id: "1111-2222-3333" }],
                    purpose: "conf ID should be updated when generated"
                },
                {
                    progress_marker: "Second Request behaves the same way"
                },
                {
                    event: { meta: { type: "unique_id_requested" } }
                },
                {
                    event: { conf_id: "2222-3333-4444", meta: { type: "conference_id_generated" }},
                    state: [{ conf_id: "1111-2222-3333" }, { conf_id: "" }],
                    purpose: "second request should add new empty conf ID"
                },
                {
                    state:  [{ conf_id: "1111-2222-3333" }, { conf_id: "2222-3333-4444" }],
                    purpose: "second conf ID should be updated when generated"
                }
            ]
        },
        {
            timeline_name: "A processor is idempotent",
            checkpoints: [
                {
                    event: { meta: { type: "unique_id_requested" } }
                },
                {
                    progress_marker: "A duplicate request of an ID will be ignored"
                },
                {
                    event: { meta: { type: "unique_id_requested" } },
                    state: [{ conf_id: "" }],
                    purpose: "duplicate request should be ignored"
               },
                {
                    event: { conf_id: "3333-4444-5555", meta: { type: "conference_id_generated" } }
                },
                {
                    progress_marker: "A duplicate provision of an ID will be ignored"
                },
                {
                    event: { conf_id: "4444-5555-6666", meta: { type: "conference_id_generated" } },
                    state:  [{ conf_id: "3333-4444-5555" }] ,
                    purpose: "duplicate generation should be ignored"
                }
            ]
        },
        {
            timeline_name: "If no requests appear in the TODO list, a provided ID is ignored",
            checkpoints: [
                {
                    event: { meta: { type: "conference_id_generated" }, conf_id: "1111-2222-3333" },
                    state: [] ,
                    purpose: "generated ID should be ignored without request"
                }
            ]
        }
    ]
}); // test: todo_gen_conf_id_sv

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
    if (conf_ids[conf_ids.length - 1].conf_id === "") generate_unique_id();
} // gen_conf_id_processor

function generate_unique_id() {
    const conf_id = uuidv4();
    const conf_id_generated_event = provide_unique_id(get_events(), { conf_id: conf_id });
    push_event(conf_id_generated_event, 'id:' + conf_id);
    console.log("Generated unique ID: " + conf_id);
} // generate_unique_id

const error_no_request_found = new Error("No conf ID request found.");
function provide_unique_id(unfiltered_events, command) {
    console.log("Providing unique ID to system: " + command.conf_id);
    const events = unfiltered_events.filter(event => event.meta.type === "unique_id_requested" || event.meta.type === "conference_id_generated");
    if (events.length === 0 || events[events.length - 1].meta.type !== "unique_id_requested") {
        console.log("No conf ID request found.");
        throw error_no_request_found;
    }
    return { conf_id: command.conf_id, meta: { type: "conference_id_generated" } };
} // provide_unique_id

slice_tests.push({ test_function: provide_unique_id,
    timelines: [
        {
            timeline_name: "All scenarios in one timeline",
            checkpoints: [
                {
                    progress_marker: "Test trying to generate an ID with no events at all in history"
                },
                {
                    exception: error_no_request_found,
                    command: { conf_id: "1111-2222-3333" },
                    purpose: "provide unique ID should throw an error when no request exists"
                },
                { 
                    event: { meta: { type: "unique_id_requested" } } 
                },
                {
                    event: { meta: { type: "some_other_event" } }
                },
                {
                    progress_marker: "Test the happy path"
                },
                { 
                    event: { meta: { type: "conference_id_generated" }, conf_id: "1111-2222-3333" },
                    command: { conf_id: "1111-2222-3333" },
                    purpose: "provide unique ID should be added when requested"
                },
                {
                    event: { meta: { type: "unique_id_requested" } }
                },
                {
                    event: { meta: { type: "conference_id_generated" }, conf_id: "2222-3333-4444" }
                },
                {
                    exception: error_no_request_found,
                    command: { conf_id: "3333-4444-5555" },
                    purpose: "provide unique ID should throw an error when no request exists"
                }
            ]
        }
    ]
}); // test: generate_unique_id_sc

app.get("/join-conference", (_, r) => { r.render("join-conference", { conf_id:  get_state_via_http(join_conference_sv(get_events())).conf_id || "1234" }); }); // app.get("/join-conference")

function join_conference_sv(history) {
    return history.reduce((acc, event) => {
        switch(event.meta.type) { case "conference_id_generated": acc.conf_id = event.conf_id; break; }
        return acc;
    }, { conf_id: null });
} // join_conference_sv

app.get("/register/:id", (req, res) => { res.render("register", { conference_name: get_state_via_http(conference_name_state_view(get_events())), conference_id: req.params.id }); }); 

app.post("/register/:id", multer().none(), (req, res) => {
    const id = req.params.id;
    const name = req.body.participantName;
    const registration_id = uuidv4();
    set_state_via_http(register_state_change,{ conference_id: id, registration_id: registration_id, name: name });
    res.redirect(`/register-success/${registration_id}`);    
}); // app.post("/register/:id")
        
app.post("/close-registration", (_, r) => { set_state_via_http(close_registration_state_change, {}); r.redirect("/sessions"); });

app.get("/register-success/:id", (req, res) => {
    const registration_id = req.params.id;
    const registration_sv = get_state_via_http(registration_state_view(get_events()));
    if (!registration_sv.registrations[registration_id]) { return next({error: new Error("Registration not found"), status: 422}); }
    res.render("register-success",  {
        participant_name: registration_sv.registrations[registration_id],
        conference_name: registration_sv.conference_name,
        registration_id: registration_id
    });
}); // app.get("/register-success/:id")

function registration_state_view(history) {
    return history.reduce((acc, event) => {
        switch(event.meta.type) {
            case "conference_id_generated":
                acc.conference_id = event.conf_id;
                acc.registrations = new Map();
                break;
            case "conference_name_set":
                acc.conference_name = event.name;
                break;
            case "registered_event":
                acc.registrations[event.registration_id] = event.name;
                break;
            default:
                break;
        }
        return acc;
    }, { conference_id: null, conference_name: "-- not named yet --", registrations: new Map() });
} // registration_state_view


const error_registration_closed = new Error("Registration is closed.");
const error_already_registered = new Error("You are already registered.");
function register_state_change(history, command) {
    const registration_state = history.reduce((acc, event) => {
        switch(event.meta.type) {
            case "registration_closed":
                acc.conference_id = null;
                acc.names = new Set();
                break;
            case "registered":
                if (acc.conference_id === null) break; // this should not happen
                acc.names.add(event.name);
                break;
            case "conference_id_generated":
                acc.conference_id = event.conf_id;
                acc.names = new Set();
                break;
            default:
                break;
        }
        return acc;
    }, { conference_id: null, names: new Set() });

    if (   registration_state.conference_id === null 
        || registration_state.conference_id !== command.conference_id) throw error_registration_closed;
    if (registration_state.names?.has(command.name)) throw error_already_registered;

    return { 
        conference_id: command.conference_id, 
        registration_id: command.registration_id, 
        name: command.name, 
        meta: { type: "registered", summary: command.name + "," + command.registration_id }
    };
} // register_state_change

slice_tests.push({ slice_name: "Registration State Change",
    timelines: [
        {
            timeline_name: "First Timeline",
            checkpoints: [
                {
                    exception: error_registration_closed,
                    command: { 
                        type: "register_command",
                        name: "Adam",
                        registration_id: "eeee-ffff-00000",
                        conference_id: "1111-2222-3333",
                        timestamp: "2024-01-23T10:00:00Z"
                    },
                    test: function should_reject_registration_when_conference_does_not_exist(events, command, exception) {
                        let caught_error = run_with_expected_error(register_state_change, events, command);
                        assert(caught_error !== null, "Should throw when conference doesn't exist");
                        assert(caught_error === exception, "Should throw correct error message");
                    }
                },
                {
                    event: { 
                        type: "conference_id_generated_event",
                        conf_id: "1111-2222-3333",
                        timestamp: "2024-01-23T10:01:00Z"
                    }
                },
                {
                    event: { 
                        type: "registered_event",
                        name: "Adam",
                        registration_id: "eeee-ffff-00000",
                        conference_id: "1111-2222-3333",
                        timestamp: "2024-01-23T10:02:00Z"
                    },
                    command: {
                        type: "register_command",
                        name: "Adam",
                        registration_id: "eeee-ffff-00000",
                        conference_id: "1111-2222-3333",
                        timestamp: "2024-01-23T10:02:00Z"
                    },
                    test: function should_allow_first_registration(events, command, event) {
                        const result = register_state_change(events, command);
                        assert(result.type === event.meta.type, "Should be a registered_event");
                        assert(result.registration_id === event.registration_id, "Should have correct registration ID");
                    }
                },
                {
                    exception: error_already_registered,
                    command: {
                        type: "register_command",
                        name: "Adam",
                        registration_id: "cccc-dddd-1111",
                        conference_id: "1111-2222-3333",
                        timestamp: "2024-01-23T10:03:00Z"
                    },
                    test: function should_reject_duplicate_registration(events, command, exception) {
                        let caught_error = run_with_expected_error(register_state_change, events, command);
                        assertNotEqual(caught_error, null, "Should throw when already registered");
                        assertEqual(caught_error, exception, "Should throw correct error message");
                    }
                },
                {
                    event: {
                        type: "registration_closed_event",
                        conference_id: "1111-2222-3333",
                        timestamp: "2024-01-23T10:04:00Z"
                    }
                },
                {
                    progress_marker: "A second conference is started"
                },
                {
                    event: {
                        type: "conference_id_generated_event",
                        conf_id: "2222-3333-4444",
                        timestamp: "2024-01-23T10:05:00Z"
                    }
                },
                {
                    exception: error_registration_closed,
                    command: {
                        type: "register_command",
                        name: "Adam",
                        registration_id: "eeee-ffff-00000",
                        conference_id: "1111-2222-3333",
                        timestamp: "2024-01-23T10:06:00Z"
                    },
                    test: function should_reject_registration_for_old_conference(events, command, exception) {
                        let caught_error = run_with_expected_error(register_state_change, events, command);
                        assert(caught_error !== null, "Should throw when using old conference ID");
                        assert(caught_error === exception, "Should throw correct error message");
                    }
                },
                {
                    event: {
                        type: "registered_event",
                        name: "Adam",
                        registration_id: "aaaa-bbbb-00000",
                        conference_id: "2222-3333-4444",
                        timestamp: "2024-01-23T10:07:00Z"
                    },
                    command: {
                        type: "register_command",
                        name: "Adam",
                        registration_id: "aaaa-bbbb-00000",
                        conference_id: "2222-3333-4444",
                        timestamp: "2024-01-23T10:07:00Z"
                    },
                    test: function should_allow_registration_for_new_conference(events, command, event) {
                        const result = register_state_change(events, command);
                        assert(result.type === event.meta.type, "Should be a registered_event");
                        assert(result.registration_id === event.registration_id, "Should have correct registration ID");
                    }
                }
            ]
        },
        {
            timeline_name: "Registration is closed",
            checkpoints: [
                {
                    event: {
                        type: "conference_id_generated_event",
                        conf_id: "1111-2222-3333",
                        timestamp: "2024-01-23T11:00:00Z"
                    }
                },
                {
                    event: {
                        type: "registration_closed_event",
                        conference_id: "1111-2222-3333",
                        timestamp: "2024-01-23T11:01:00Z"
                    }
                },
                {
                    exception: error_registration_closed,
                    command: {
                        type: "register_command",
                        name: "Adam",
                        registration_id: "eeee-ffff-00000",
                        conference_id: "1111-2222-3333",
                        timestamp: "2024-01-23T11:02:00Z"
                    },
                    test: function should_reject_registration_when_closed(events, command, exception) {
                        let caught_error = run_with_expected_error(register_state_change, events, command);
                        assert(caught_error !== null, "Should throw when registration is closed");
                        assert(caught_error === exception, "Should throw correct error message");
                    }
                }
            ]
        }
    ]
}); // test: registration_state_change

function close_registration_state_change(history, command) {
    const state = history.reduce((acc, event) => {
        switch(event.meta.type) {
            case "conference_id_generated_event": acc.closed = false; break;
            case "registration_closed_event": acc.closed = true; break; }
        return acc;
    }, { closed: true });
    if (state.closed) throw new Error("Registration is already closed");
    return { type: "registration_closed_event" };
} // close_registration_state_change

app.get("/topic-suggestion", (req, res, next) => {
    const registration_id = req.query.registration_id;
    let state = undefined;
    try {
        state = registration_name_for_suggestion_sv(get_events());
    } catch (error) {
        console.error("Error getting registration name: " + error.message);
        error.status = 500;
        return next(error);
    }
    const name = state.registration_to_name[registration_id];
    if (name === undefined) {
        const error = new Error("Registration ID not found");
        error.status = 404;
        return next(error);
    }
    res.render("submit-session", { name, registration_id });
}); // app.get("/topic-suggestion", (req, res) => {

function registration_name_for_suggestion_sv(history) {
    return history.reduce((acc, event) => {
        switch(event.meta.type) {
            case "unique_id_generated_event":
                acc.registration_to_name = {};
                break;
            case "registered_event":
                acc.registration_to_name[event.registration_id] = event.name;
                break;
        }
        return acc;
    }, { registration_to_name: {} });
} // function registration_name_for_suggestion_sv(history)

app.post("/topic-suggestion", multer().none(), (req, res, next) => {
    const registration_id = req.query.registration_id;
    const topic = req.body.topic;
    const facilitation = req.body.facilitation;
    console.log("Submitting session with topic: " + topic);
    let events = undefined;
    try {
        events = get_events();
    } catch (error) {
        console.error("Error getting events: " + error.message);
        error.status = 500;
        return next(error);
    }
    let session_submitted_event = undefined;
    try {
        session_submitted_event = submit_session(events, { topic, facilitation, registration_id, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error("Error submitting session: " + error.message);
        error.status = 404;
        return next(error);
    }
    console.log("Pushing event: " + JSON.stringify(session_submitted_event, null, 2));
    try {
        push_event(session_submitted_event, 'topic:' + topic + '_facilitation:' + facilitation);
    } catch (error) {
        console.error("Error pushing event: " + error.message);
        error.status = 500;
        return next(error);
    }

    res.redirect("/sessions?registration_id=" + registration_id);
}); // app.post("/topic-suggestion", (req, res) => {

function submit_session(events, command) {
    const existingTopics = events.reduce((acc, event) => {
        switch(event.meta.type) {
            case "unique_id_generated_event":
                // Reset topics for new conference
                acc.topics = new Set();
                break;
            case "session_submitted_event":
                acc.topics.add(event.topic.toLowerCase());
                break;
        }
        return acc;
    }, { topics: new Set() }).topics;

    if (existingTopics.has(command.topic.toLowerCase())) {
        throw new Error("A session with this topic has already been suggested");
    }
    return { type: "session_submitted_event", topic: command.topic, facilitation: command.facilitation, registration_id: command.registration_id, timestamp: new Date().toISOString(), meta: { command: command }};
} // function submit_session(events, command)

app.get("/sessions", (req, res) => {
    res.render("topics", { topics: topics_sv(get_events()), registration_id: req.query.registration_id });
}); // sessions

function topics_sv(history) {
    const topics = history.reduce((acc, event) => {
        console.log("Processing event: " + JSON.stringify(event, null, 2));
        console.log("Current state: " + JSON.stringify(acc, null, 2));
        switch(event.meta.type) { 
            case "unique_id_generated_event":
                acc.registrations = {};
                acc.topics = [];
                break;
            case "registered_event":
                acc.registrations[event.registration_id] = event.name;
                break;
            case "session_submitted_event":
                try {
                    acc.topics.push({ topic: event.topic, facilitation: event.facilitation, name: acc.registrations[event.registration_id] });
                } catch (error) {
                    console.log("Error adding topic: " + error.message);
                }
                break;
        }
        return acc;
    }, { registrations: {}, topics: [] }).topics;
    return topics;
} // topics_sv

// Custom error handler for 404s
app.use((req, res, next) => {
    console.log("404 error handler: " + req.path);
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// Global error handler
app.use((err, req, res, next) => {
    console.log("Error " + err.status + ", message: " + err.message);
    console.error(err.stack);
    const statusCode = err.status || 500;
    
    // Check if the request accepts HTML
    if (req.accepts('html')) {
        res.status(statusCode);
        res.render('error', {
            message: err.message || 'Something went wrong!',
            error: statusCode >= 500 ? {
                status: statusCode,
                stack: err.stack
            } : undefined,
            errorStylesheet: '<link rel="stylesheet" href="/error.css">'
        });
    } else {
        // API error response
        res.status(statusCode).json({
            error: {
                message: err.message || 'Something went wrong!',
                status: statusCode
            }
        });
    }
}); // Global error handler

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
        const slice_name = slice.slice_name !== undefined ? slice.slice_name : slice.test_function.name.replaceAll("_", " ");
        summary += `🍰 Testing slice: ${slice_name}\n`;
        slice.timelines.forEach(timeline => {
            summary += ` ⏱️  Testing timeline: ${timeline.timeline_name}\n`;
            timeline.checkpoints.reduce((acc, checkpoint) => {
                summary += checkpoint.progress_marker ? `  🦉 ${checkpoint.progress_marker}\n` : '';
                if (checkpoint.purpose !== undefined || checkpoint.test !== undefined) {
                    try {
                        if (checkpoint.command) { // state change test
                            if (checkpoint.event && !checkpoint.exception) { // testing success of a command
                                if (checkpoint.test !== undefined) {
                                checkpoint.test(
                                    Given = acc.events, 
                                    When = checkpoint.command, 
                                    Then = checkpoint.event); }
                                    else {
                                        const result = slice.test_function(acc.events, checkpoint.command);
                                        assert(result.meta.type !== undefined, "Should have a type");
                                        assert(result.meta.type === checkpoint.event.meta.type, "Should be a " + checkpoint.event.meta.type + " event, but was: " + result.meta.type);
                                        Object.keys(checkpoint.event).forEach(key => {
                                            if (key === "meta") return;
                                            assert(result[key] !== undefined, "Property '" + key + "' doesn't exist");
                                            assert(result[key] === checkpoint.event[key], "Property '" + key + "' should be equal. was: " + result[key] + " but expected: " + checkpoint.event[key]);
                                        });
                                        Object.keys(result).forEach(key => {
                                            if (key === "meta") return;
                                            assert(checkpoint.event[key] !== undefined, "Property '" + key + "' shouldn't exist it the resulting event.");
                                        });
                                    } 
                            } else if (checkpoint.exception && !checkpoint.event) { // testing exception
                                if (checkpoint.test !== undefined) {
                                    checkpoint.test(
                                        Given = acc.events, 
                                        When = checkpoint.command, 
                                        Then = checkpoint.exception); 
                                } else {
                                    console.log("running exception test auto-runner");
                                    const result = run_with_expected_error(slice.test_function, acc.events, checkpoint.command);
                                    assert(result !== null, "Should throw '" + checkpoint.exception.message + "' error but did not throw an exception");
                                    assert(result === checkpoint.exception.message, "Should throw " + checkpoint.exception.message + " but threw: " + result);
                                }
                            } else { // bad chckpoint structure
                                console.log("bad checkpoint structure: command but no event/exception");
                                throw new Error("Bad checkpoint structure: command but no event/exception");
                            }
                        } else if (checkpoint.state) { // state view test
                            if (checkpoint.test !== undefined) {
                                checkpoint.test(
                                    Given = acc.events, 
                                    Then = checkpoint.state); 
                            } else {
                                const result = slice.test_function(acc.events);
                                assert (JSON.stringify(result) === JSON.stringify(checkpoint.state), "Should be equal to " + JSON.stringify(checkpoint.state) + " but was: " + JSON.stringify(result));
                            }
                        }
                        console.log("test passed");
                        summary += `  ✅ Test passed: ${checkpoint.purpose !== undefined ? checkpoint.purpose : checkpoint.test.name} \n`;
                        
                    } catch (error) {
                        console.log("test failed");
                        summary += `  ❌ Test failed: ${checkpoint.purpose !== undefined ? checkpoint.purpose : checkpoint.test.name} due to: ${error.message}\n`;
                        console.log("💥 Test failed in Slice '" + slice_name + "' with test '" + (checkpoint.test !== undefined ? checkpoint.test.name : "auto-runner") + "'");
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
    const failed = (summary.match(/^.*❌/gm) || []).length;
    const passed = (summary.match(/^.*✅/gm) || []).length;
    console.log("\x1b[" + (failed > 0 ? "91" : "92") + "m 🧪 Tests summary: Failed: " + failed + " Passed: " + passed + " \x1b[0m");
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
