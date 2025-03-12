let port = 3002;
let slice_tests = [];
const sync_time = 0;
let eventstore = "./event-stream";
const event_seq_padding = '0000';

let run_tests = process.argv.includes('--test');
let long_ids = process.argv.includes('--long-ids');

const { v4: uuidv4 } = require('uuid'); function generate_id() { return long_ids ? uuidv4() : uuidv4().slice(0, 8); }
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

function strip_summary(event) { if (event && event.meta) { delete event.meta.summary; } return event; }
function get_events() { 
    if (!fs.existsSync(eventstore)) fs.mkdirSync(eventstore);
    return  fs.readdirSync(eventstore).sort().map(file => { return JSON.parse(fs.readFileSync(`${eventstore}/${file}`, "utf8")); }); }
function push_event(event) {
    let event_type = event.meta.type;
    let summary = event.meta.summary ? event.meta.summary : "";
    event = strip_summary(event);
    if (!fs.existsSync(eventstore)) fs.mkdirSync(eventstore);
    const event_count = fs.readdirSync(eventstore).filter(file => file.endsWith('-event.json')).length;
    const event_seq = event_seq_padding.slice(0, event_seq_padding.length - event_count.toString().length) + event_count;
    fs.writeFileSync(`${eventstore}/${event_seq}-${event_type}-${summary}-event.json`, JSON.stringify(event));
    if (sync_time === 0 ) notify_processors(event); }
    
if (sync_time > 0) setInterval(notify_processors, sync_time);
function notify_processors(event = null) {
    if (event === null) { processors.forEach(processor => processor.function(get_events())); return;}
    processors.forEach(processor => { if (processor.events.includes(event.meta.type)) processor.function(get_events()); });}
const processors = [];

function change_state_http_wrapper(command_handler, command, error_next, success_action) {
    let events, result_event = undefined;
    try { events = get_events(); console.log("events count for state change: " + events.length);
    } catch (error) { console.error("Error getting events: " + error.message);
        const new_error = new Error(error.message); new_error.status = 500; return error_next(new_error); }
    try { result_event = command_handler(events, command); console.log("result_event: ", JSON.stringify(result_event));
    } catch (error) { console.error("Error changing state: " + error.message);
        const new_error = new Error(error.message); new_error.status = 422; return error_next(new_error); }
    try { push_event(result_event);
    } catch (error) { console.error("Error pushing event: " + error.message); 
        const new_error = new Error(error.message); new_error.status = 500; return error_next(new_error); }
    if (success_action !== undefined) success_action(result_event);
    return result_event;
} // change_state_via_http

function get_state_http_wrapper(state_view, error_next, success_action) {
    let events = null;
    try { events = get_events(); console.log("events count for state view: " + events.length);
    } catch (error) { console.error("Error getting events: " + error.message);
        const new_error = new Error(error.message); new_error.status = 500; return error_next(new_error); }
    let state = null;
    try { state = state_view(events); console.log("state: ", JSON.stringify(state));
    } catch (error) { console.error("Error getting state: " + error.message);
        const new_error = new Error(error.message); new_error.status = 500; return error_next(new_error); }
    if (success_action !== undefined) success_action(state);
    return state;
} // get_state_via_http

function get_access_token_http_wrapper(request, error_next, success_action) {
    const registration_id = request.query.registration_id || request.params.registration_id; 
    get_state_http_wrapper(registrations_state_view, error_next, (state) => {
        const name = state.registrations[registration_id];
        if (name === undefined) { const new_error = new Error("Forbidden"); new_error.status = 403; return error_next(new_error); }
        const token = { name: name, registration_id: registration_id };
        if (success_action !== undefined) success_action(token);
        return token;
    });
} // get_access_token

app.get("/set-conference-name", (req, res) => { res.render("set-conference-name", { name: "" }); }); 

