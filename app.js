let port = 3002;
let slice_tests = [];
const sync_time = 0;
const eventstore = "./event-stream";
const event_seq_padding = '0000';

let run_tests = process.argv.includes('--test');
let long_ids = process.argv.includes('--long-ids');

const { v4: uuidv4 } = require('uuid'); function generate_id() { return long_ids ? uuidv4() : uuidv4().slice(0, 8); }
let app, fs, multer, upload;
if (!run_tests) {
    const express = require("express");
    app = express();
    fs = require("fs");
    multer = require("multer");
    upload = multer();
    app.set("view engine", "mustache");
    app.engine("mustache", require("mustache-express")());
    app.use(express.static('public'));
    app.use(express.json());
    app.use('/error.css', express.static('public/styles/error.css')); }

function strip_summary(event) { if (event) { delete event.summary; } return event; }
function get_events() { 
    if (!fs.existsSync(eventstore)) fs.mkdirSync(eventstore);
    return fs.readdirSync(eventstore).sort().map(file => { 
        const event = JSON.parse(fs.readFileSync(`${eventstore}/${file}`, "utf8"));
        if (!event.meta) event.meta = {}; event.meta.sequence = parseInt(file.substring(0, 4));
        return event;
    }); }
function push_event(event) {
    let event_type = event.name;
    let summary = event.summary ? event.summary : "";
    event = strip_summary(event);
    if (!fs.existsSync(eventstore)) fs.mkdirSync(eventstore);

    const event_count = fs.readdirSync(eventstore).filter(file => file.endsWith('-event.json')).length;
    
    const event_seq = event_seq_padding.slice(0, event_seq_padding.length - event_count.toString().length) + event_count;
    
    fs.writeFileSync(`${eventstore}/${event_seq}-${event_type}-${summary}-event.json`, JSON.stringify(event));
    if (sync_time === 0 ) notify_processors(event); }
    
if (sync_time > 0) setInterval(notify_processors, sync_time);
function notify_processors(event = null) {
    if (event === null) { processors.forEach(processor => processor.function(get_events())); return;}
    processors.forEach(processor => { if (processor.events.includes(event.name)) processor.function(get_events()); });}
const processors = [];