app.post('/set-conference-name', upload.none(), (req, res, error_next) => {
    change_state_http_wrapper(set_conference_name, { name: req.body.conferenceName }, error_next, () => { res.redirect('/set-conference-name-confirmation'); });
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
                        name: "EM Open Spaces", 
                        meta: { type: "conference_named" }, 
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
                        name: "EM Open Spaces", 
                        meta: { type: "conference_named" }, 
                    }
                },
                {
                    event: { 
                        name: "Event Modeling Space", 
                        meta: { type: "conference_named" }, 
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
                        name: "EM Open Spaces", 
                        meta: { type: "conference_named" }, 
                    }
                },
                { 
                    event: { 
                        name: "Event Modeling Space", 
                        meta: { type: "conference_named" }, 
                    }
                },
                {
                    event: { 
                        name: "Event Modeling Open Spaces", 
                        meta: { type: "conference_named" }, 
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
                        name: "EM Open Spaces", 
                        meta: { type: "conference_named" }, 
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

app.get("/set-conference-name-confirmation", (req, res, error_next) => {
    get_state_http_wrapper(conference_name_state_view, error_next, (conference_name) => {
        res.render("set-conference-name-confirmation", { conference_name });
    });
}); // app.get("/set-conference-name-confirmation")

function conference_name_state_view(history) {
    return history.reduce((name, event) => { if (event.meta.type === "conference_named") { return event.name; } return name; }, ""); } // conference_name_state_view

app.get("/set-dates", (req, res, next) => { res.render("set-dates", { dates: [] }); }); 

app.post("/set-dates", upload.none(), (req, res, error_next) => {
    change_state_http_wrapper(set_dates, { startDate: req.body.startDate, endDate: req.body.endDate }, error_next, () => { res.redirect('/set-dates-confirmation'); });
}); // app.post("/set-dates")

const exception_dates_have_invalid_range = new Error("Start date must be before end date");
function set_dates(history, command) {
    const start_date = new Date(command.startDate);
    const end_date = new Date(command.endDate);
    if (start_date > end_date) throw exception_dates_have_invalid_range;
    return { start_date: command.startDate, end_date: command.endDate, meta: { type: "set_dates", summary: command.startDate + " to " + command.endDate } };
} // set_dates

app.get("/set-dates-confirmation",(_, res, next)=>{ 
    get_state_http_wrapper(conference_dates_state_view, next, (conference_dates) => {
        res.render("set-dates-confirmation", conference_dates);
    });
}); 

function conference_dates_state_view(history) {
    const conference_dates_event = history.findLast(event => event.meta.type === "set_dates");
    if (conference_dates_event === undefined) return { start_date: "", end_date: "" };
    return { start_date: conference_dates_event.start_date, end_date: conference_dates_event.end_date };
} // conference_dates_state_view

app.get("/rooms", (req, res, error_next) => { 
    get_state_http_wrapper(rooms_state_view, error_next, (rooms) => {
        res.render("rooms", { rooms });
    });
});

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

app.post("/rooms", upload.none(), (req, res, error_next) => {
    change_state_http_wrapper(add_room, { room_name: req.body.roomName }, error_next, () => { res.redirect("/rooms"); });
}); // app.post("/rooms")

const exception_room_already_exists = new Error("Room already exists");
function add_room(events, command) {
    if (events.some(event => event.meta.type === "room_added" && event.room_name === command.room_name)) 
        throw exception_room_already_exists;
    return { room_name: command.room_name, meta: { type: "room_added", summary: command.room_name } };
} // add_room

app.post("/time-slots", upload.none(), (req, res, error_next) => {
    change_state_http_wrapper(add_time_slot, { start_time: req.body.startTime, end_time: req.body.endTime, name: req.body.name }, error_next, () => { res.redirect("/time-slots"); });
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

// each checkpoint is a test if a command is there 
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

app.get("/time-slots",(_,res,error_next)=>{ 
    get_state_http_wrapper(time_slots_state_view, error_next, (time_slots) => { res.render("time-slots", { time_slots });});
});

function time_slots_state_view(history) {
    return history.reduce((acc, event) => {
        if (event.meta.type === "time_slot_added") acc.push({ ...event, meta: undefined });
        return acc;
    }, []); } // time_slots_state_view

app.get("/generate-conf-id", (_, res) => { res.render("generate-conf-id"); });

app.post("/generate-conf-id", (_, res, error_next) => { change_state_http_wrapper(request_unique_id, {}, error_next, () => { res.redirect('/join-conference'); }); }); 

const exception_unique_id_already_requested = new Error("A request already exists");
function request_unique_id(history, command) {
    if (history.length > 0 && history[history.length - 1].meta.type === "conference_id_requested") throw exception_unique_id_already_requested;
    return { meta: { type: "conference_id_requested" } };
} // request_unique_id

slice_tests.push({ test_function: request_unique_id,
    timelines: [
        {
            timeline_name: "Happy Path",
            checkpoints: [        
                {
                    event: { meta: { type: "conference_id_requested" } },
                    command: {},
                    purpose: "request unique ID should be added when requested",
                },
                {
                    exception: exception_unique_id_already_requested,
                    command: {},
                    purpose: "request unique ID should throw an error when request already exists",
                },
                {
                    event: { conference_id: "1111-2222-3333", meta: { type: "conference_id_generated" } }
                },
                {
                    event: { meta: { type: "conference_id_requested" } },
                    command: {},
                    purpose: "request unique ID event should be added when requested after a conference ID has been generated"
                }
            ]
        }
    ]
}); // test: request_unique_id_sc

app.get("/todo-gen-conf-ids",(_, res, error_next)=>{ 
    get_state_http_wrapper(todo_gen_conference_id_sv, error_next, (conference_ids) => { res.render("todo-gen-conf-ids", { conference_ids }); });
}); 

function todo_gen_conference_id_sv(history) {
    return history.reduce((acc, current_event) => {
        switch(current_event.meta.type) {
            case "conference_id_requested":
                if (acc.last_event !== null && acc.last_event.meta.type === "conference_id_requested") break;
                acc.todos.push({ conference_id: "" });
                break;
            case "conference_id_generated":
                if (   acc.last_event === null 
                    || acc.last_event.meta.type !== "conference_id_requested"
                    || acc.todos.length === 0
                    || acc.todos[acc.todos.length - 1].conference_id !== "") 
                    break;
                acc.todos[acc.todos.length - 1].conference_id = current_event.conference_id;
                break;
        }
        acc.last_event = current_event;
        return acc;
    }, { todos: [], last_event: null }).todos;
} // todo_gen_conference_id_sv


slice_tests.push({ test_function: todo_gen_conference_id_sv,
    timelines: [
        {
            timeline_name: "Happy Path",
            checkpoints: [
                {
                    event: { meta: { type: "conference_id_requested" } },
                    state: [],
                    purpose: "empty array should be returned when no events exist"
                },
                {
                    event: { conference_id: "1111-2222-3333", meta: { type: "conference_id_generated" }},
                    state: [{ conference_id: "" }],
                    purpose: "empty conf ID should be added on request"
                },
                {
                    event: { meta: { type: "some_other_event" } },
                    state: [{ conference_id: "1111-2222-3333" }],
                    purpose: "conf ID should be updated when generated"
                },
                {
                    progress_marker: "Second Request behaves the same way"
                },
                {
                    event: { meta: { type: "conference_id_requested" } }
                },
                {
                    event: { conference_id: "2222-3333-4444", meta: { type: "conference_id_generated" }},
                    state: [{ conference_id: "1111-2222-3333" }, { conference_id: "" }],
                    purpose: "second request should add new empty conf ID"
                },
                {
                    state:  [{ conference_id: "1111-2222-3333" }, { conference_id: "2222-3333-4444" }],
                    purpose: "second conf ID should be updated when generated"
                }
            ]
        },
        {
            timeline_name: "A processor is idempotent",
            checkpoints: [
                {
                    event: { meta: { type: "conference_id_requested" } }
                },
                {
                    progress_marker: "A duplicate request of an ID will be ignored"
                },
                {
                    event: { meta: { type: "conference_id_requested" } },
                    state: [{ conference_id: "" }],
                    purpose: "duplicate request should be ignored"
               },
                {
                    event: { conference_id: "3333-4444-5555", meta: { type: "conference_id_generated" } }
                },
                {
                    progress_marker: "A duplicate provision of an ID will be ignored"
                },
                {
                    event: { conference_id: "4444-5555-6666", meta: { type: "conference_id_generated" } },
                    state:  [{ conference_id: "3333-4444-5555" }] ,
                    purpose: "duplicate generation should be ignored"
                }
            ]
        },
        {
            timeline_name: "If no requests appear in the TODO list, a provided ID is ignored",
            checkpoints: [
                {
                    event: { meta: { type: "conference_id_generated" }, conference_id: "1111-2222-3333" },
                    state: [] ,
                    purpose: "generated ID should be ignored without request"
                }
            ]
        }
    ]
}); // test: todo_gen_conference_id_sv

function generate_conference_id_processor(history) {
    console.log("Looking for conf ID request in:");
    const conference_ids = todo_gen_conference_id_sv(history);
    console.log(JSON.stringify(conference_ids, null, 2));
    if (   conference_ids.length === 0
        || conference_ids[conference_ids.length - 1].conference_id !== "") {
        console.log("No conf ID request found.");
        return;
    }
    console.log("Found conf ID request.");
    if (conference_ids[conference_ids.length - 1].conference_id === "") generate_conference_id();
} // gen_conference_id_processor
processors.push({ function: generate_conference_id_processor, events: ["conference_id_requested"] });

function generate_conference_id() {
    const conference_id = generate_id();
    const conference_id_generated_event = provide_conference_id(get_events(), { conference_id: conference_id });
    push_event(conference_id_generated_event, 'id:' + conference_id);
    console.log("Generated unique ID: " + conference_id);
} // generate_conference_id

const error_no_request_found = new Error("No conf ID request found.");
function provide_conference_id(unfiltered_events, command) {
    const events = unfiltered_events.filter(event => event.meta.type === "conference_id_requested" || event.meta.type === "conference_id_generated");
    if (events.length === 0 || events[events.length - 1].meta.type !== "conference_id_requested") {
        console.log("No conf ID request found.");
        throw error_no_request_found;
    }
    return { conference_id: command.conference_id, meta: { type: "conference_id_generated" } };
} // provide_conference_id

slice_tests.push({ test_function: provide_conference_id,
    timelines: [
        {
            timeline_name: "All scenarios in one timeline",
            checkpoints: [
                {
                    progress_marker: "Test trying to generate an ID with no events at all in history"
                },
                {
                    exception: error_no_request_found,
                    command: { conference_id: "1111-2222-3333" },
                    purpose: "provide unique ID should throw an error when no request exists"
                },
                { 
                    event: { meta: { type: "conference_id_requested" } } 
                },
                {
                    event: { meta: { type: "some_other_event" } }
                },
                {
                    progress_marker: "Test the happy path"
                },
                { 
                    event: { conference_id: "1111-2222-3333", meta: { type: "conference_id_generated" } },
                    command: { conference_id: "1111-2222-3333" },
                    purpose: "provide unique ID should be added when requested"
                },
                {
                    event: { meta: { type: "conference_id_requested" } }
                },
                {
                    event: { conference_id: "2222-3333-4444", meta: { type: "conference_id_generated" }}
                },
                {
                    exception: error_no_request_found,
                    command: { conference_id: "3333-4444-5555" },
                    purpose: "provide unique ID should throw an error when no request exists"
                }
            ]
        }
    ]
}); // test: generate_conference_id_sc

app.get("/join-conference", (_, res, error_next) => { 
    get_state_http_wrapper(join_conference_sv, error_next, (state) => { res.render("join-conference", { conference_id: state.conference_id || "1234" }); });
}); 

function join_conference_sv(history) {
    return history.reduce((acc, event) => {
        switch(event.meta.type) { case "conference_id_generated": acc.conference_id = event.conference_id; break; }
        return acc;
    }, { conference_id: null });
} // join_conference_sv

app.get("/register/:conference_id", (req, res, error_next) => { 
    get_state_http_wrapper(conference_name_state_view, error_next, (conference_name) => { res.render("register", { conference_name, conference_id: req.params.conference_id }); });
}); 

app.post("/register/:conference_id", multer().none(), (req, res, error_next) => {
    const id = req.params.conference_id;
    const name = req.body.participantName;
    const registration_id = generate_id();
    change_state_http_wrapper(register_state_change,{ conference_id: id, registration_id: registration_id, name: name }, error_next, () => { res.redirect(`/register-success/${registration_id}`); });
}); // app.post("/register/:id")
        
app.post("/close-registration", (_, r, error_next) => { 
    change_state_http_wrapper(close_registration_state_change, {}, error_next, () => { r.redirect("/sessions"); });
});

app.get("/register-success/:registration_id", (req, res, error_next) => { 
    const registration_id = req.params.registration_id;
    get_state_http_wrapper(registrations_state_view, error_next, (state) => { res.render("register-success", { conference_name: state.conference_name, registration_id: registration_id, name: state.registrations[registration_id] }); });
}); 

function registrations_state_view(history) {
    return history.reduce((acc, event) => {
        switch(event.meta.type) {
            case "conference_id_generated":
                acc.conference_id = event.conference_id;
                acc.registrations = {};
                break;
            case "conference_named":
                acc.conference_name = event.name;
                break;
            case "registered":
                acc.registrations[event.registration_id] = event.name;
                break;
            default: break; }
        return acc;
    }, { conference_id: null, conference_name: "-- not named yet --", registrations: {} });
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
                acc.conference_id = event.conference_id;
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
        name: command.name, 
        registration_id: command.registration_id, 
        conference_id: command.conference_id, 
        meta: { type: "registered", summary: command.name + "," + command.registration_id }
    };
} // register_state_change

slice_tests.push({ test_function: register_state_change,
    timelines: [
        {
            timeline_name: "First Timeline",
            checkpoints: [
                {
                    exception: error_registration_closed,
                    command: {
                        name: "Adam",
                        registration_id: "eeee-ffff-00000",
                        conference_id: "1111-2222-3333"
                    },
                    purpose: "Should reject registration when conference doesn't exist"
                },
                {
                    event: {conference_id: "1111-2222-3333", meta: { type: "conference_id_generated" }}
                },
                {
                    event: { 
                        name: "Adam",
                        registration_id: "eeee-ffff-00000",
                        conference_id: "1111-2222-3333",
                        meta: { type: "registered" }
                    },
                    command: {
                        name: "Adam",
                        registration_id: "eeee-ffff-00000",
                        conference_id: "1111-2222-3333"
                    },
                    purpose: "Should allow first registration"
                },
                {
                    exception: error_already_registered,
                    command: {
                        name: "Adam",
                        registration_id: "cccc-dddd-1111",
                        conference_id: "1111-2222-3333"
                    },
                    purpose: "Should reject duplicate registration"
                },
                {
                    event: {
                        conference_id: "1111-2222-3333",
                        meta: { type: "registration_closed" }
                    }
                },
                {
                    progress_marker: "A second conference is started"
                },
                {
                    event: {conference_id: "2222-3333-4444", meta: { type: "conference_id_generated" }}
                },
                {
                    exception: error_registration_closed,
                    command: {
                        name: "Adam",
                        registration_id: "eeee-ffff-00000",
                        conference_id: "1111-2222-3333"
                    },
                    purpose: "Should reject registration for old conference"
                },
                {
                    event: {
                        name: "Adam",
                        registration_id: "aaaa-bbbb-00000",
                        conference_id: "2222-3333-4444",
                        meta: { type: "registered" }
                    },
                    command: {
                        name: "Adam",
                        registration_id: "aaaa-bbbb-00000",
                        conference_id: "2222-3333-4444"
                    },
                    purpose: "Should allow registration for new conference"
                }
            ]
        },
        {
            timeline_name: "Registration is closed",
            checkpoints: [
                {
                    event: {
                        conference_id: "1111-2222-3333",
                        meta: { type: "conference_id_generated" }
                    }
                },
                {
                    event: {
                        conference_id: "1111-2222-3333",
                        meta: { type: "registration_closed" }
                    }
                },
                {
                    exception: error_registration_closed,
                    command: {
                        name: "Adam",
                        registration_id: "eeee-ffff-00000",
                        conference_id: "1111-2222-3333"
                    },
                    purpose: "Should reject registration when closed"
                }
            ]
        }
    ]
}); // test: registration_state_change

function close_registration_state_change(history, command) {
    const state = history.reduce((acc, event) => {
        switch(event.meta.type) {
            case "conference_id_generated": acc.closed = false; break;
            case "registration_closed": acc.closed = true; break; }
        return acc;
    }, { closed: true });
    if (state.closed) throw new Error("Registration is already closed");
    return { meta: { type: "registration_closed" } };
} // close_registration_state_change

app.get("/topic-suggestion", (req, res, error_next) => {
    get_access_token_http_wrapper(req, error_next, (token) => { res.render("submit-session", { name: token.name, registration_id: token.registration_id }); });
}); // app.get("/topic-suggestion", (req, res) => {

app.post("/topic-suggestion", multer().none(), (req, res, error_next) => {
    get_access_token_http_wrapper(req, error_next, (token) => {
        change_state_http_wrapper(submit_session, { 
            topic: req.body.topic, 
            facilitation: req.body.facilitation, 
            registration_id: token.registration_id 
        }, error_next, () => { res.redirect("/sessions?registration_id=" + token.registration_id); });
    });
}); // app.post("/topic-suggestion", (req, res) => {

const error_session_already_submitted = new Error("A session with this topic has already been suggested");
function submit_session(events, command) {
    const existingTopics = events.reduce((acc, event) => {
        switch(event.meta.type) {
            case "unique_id_generated_event": acc.topics = new Set(); break;
            case "session_submitted_event": acc.topics.add(event.topic.toLowerCase()); break;
        }
        return acc;
    }, { topics: new Set() }).topics;

    if (existingTopics.has(command.topic.toLowerCase())) throw error_session_already_submitted;
    return { topic: command.topic, facilitation: command.facilitation, registration_id: command.registration_id, meta: { type: "session_submitted", summary: command.facilitation + "," + command.topic + "," + command.registration_id }};
} // function submit_session(events, command)

app.get("/sessions", (req, res, error_next) => {
    get_state_http_wrapper(topics_state_view, error_next, (state) => { res.render("topics", { topics: state, registration_id: req.query.registration_id }); });
}); // sessions

function topics_state_view(history) {
    const state = history.reduce((acc, event) => { 
        switch(event.meta.type) { 
            case "conference_id_generated":
                acc.registrations = {};
                acc.topics = [];
                break;
            case "registered":
                acc.registrations[event.registration_id] = event.name;
                break;
            case "session_submitted":
                try {
                    acc.topics.push({ topic: event.topic, facilitation: event.facilitation, name: acc.registrations[event.registration_id] });
                } catch (error) { console.log("Error adding topic: " + error.message); }
                break;
            default: break;
        }
        return acc;
    }, { registrations: {}, topics: [] }); 
    return state.topics;
} // topics_state_view

// Custom error handler for 404s
app.use((req, res, next) => {
    // skip favicon.ico requests
    if (req.path === "/favicon.ico") return;
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
                                const result = slice.test_function(acc.events, checkpoint.command);
                                assert(JSON.stringify(strip_summary(result)) === JSON.stringify(checkpoint.event), "Should be equal to " + JSON.stringify(checkpoint.event) + " but was: " + JSON.stringify(result));
                            } else if (checkpoint.exception && !checkpoint.event) { // testing exception
                                console.log("running exception test auto-runner");
                                const result = run_with_expected_error(slice.test_function, acc.events, checkpoint.command);
                                assert(result !== null, "Should throw '" + checkpoint.exception.message + "' error but did not throw an exception");
                                assert(result === checkpoint.exception.message, "Should throw " + checkpoint.exception.message + " but threw: " + result);
                            } else { // bad chckpoint structure
                                console.log("bad checkpoint structure: command but no event/exception");
                                throw new Error("Bad checkpoint structure: command but no event/exception");
                            }
                        } else if (checkpoint.state) { // state view test
                            const result = slice.test_function(acc.events);
                            assert (JSON.stringify(strip_summary(result)) === JSON.stringify(checkpoint.state), "Should be equal to " + JSON.stringify(checkpoint.state) + " but was: " + JSON.stringify(result));
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