function change_state_http_wrapper(command_handler, command, error_next, success_action) {
    let events, result_event = undefined;
    try { events = get_events(); console.log("events count for state change: " + events.length);
    } catch (error) { console.error("Error getting events: " + error.message);
        const new_error = new Error(error.message); new_error.status = 500; return error_next(new_error); }
    try { result_event = command_handler(events, command); console.log("result_event: ", JSON.stringify(result_event));
    } catch (error) { console.error("Error changing state (command handler: " + command_handler.name + "): " + error.message); console.error("command: ", JSON.stringify(command));
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

if (!run_tests) app.get("/set-conference-name", (req, res) => { res.render("set-conference-name", { name: "" }); }); 

const slices = [];
slices.push({ name: "name_the_conference", 
    direction: "input", 
    data: (req) => { return req.body.conferenceName; }, 
    path: "/set-conference-name",
    view: "set-conference-name",
    on_success_path: "set-conference-name-confirmation",    
    initial_state: "",
    event_handlers: { "conference_named": (state, event) => { return event.data.name; } },
    exceptions: [ { "no_change_to_name": new Error("You didn't change the name. No change registered.") } ],
    invariant_function: (state, parameter) => {
            if (state === parameter) return { type: "exception", name: "no_change_to_name" };
            return { type: "event", data: { name: parameter }, name: "conference_named", summary: parameter };
    },
    test_timelines: [
        {   timeline_name: "Happy Path",
            checkpoints: [
                {   purpose: "test that the conference name is set to the new name",
                    parameter: "EM Open Spaces", 
                    event: { 
                        data: { name: "EM Open Spaces" }, 
                        name: "conference_named" } } ] },
        {   timeline_name: "Renames allowed",
            checkpoints: [
                {   event: { 
                        data: { name: "EM Open Spaces" }, 
                        name: "conference_named" } }, 
                {   purpose: "name should be changeable",
                    parameter: "Event Modeling Space",
                    event: { 
                        data: { name: "Event Modeling Space" }, 
                        name: "conference_named" } } ] },
        {   timeline_name: "Renames allowed multiple times",
            checkpoints: [
                {   event: { 
                        data: { name: "EM Open Spaces" }, 
                        name: "conference_named", } },
                {   event: { 
                        data: { name: "Event Modeling Space" }, 
                        name: "conference_named", } },
                {   purpose: "name should be changeable multiple times",
                    parameter: "Event Modeling Open Spaces",
                    event: { 
                        data: { name: "Event Modeling Open Spaces" }, 
                        name: "conference_named", }, } ] },
        {   timeline_name: "Renames not allowed if new name is the same",
            checkpoints: [
                {   event: { 
                        data: { name: "EM Open Spaces" }, 
                        name: "conference_named" } },
                {   purpose: "exception should be thrown if the conference name is not changed",
                    parameter: "EM Open Spaces",
                    exception: "no_change_to_name",
                } ] } ]
});

function bootstrap(slices) {
    //function app_get(path, error_next, success_action) {}
    function app_post(path, action) {
        console.log("calling app_post: ", path, action);
        app.post(path, upload.none(), action);
    }
    slices.forEach(slice => { console.log("bootstrapping slice: ", JSON.stringify(slice, null, 2));
        const app_method = slice.direction === "input" ? app_post : app_get; 
        app_method(slice.path, (req, res, error_next) => {
            let events = [];
            try { console.log("1.0 getting events");
                if (!fs.existsSync(eventstore)) fs.mkdirSync(eventstore);
                events = fs.readdirSync(eventstore).sort().map(file => { 
                    const event = JSON.parse(fs.readFileSync(`${eventstore}/${file}`, "utf8"));
                    if (!event.meta) event.meta = {}; event.meta.sequence = parseInt(file.substring(0, 4));
                    return event;
                }); console.log("1.1 events count: ", events.length);
            } catch (error) { console.error("1.2 Error getting events: " + error.message);
                const new_error = new Error(error.message); new_error.status = 500; return error_next(new_error); }

            let state = slice.initial_state; console.log("2.0 getting state from events");
            events.forEach(event => {
                if (slice.event_handlers === undefined) return;
                try { if (slice.event_handlers[event.name] === undefined) return;
                    state = slice.event_handlers[event.name](state, event); } catch (error) { console.error("2.1 Error updating state: " + error.message); }
            }); console.log("2.2 state: ", JSON.stringify(state, null, 2));

            let result = undefined; console.log("3.0 calculating invariants");
            try { 
                const parameter = slice.data(req);
                result = slice.invariant_function(state, parameter);
            } catch (error) { console.error("3.1 Error invariant function: " + error.message);
                const new_error = new Error(error.message); new_error.status = 422; return error_next(new_error); }
            console.log("3.2 result: ", JSON.stringify(result, null, 2));
            switch (result.type) {
                case "event":
                    try { console.log("4.0 pushing event: ", JSON.stringify(result, null, 2));
                        let event_type = result.name;
                        let summary = result.summary ? result.summary : "";
                        let event = { data: result.data, name: event_type};
                        if (!fs.existsSync(eventstore)) fs.mkdirSync(eventstore);

                        const event_count = fs.readdirSync(eventstore).filter(file => file.endsWith('-event.json')).length;
                        
                        const event_seq = event_seq_padding.slice(0, event_seq_padding.length - event_count.toString().length) + event_count;
                        
                        fs.writeFileSync(`${eventstore}/${event_seq}-${event_type}-${summary}-event.json`, JSON.stringify(event));
                        if (sync_time === 0 ) notify_processors(event); 

                        res.redirect(slice.on_success_path);
                    } catch (error) { console.error("4.1 Error pushing event: " + error.message);
                        const new_error = new Error(error.message); new_error.status = 500; return error_next(new_error); }
                    break;
                case "exception":
                    error_next(result.exception);
                    break;
                case "query":
                    res.render(slice.on_success_path);
                    break;
            }
        });
    });
}
if (!run_tests) bootstrap(slices);

if (!run_tests) app.get("/set-conference-name-confirmation", (req, res, error_next) => {
    get_state_http_wrapper(conference_name_state_view, error_next, (conference_name) => {
        res.render("set-conference-name-confirmation", { conference_name });
    });
}); // app.get("/set-conference-name-confirmation")

function conference_name_state_view(history) {
    return history.reduce((name, event) => { if (event.meta.type === "conference_named") { return event.data.name; } return name; }, ""); } // conference_name_state_view

if (!run_tests) app.get("/set-dates", (req, res, next) => { res.render("set-dates", { dates: [] }); }); 

if (!run_tests) app.post("/set-dates", upload.none(), (req, res, error_next) => {
    change_state_http_wrapper(set_dates, { data: { startDate: req.body.startDate, endDate: req.body.endDate } }, error_next, () => { res.redirect('/set-dates-confirmation'); });
}); // app.post("/set-dates")

const exception_dates_have_invalid_range = new Error("Start date must be before end date");
function set_dates(history, command) {
    const start_date = new Date(command.data.startDate);
    const end_date = new Date(command.data.endDate);
    if (start_date > end_date) throw exception_dates_have_invalid_range;
    return { data: { start_date: command.data.startDate, end_date: command.data.endDate }, meta: { type: "set_dates", summary: command.data.startDate + " to " + command.data.endDate } };
} // set_dates

if (!run_tests) app.get("/set-dates-confirmation",(_, res, next)=>{ 
    get_state_http_wrapper(conference_dates_state_view, next, (conference_dates) => {
        res.render("set-dates-confirmation", conference_dates);
    });
}); 

function conference_dates_state_view(history) {
    return history.reduce((acc, event) => {
        if (event.meta.type === "set_dates") acc = event.data;
        return acc;
    });
} // conference_dates_state_view

if (!run_tests) app.get("/rooms", (req, res, error_next) => { 
    get_state_http_wrapper(rooms_state_view, error_next, (rooms) => {
        res.render("rooms", { rooms });
    });
});

function rooms_state_view(history) {
    return history.reduce((acc, event) => {
        switch(event.meta.type) {
            case "room_added": acc.push(event.data.room_name); break;
            case "room_renamed":
                const index = acc.indexOf(event.data.old_name);
                if (index !== -1) acc[index] = event.data.new_name;
                break;
            case "room_deleted":
                const deleteIndex = acc.indexOf(event.data.room_name);
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
            { event: { data: { room_name: "Auditorium" }, meta: { type: "room_added" } },
                state: [],
                purpose: "no rooms should be returned when no events have occurred"
            },
            { event: { data: { room_name: "CS100" }, meta: { type: "room_added" }},
                state: ["Auditorium"], 
                purpose: "one room should be returned when one room has been added"
            },
            { progress_marker: "at this point, the initial room reserves the name" },
            { event: { data: { room_name: "CS200" }, meta: { type: "room_added" } },
                state: ["Auditorium", "CS100"],
                purpose: "two rooms should be returned when two rooms have been added"
            },
            { event: { data: { old_name: "Auditorium", new_name: "Main Hall" }, meta: { type: "room_renamed" } },
                state: ["Auditorium", "CS100", "CS200"],
                purpose: "three rooms should be returned when three rooms have been added"
            },
            { event: { data: { room_name: "CS300" }, meta: { type: "room_added" } },
                state: ["Main Hall", "CS100", "CS200"],
                purpose: "renamed room should show new name in correct position"
            },
            { event: { data: { room_name: "CS200" }, meta: { type: "room_deleted" } } },
            { 
                state: ["Main Hall", "CS100", "CS300"],
                purpose: "deleted room should not be in the result"
            } // checkpoint
        ] // checkpoints
        } // timeline
    ] // timelines
    } // slice
); // test: rooms state view

if (!run_tests) app.post("/rooms", upload.none(), (req, res, error_next) => {
    change_state_http_wrapper(add_room, { data: { room_name: req.body.roomName } }, error_next, () => { res.redirect("/rooms"); });
}); // app.post("/rooms")

const exception_room_already_exists = new Error("Room already exists");
function add_room(events, command) {
    console.log("add_room", JSON.stringify(command, null, 2));
    if (events.some(event => event.meta.type === "room_added" && event.data.room_name === command.data.room_name)) 
        throw exception_room_already_exists;
    return { data: { room_name: command.data.room_name }, meta: { type: "room_added", summary: command.data.room_name } };
} // add_room

if (!run_tests) app.post("/time-slots", upload.none(), (req, res, error_next) => {
    change_state_http_wrapper(add_time_slot, { data: { start_time: req.body.startTime, end_time: req.body.endTime, name: req.body.name } }, error_next, () => { res.redirect("/time-slots"); });
}); // app.post("/time-slots")

const exception_time_slot_required_fields_missing = new Error("Start time, end time, and name are required");
const exception_time_slot_time_order_invalid = new Error("End time must be after start time");
const exception_time_slot_overlapping = new Error("Time slot is overlapping with others that are already defined");
function add_time_slot(history, command) {
    function timeToMinutes(timeStr) { const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;}
    if (!command.data.start_time || !command.data.end_time || !command.data.name) throw exception_time_slot_required_fields_missing;

    const newStart = timeToMinutes(command.data.start_time);
    const newEnd = timeToMinutes(command.data.end_time);
    if (newStart >= newEnd) throw exception_time_slot_time_order_invalid;
    
    const hasOverlap = history
        .filter(event => event.meta.type === "time_slot_added")
        .some(event => {
            const existingStart = timeToMinutes(event.data.start_time);
            const existingEnd = timeToMinutes(event.data.end_time);
            return (newStart < existingEnd && newEnd > existingStart);
        });
    if (hasOverlap) throw exception_time_slot_overlapping;

    return { data: { start_time: command.data.start_time, end_time: command.data.end_time, name: command.data.name },
        meta: { type: "time_slot_added", summary: command.data.start_time + " to " + command.data.end_time + " - " + command.data.name }
    };
} // add_time_slot

// each checkpoint is a test if a command is there 
slice_tests.push({ test_function: add_time_slot,
    timelines: [
        {
            timeline_name: "Happy Path",
            checkpoints: [
                {
                    event: { data: { start_time: "09:30", end_time: "10:25", name: "1st Session" },
                        meta: { type: "time_slot_added" }
                    },
                    command: { data: { start_time: "09:30", end_time: "10:25", name: "1st Session" } },
                    purpose: "first time slot should be added when valid"
                },
                {
                    event: { data: { start_time: "10:30", end_time: "11:25", name: "2nd Session" },
                        meta: { type: "time_slot_added" }
                    },
                    command: { data: { start_time: "10:30", end_time: "11:25", name: "2nd Session" } },
                    purpose: "second time slot should be added when valid"
                },
                {
                    exception: exception_time_slot_overlapping,
                    command: { data: { start_time: "11:00", end_time: "12:00", name: "1st Session" } },
                    purpose: "overlapping at the end of the time slot should be rejected"
                },
                {
                    exception: exception_time_slot_overlapping,
                    command: { data: { start_time: "10:00", end_time: "11:00", name: "1st Session" } },
                    purpose: "overlapping at the start of the time slot should be rejected"
                },
                {
                    exception: exception_time_slot_overlapping,
                    command: { data: { start_time: "10:45", end_time: "11:10", name: "1st Session" } },
                    purpose: "overlapping time slot entirely within an existing time slot should be rejected"
                }
            ]
        }
    ]
}); // test: Add Time Slot State Change

if (!run_tests) app.get("/time-slots",(_,res,error_next)=>{ 
    get_state_http_wrapper(time_slots_state_view, error_next, (time_slots) => { res.render("time-slots", { time_slots });});
});

function time_slots_state_view(history) {
    return history.reduce((acc, event) => {
        if (event.meta.type === "time_slot_added") acc.push({ ...event.data, meta: undefined, data: undefined });
        return acc;
    }, []); } // time_slots_state_view

if (!run_tests) app.get("/generate-conf-id", (_, res) => { res.render("generate-conf-id"); });

if (!run_tests) app.post("/generate-conf-id", (_, res, error_next) => { change_state_http_wrapper(request_unique_id, { data: {} }, error_next, () => { res.redirect('/join-conference'); }); }); 

const exception_unique_id_already_requested = new Error("A request already exists");
function request_unique_id(history, command) {
    const request_available =history.reduce((acc, event) => {
        switch(event.meta.type) {
            case "conference_id_requested": acc = false; break;
            case "conference_id_generated": acc = true; break;
            default: break;
        }
        return acc;
    }, true );
    if (!request_available) throw exception_unique_id_already_requested;
    return { data: {}, meta: { type: "conference_id_requested" } };
} // request_unique_id

slice_tests.push({ test_function: request_unique_id,
    timelines: [
        {
            timeline_name: "Happy Path",
            checkpoints: [        
                {
                    event: { data: {}, meta: { type: "conference_id_requested" } },
                    command: { data: {} },
                    purpose: "request unique ID should be added when requested",
                },
                {
                    exception: exception_unique_id_already_requested,
                    command: { data: {} },
                    purpose: "request unique ID should throw an error when request already exists",
                },
                {
                    event: { data: { conference_id: "1111-2222-3333" }, meta: { type: "conference_id_generated" } }
                },
                {
                    event: { data: {}, meta: { type: "conference_id_requested" } },
                    command: { data: {} },
                    purpose: "request unique ID event should be added when requested after a conference ID has been generated"
                }
            ]
        }
    ]
}); // test: request_unique_id_sc

if (!run_tests) app.get("/todo-gen-conf-ids",(_, res, error_next)=>{ 
    get_state_http_wrapper(todo_gen_conference_id_sv, error_next, (conference_ids) => { res.render("todo-gen-conf-ids", { conference_ids }); });
}); 

function todo_gen_conference_id_sv(history) {
    return history.reduce((acc, event) => {
        switch(event.meta.type) {
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
                acc.todos[acc.todos.length - 1].conference_id = event.data.conference_id;
                break;
        }
        acc.last_event = event;
        return acc;
    }, { todos: [], last_event: null }).todos;
} // todo_gen_conference_id_sv


slice_tests.push({ test_function: todo_gen_conference_id_sv,
    timelines: [
        {
            timeline_name: "Happy Path",
            checkpoints: [
                {
                    event: { data: {}, meta: { type: "conference_id_requested" } },
                    state: [],
                    purpose: "empty array should be returned when no events exist"
                },
                {
                    event: { data: { conference_id: "1111-2222-3333" }, meta: { type: "conference_id_generated" }},
                    state: [{ conference_id: "" }],
                    purpose: "empty conf ID should be added on request"
                },
                {
                    event: { data: {}, meta: { type: "some_other_event" } },
                    state: [{ conference_id: "1111-2222-3333" }],
                    purpose: "conf ID should be updated when generated"
                },
                {
                    progress_marker: "Second Request behaves the same way"
                },
                {
                    event: { data: {}, meta: { type: "conference_id_requested" } }
                },
                {
                    event: { data: { conference_id: "2222-3333-4444" }, meta: { type: "conference_id_generated" }},
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
                    event: { data: {}, meta: { type: "conference_id_requested" } }
                },
                {
                    progress_marker: "A duplicate request of an ID will be ignored"
                },
                {
                    event: { data: {}, meta: { type: "conference_id_requested" } },
                    state: [{ conference_id: "" }],
                    purpose: "duplicate request should be ignored"
               },
                {
                    event: { data: { conference_id: "3333-4444-5555" }, meta: { type: "conference_id_generated" } }
                },
                {
                    progress_marker: "A duplicate provision of an ID will be ignored"
                },
                {
                    event: { data: { conference_id: "4444-5555-6666" }, meta: { type: "conference_id_generated" } },
                    state:  [{ conference_id: "3333-4444-5555" }] ,
                    purpose: "duplicate generation should be ignored"
                }
            ]
        },
        {
            timeline_name: "If no requests appear in the TODO list, a provided ID is ignored",
            checkpoints: [
                {
                    event: { data: { conference_id: "1111-2222-3333" }, meta: { type: "conference_id_generated" } },
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
    const conference_id_generated_event = provide_conference_id(get_events(), { data: { conference_id: conference_id } });
    push_event(conference_id_generated_event, 'id:' + conference_id);
    console.log("Generated unique ID: " + conference_id);
} // generate_conference_id

const error_no_request_found = new Error("No conf ID request found.");
function provide_conference_id(history, command) {
    const events = history.reduce((acc, event) => {
        switch(event.meta.type) {
            case "conference_id_requested": acc.push(event); break;
            case "conference_id_generated": acc.push(event); break;
            default: break;
        }
        return acc;
    }, []);
    if (events.length === 0 || events[events.length - 1].meta.type !== "conference_id_requested") {
        console.log("No conf ID request found.");
        throw error_no_request_found;
    }
    return { data: { conference_id: command.data.conference_id }, meta: { type: "conference_id_generated" } };
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
                    command: { data: { conference_id: "1111-2222-3333" } },
                    purpose: "provide unique ID should throw an error when no request exists"
                },
                { 
                    event: { data: {}, meta: { type: "conference_id_requested" } } 
                },
                {
                    event: { data: {}, meta: { type: "some_other_event" } }
                },
                {
                    progress_marker: "Test the happy path"
                },
                { 
                    event: { data: { conference_id: "1111-2222-3333" }, meta: { type: "conference_id_generated" } },
                    command: { data: { conference_id: "1111-2222-3333" } },
                    purpose: "provide unique ID should be added when requested"
                },
                {
                    event: { data: {}, meta: { type: "conference_id_requested" } }
                },
                {
                    event: { data: { conference_id: "2222-3333-4444" }, meta: { type: "conference_id_generated" }}
                },
                {
                    exception: error_no_request_found,
                    command: { data: { conference_id: "3333-4444-5555" } },
                    purpose: "provide unique ID should throw an error when no request exists"
                }
            ]
        }
    ]
}); // test: generate_conference_id_sc

if (!run_tests) app.get("/join-conference", (_, res, error_next) => { 
    get_state_http_wrapper(join_conference_sv, error_next, (state) => { res.render("join-conference", { conference_id: state.conference_id || "1234" }); });
}); 

function join_conference_sv(history) {
    return history.reduce((acc, event) => {
        switch(event.meta.type) { case "conference_id_generated": acc.conference_id = event.data.conference_id; break; }
        return acc;
    }, { conference_id: null });
} // join_conference_sv

if (!run_tests) app.get("/register/:conference_id", (req, res, error_next) => { 
    get_state_http_wrapper(conference_name_state_view, error_next, (conference_name) => { res.render("register", { conference_name, conference_id: req.params.conference_id }); });
}); 

if (!run_tests) app.post("/register/:conference_id", multer().none(), (req, res, error_next) => {
    const id = req.params.conference_id;
    const name = req.body.participantName;
    const registration_id = generate_id();
    change_state_http_wrapper(register_state_change,{ data: { conference_id: id, registration_id: registration_id, name: name } }, error_next, () => { res.redirect(`/register-success/${registration_id}`); });
}); // app.post("/register/:id")
        
if (!run_tests) app.post("/close-registration", (_, r, error_next) => { 
    change_state_http_wrapper(close_registration_state_change, {}, error_next, () => { r.redirect("/sessions"); });
});

if (!run_tests) app.get("/register-success/:registration_id", (req, res, error_next) => { 
    const registration_id = req.params.registration_id;
    get_state_http_wrapper(registrations_state_view, error_next, (state) => { res.render("register-success", { conference_name: state.conference_name, registration_id: registration_id, name: state.registrations[registration_id] }); });
}); 

function registrations_state_view(history) {
    return history.reduce((acc, event) => {
        switch(event.meta.type) {
            case "conference_id_generated":
                acc.conference_id = event.data.conference_id;
                acc.registrations = {};
                break;
            case "conference_named":
                acc.conference_name = event.data.name;
                break;
            case "registered":
                acc.registrations[event.data.registration_id] = event.data.name;
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
                acc.names.add(event.data.name);
                break;
            case "conference_id_generated":
                acc.conference_id = event.data.conference_id;
                acc.names = new Set();
                break;
            default:
                break;
        }
        return acc;
    }, { conference_id: null, names: new Set() });

    if (   registration_state.conference_id === null 
        || registration_state.conference_id !== command.data.conference_id) throw error_registration_closed;
    if (registration_state.names?.has(command.data.name)) throw error_already_registered;

    return { 
        data: { 
            name: command.data.name, 
            registration_id: command.data.registration_id, 
            conference_id: command.data.conference_id 
        },
        meta: { type: "registered", summary: command.data.name + "," + command.data.registration_id }
    };
} // register_state_change

slice_tests.push({ test_function: register_state_change,
    timelines: [
        {
            timeline_name: "First Timeline",
            checkpoints: [
                {
                    exception: error_registration_closed,
                    command: { data: {
                            name: "Adam",
                            registration_id: "eeee-ffff-00000",
                            conference_id: "1111-2222-3333"
                        }},
                    purpose: "Should reject registration when conference doesn't exist"
                },
                {
                    event: { data: { conference_id: "1111-2222-3333" }, meta: { type: "conference_id_generated" }}
                },
                {
                    event: { data: { 
                            name: "Adam",
                            registration_id: "eeee-ffff-00000",
                            conference_id: "1111-2222-3333"
                        },
                        meta: { type: "registered" }
                    },
                    command: {
                        data: { 
                            name: "Adam",
                            registration_id: "eeee-ffff-00000",
                            conference_id: "1111-2222-3333"
                        }
                    },
                    purpose: "Should allow first registration"
                },
                {
                    exception: error_already_registered,
                    command: {
                        data: { 
                            name: "Adam",
                            registration_id: "cccc-dddd-1111",
                            conference_id: "1111-2222-3333"
                        }
                    },
                    purpose: "Should reject duplicate registration"
                },
                {
                    event: {
                        data: { conference_id: "1111-2222-3333" },
                        meta: { type: "registration_closed" }
                    }
                },
                {
                    progress_marker: "A second conference is started"
                },
                {
                    event: { data: { conference_id: "2222-3333-4444" }, meta: { type: "conference_id_generated" }}
                },
                {
                    exception: error_registration_closed,
                    command: { data: { 
                            name: "Adam",
                            registration_id: "eeee-ffff-00000",
                            conference_id: "1111-2222-3333"
                        } },
                    purpose: "Should reject registration for old conference"
                },
                {
                    event: { data: { 
                            name: "Adam",
                            registration_id: "aaaa-bbbb-00000",
                            conference_id: "2222-3333-4444"
                        },
                        meta: { type: "registered" }
                    },
                    command: { data: { 
                            name: "Adam",
                            registration_id: "aaaa-bbbb-00000",
                            conference_id: "2222-3333-4444"
                        }
                    },
                    purpose: "Should allow registration for new conference"
                }
            ]
        },
        {
            timeline_name: "Registration is closed",
            checkpoints: [
                {
                    event: { data: { conference_id: "1111-2222-3333" }, meta: { type: "conference_id_generated" }}
                },
                {
                    event: { data: { conference_id: "1111-2222-3333" }, meta: { type: "registration_closed" }}
                },
                {
                    exception: error_registration_closed,
                    command: { data: { 
                            name: "Adam",
                            registration_id: "eeee-ffff-00000",
                            conference_id: "1111-2222-3333"
                        }
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
    return { data: {}, meta: { type: "registration_closed" } };
} // close_registration_state_change

if (!run_tests) app.get("/topic-suggestion", (req, res, error_next) => {
    get_access_token_http_wrapper(req, error_next, (token) => { res.render("submit-session", { name: token.name, registration_id: token.registration_id }); });
}); // app.get("/topic-suggestion", (req, res) => {

if (!run_tests) app.post("/topic-suggestion", multer().none(), (req, res, error_next) => {
    get_access_token_http_wrapper(req, error_next, (token) => {
        change_state_http_wrapper(submit_session, { 
            data: { 
                topic: req.body.topic, 
                facilitation: req.body.facilitation, 
                registration_id: token.registration_id 
            }
        }, error_next, () => { res.redirect("/topics?registration_id=" + token.registration_id); });
    });
}); // app.post("/topic-suggestion", (req, res) => {

const error_session_already_submitted = new Error("A session with this topic has already been suggested");
function submit_session(events, command) {
    const existingTopics = events.reduce((acc, event) => {
        switch(event.meta.type) {
            case "conference_id_generated": acc.topics = new Set(); break;
            case "session_submitted": acc.topics.add(event.data.topic.toLowerCase()); break;
        }
        return acc;
    }, { topics: new Set() }).topics;

    if (existingTopics.has(command.data.topic.toLowerCase())) throw error_session_already_submitted;
    return { data: { topic: command.data.topic, facilitation: command.data.facilitation, registration_id: command.data.registration_id }, meta: { type: "session_submitted", summary: command.data.facilitation + "," + command.data.topic + "," + command.data.registration_id }};
} // function submit_session(events, command)

if (!run_tests) app.get("/topics", (req, res, error_next) => {
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
                acc.registrations[event.data.registration_id] = event.data.name;
                break;
            case "session_submitted":
                try {
                    acc.topics.push({ topic: event.data.topic, facilitation: event.data.facilitation, name: acc.registrations[event.data.registration_id] });
                } catch (error) { console.log("Error adding topic: " + error.message); }
                break;
            default: break;
        }
        return acc;
    }, { registrations: {}, topics: [] }); 
    return state.topics;
} // topics_state_view

function get_state_http_wrapper_v2(query, error_next, success_action) {
    let events = null;
    try { events = get_events(); console.log("events count for state view: " + events.length);
    } catch (error) { console.error("Error getting events: " + error.message);
        const new_error = new Error(error.message); new_error.status = 500; return error_next(new_error); }
    let state = null;
    try { state = query.state_view(events); console.log("state: ", JSON.stringify(state));
        state = query.adjustment_function(state); console.log("state after adjustment_function: ", JSON.stringify(state));
    } catch (error) { console.error("Error getting state: " + error.message);
        const new_error = new Error(error.message); new_error.status = 500; return error_next(new_error); }
    if (success_action !== undefined) success_action(state);
    return state;
} // get_state_via_http

if (!run_tests) app.get("/voting", (req, res, error_next) => {
    get_access_token_http_wrapper(req, error_next, (token) => {
         get_state_http_wrapper_v2(
            { 
                state_view: voting_state_view, 
                adjustment_function: (state) => {
                    return { registration_id: token.registration_id, sessions: state.map(topic =>({ 
                        ...topic, 
                        voted: topic.voters.includes(token.registration_id) })) }; }}, 
            error_next, 
            (model) => { res.render("voting", model); });
    });
}); // voting

function history_reducer(history, default_state, event_handlers) {
    const state = history.reduce((acc, event) => {
        console.log("processing event: " + JSON.stringify(event, null, 2));
        let event_handler = undefined;
        try {
            if (!event_handlers[event.meta.type]) return acc; // skipping event
            event_handler = event_handlers[event.meta.type];
        } catch (error) {
            console.error("Error getting event handler for event: " + JSON.stringify(event, null, 2));
            console.error(error);
            return acc;
        }
        try {
            event_handler(acc, event);
        } catch (error) {
            console.error("Error handling event: " + JSON.stringify(event, null, 2));
            console.error(error);
            return acc;
        }
        return acc;
    }, default_state);
    return state;
}
function state_change(command) {
    const state = history_reducer(command.history, command.default_state, command.event_handlers);
    return command.invariant_function(state);
}

function state_view(history, event_handlers, initial_state, mapper_function) {
    const state = history_reducer(history, initial_state, event_handlers);
    let model = undefined;
    try { model = mapper_function(state); console.log("model: ", JSON.stringify(model, null, 2));
    } catch (error) { console.error("Error mapping state: " + JSON.stringify(state, null, 2)); console.error(error); }
    return model;
}

function voting_state_view(history) {
    return state_view(history, event_handlers = {
        "conference_id_generated": (state, event) => { state = { registrations: {}, topics: [] }; },
        "registered": (state, event) => { state.registrations[event.data.registration_id] = event.data.name; },
        "session_submitted": (state, event) => { state.topics.push({ topic: event.data.topic, facilitation: event.data.facilitation, name: state.registrations[event.data.registration_id], votes: [] }); },
        "voted_for_sessions": (state, event) => {
            state.topics.forEach(topic => { topic.votes = topic.votes.filter(vote => vote !== event.data.registration_id); });
            event.data.topics.forEach(topic => { state.topics.forEach(t => { if (t.topic === topic) t.votes.push(event.data.registration_id); }); });
        },
        "close_voting": (state, event) => { state.closed = true; }
    }, initial_state = { registrations: {}, topics: [] }, 
       mapper_function = (state)=> { 
         return state.topics.map(topic => (
        { topic: topic.topic, facilitation: topic.facilitation, name: topic.name, vote_count: topic.votes.length, voters: topic.votes }));
    });
} // voting_state_view

function get_votes_from_post_request(req) {
    const selectedTopics = [];
    for (const [key, value] of Object.entries(req.body)) selectedTopics.push(key.replace("session_", ""));
    return selectedTopics;
}

function change_state_http_wrapper_v2(command, error_next, success_action) {
    let events, result_event = undefined;
    try { events = get_events(); console.log("events count for state change: " + events.length);
    } catch (error) { console.error("Error getting events: " + error.message);
        const new_error = new Error(error.message); new_error.status = 500; return error_next(new_error); }
    console.log("-- command: ", JSON.stringify(command, null, 2));
        try { 
            const command_handler = command.meta.command_handler;
            const input_data = {...command, command_handler: undefined};
            console.log("-- input_data: ", JSON.stringify(input_data, null, 2));
            result_event = command_handler(events, input_data); console.log("result_event: ", JSON.stringify(result_event));
    } catch (error) { console.error("Error changing state (command: " + JSON.stringify(command) + "): " + error.message); 
        const new_error = new Error(error.message); new_error.status = 422; return error_next(new_error); }
    try { push_event(result_event);
    } catch (error) { console.error("Error pushing event: " + error.message); 
        const new_error = new Error(error.message); new_error.status = 500; return error_next(new_error); }
    if (success_action !== undefined) success_action(result_event);
    return result_event;
} // change_state_via_http

if (!run_tests) app.post("/voting", multer().none(), (req, res, error_next) => {
    get_access_token_http_wrapper(req, error_next, (token) => {
        change_state_http_wrapper_v2(command = { meta: { command_name: "vote_for_sessions", command_handler: vote_for_sessions }, data: { topics: get_votes_from_post_request(req), registration_id: token.registration_id } }, error_next, () => { res.redirect("/voting?registration_id=" + token.registration_id); });
    });
}); // vote

const error_voting_closed = new Error("Voting is closed");
const error_topic_not_found = new Error("Topic not found");
function vote_for_sessions(history, input) {
    console.log("-- vote_for_sessions input: ", JSON.stringify(input, null, 2));
    return state_change(command = {
        history: history,
        default_state: { topics: [], closed: false },
        event_handlers: {
            "conference_id_generated": (state, event) => { state = { topics: [], closed: false }; },
            "session_submitted": (state, event) => { state.topics.push({ topic: event.data.topic}); },
            "close_voting": (state, event) => { state.closed = true; } },
        invariant_function: (state) => {
            if (state.closed) throw error_voting_closed;
            if (!input.data.topics.reduce((acc, topic) => {
                if (!state.topics.find(t => t.topic === topic)) return false;
                return acc;
            }, true)) throw error_topic_not_found;
            return { data: { registration_id: input.data.registration_id, topics: input.data.topics }, meta: { type: "voted_for_sessions", summary: input.data.registration_id + "," + input.data.topics} };
        }
    }); 
} // vote_for_sessions

// Custom error handler for 404s
if (!run_tests) app.use((req, res, next) => {
    // skip favicon.ico requests
    if (req.path === "/favicon.ico") return;
    console.log("404 error handler: " + req.path);
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// Global error handler
if (!run_tests) app.use((err, req, res, next) => {
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
    // add slices to slice_tests at the beginning of the array
    //slice_tests.unshift(...slices);
    slices.forEach(slice => {
        const slice_name = slice.name !== undefined ? slice.name : slice.test_function.name.replaceAll("_", " ");
        summary += `🍰 Testing slice: ${slice_name}\n`;
        slice.test_timelines.forEach(timeline => {
            summary += ` ⏱️  Testing timeline: ${timeline.timeline_name}\n`;
            timeline.checkpoints.reduce((acc, checkpoint) => {
                summary += checkpoint.progress_marker ? `  🦉 ${checkpoint.progress_marker}\n` : '';
                if (checkpoint.purpose !== undefined) {
                    try {
                        const state = acc.events.reduce((acc, event) => {
                            if (slice.event_handlers[event.name] === undefined) return state;
                            return slice.event_handlers[event.name](acc, event);
                        }, slice.initial_state);
                        let result = slice.invariant_function(state, checkpoint.parameter, slice.exceptions);
                        const expected = checkpoint.exception !==undefined ? { name: checkpoint.exception } : checkpoint.event || checkpoint.model;
                        result = { ...result, type: undefined, summary: undefined }; 
                        
                        assert(JSON.stringify(result) === JSON.stringify(expected), "Should be equal to " + JSON.stringify(expected) + " but was: " + JSON.stringify(result));
                        
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
            console.log(`  http://localhost:${port}${route.path}  ${route.stack.reduce((acc, s) => {return s.method + ", " + acc;}, "")}`);
            //console.log(JSON.stringify(route, null, 2));
        });
    //console.log(JSON.stringify(app._router.stack, null, 2));
});     
