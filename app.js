let port = 3002;
let slice_tests = [];
const sync_time = 0;
const eventstore = "./event-stream";
const event_seq_padding = '0000';

let run_tests = process.argv.includes('--test');
let long_ids = process.argv.includes('--long-ids');

const { v4: uuidv4 } = require('uuid'); function generate_id() { return long_ids ? uuidv4() : uuidv4().slice(0, 8); }
function deepClone(obj) { if (obj === undefined) return undefined; if (obj === null) return null;
    if (Array.isArray(obj)) return obj.map(deepClone);
    if (typeof obj === 'object') { return Object.fromEntries( Object.entries(obj).map(([key, value]) => [key, deepClone(value)]) ); }
    return obj; }
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

function bootstrap(slices) {
    //function app_get(path, error_next, success_action) {}
    function app_post(path, action) {
        console.log("calling app_post: ", path, action);
        app.post(path, upload.none(), action);
    }
    function app_get(path, action) {
        console.log("calling app_get: ", path, action);
        app.get(path, action);
    }
    slices.forEach(slice => { console.log("bootstrapping slice: ", JSON.stringify(slice, null, 2));
        if (slice.navigation.web_data === undefined && slice.refinement_function === undefined) {
            console.log("bootstrapping view only slice: ", slice.name);
            app.get(slice.navigation.path + "", (req, res) => { res.render(slice.navigation.view + "", {}); });
            return;
        }
        const app_method = slice.navigation.direction === "input" ? app_post : app_get;
        app_method(slice.navigation.path, (req, res, error_next) => {
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

            let state = deepClone(slice.initial_state); console.log("2.0 getting state from events");
            console.log("2.0.1 state: ", JSON.stringify(state, null, 2));
            console.log("2.0.2 slice initial state: ", JSON.stringify(slice.initial_state, null, 2));
            events.forEach(event => {
                if (slice.event_handlers === undefined) return;
                try { if (slice.event_handlers[event.name] === undefined) return;
                    state = slice.event_handlers[event.name](state, event); } catch (error) { console.error("2.1 Error updating state: " + error.message); }
            }); console.log("2.2 state: ", JSON.stringify(state, null, 2));

            let result = undefined; console.log("3.0 calculating invariants");
            try { 
                let parameter = undefined;
                if (slice.navigation.web_data) parameter = slice.navigation.web_data(req);
                result = slice.refinement_function(state, parameter);
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

                        res.redirect(slice.navigation.next_path);
                    } catch (error) { console.error("4.1 Error pushing event: " + error.message);
                        const new_error = new Error(error.message); new_error.status = 500; return error_next(new_error); }
                    break;
                case "exception":
                    console.log("5.0 exception: ", JSON.stringify(result, null, 2));
                    const exception = new Error(slice.exceptions[result.name]);
                    exception.status = 422;
                    error_next(exception);
                    break;
                case "query":
                    console.log("6.0 rendering query: ", JSON.stringify(result.query, null, 2));
                    res.render(slice.navigation.view, typeof result.query === "string" ? { model: result.query } : result.query);
                    break;
            }
        });
    });
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
}

const slices = [];
function make_event_result(name, data, summary) { return { type: "event", data: data, name: name, summary: summary }; }
function make_exception_result(name) { return { type: "exception", name: name }; }
function make_query_result(query) { return { type: "query", query: query }; }


slices.push({ name: "set_conference_name_default", 
    navigation: { direction: "output", path: "/set-conference-name", view: "set-conference-name" } });

slices.push({ name: "name_the_conference", 
    navigation: { direction: "input", path: "/set-conference-name", next_path: "/set-conference-name-confirmation", 
        web_data: (req) => { return req.body.conferenceName; } },
    event_handlers: { "conference_named": (state, event) => { return event.data.name; } },
    exceptions: { "no_change_to_name": "You didn't change the name. No change registered." },
    refinement_function: (state, parameter) => {
        if (state === parameter) return make_exception_result("no_change_to_name");
        return make_event_result("conference_named", { name: parameter }, parameter);
    },
    test_timelines: [
        {   timeline_name: "Happy Path",
            checkpoints: [
                {   purpose: "test that the conference name is set to the new name",
                    parameter: "EM Open Spaces", 
                    event: { data: { name: "EM Open Spaces" }, name: "conference_named" } } ] },
        {   timeline_name: "Renames allowed",
            checkpoints: [
                {   event: { data: { name: "EM Open Spaces" }, name: "conference_named" } }, 
                {   purpose: "name should be changeable",
                    parameter: "Event Modeling Space",
                    event: { data: { name: "Event Modeling Space" }, name: "conference_named" } } ] },
        {   timeline_name: "Renames allowed multiple times",
            checkpoints: [
                {   event: { data: { name: "EM Open Spaces" }, name: "conference_named", } },
                {   event: { data: { name: "Event Modeling Space" }, name: "conference_named", } },
                {   purpose: "name should be changeable multiple times",
                    parameter: "Event Modeling Open Spaces",
                    event: { data: { name: "Event Modeling Open Spaces" }, name: "conference_named", }, } ] },
        {   timeline_name: "Renames not allowed if new name is the same",
            checkpoints: [
                {   event: { data: { name: "EM Open Spaces" }, name: "conference_named" } },
                {   purpose: "exception should be thrown if the conference name is not changed",
                    parameter: "EM Open Spaces",
                    exception: "no_change_to_name",
                } ] } ]
});

slices.push( { name: "conference_name_confirmation", 
    navigation: { direction: "output", path: "/set-conference-name-confirmation", view: "set-conference-name-confirmation" },
    event_handlers: { "conference_named": (state, event) => { return event.data.name; } },
    refinement_function: (state, parameter) => { return make_query_result(state); },
});

slices.push({ name: "set_dates_default", 
    navigation: { direction: "output", path: "/set-dates", view: "set-dates" } });
 
slices.push({ name: "set_dates", 
    navigation: { direction: "input", path: "/set-dates", next_path: "/set-dates-confirmation", 
        web_data: (req) => { return { startDate: req.body.startDate, endDate: req.body.endDate }; } },
    event_handlers: { "dates_set": (state, event) => { return event.data.startDate; } },
    exceptions: { "invalid_range": "Start date must be before end date" } ,
    refinement_function: (state, parameter) => {
        const start_date = new Date(parameter.startDate);
        const end_date = new Date(parameter.endDate);
        if (start_date > end_date) return make_exception_result("invalid_range");
        return make_event_result("dates_set", { start_date: parameter.startDate, end_date: parameter.endDate }, parameter.startDate + " to " + parameter.endDate);
    }
});

slices.push({ name: "conference_dates_confirmation", 
    navigation: { direction: "output", path: "/set-dates-confirmation", view: "set-dates-confirmation" },
    event_handlers: { "dates_set": (state, event) => { return event.data; } },
    refinement_function: (state, parameter) => { return make_query_result(state); },
});

slices.push({ name: "rooms",
    navigation: { direction: "output", path: "/rooms", view: "rooms" },
    initial_state: [],
    event_handlers: { 
        "room_added": (state, event) => { state.push(event.data.room_name); return state; },
        "room_renamed": (state, event) => {
            const index = state.indexOf(event.data.old_name);
            if (index !== -1) state[index] = event.data.new_name;
            return state; },
        "room_deleted": (state, event) => {
            const index = state.indexOf(event.data.room_name);
            if (index !== -1) state.splice(index, 1);
            return state; },
    },
    refinement_function: (state, parameter) => { return make_query_result({ rooms: state }); },
    test_timelines: [
        { timeline_name: "happy path",
            checkpoints: [
                { purpose: "no rooms should be returned when no events have occurred",
                    query: { rooms: [] } },
                { event: { data: { room_name: "Auditorium" }, name: "room_added" }},
                { purpose: "one room should be returned when one room has been added",
                    query: { rooms: ["Auditorium"] } },
                { event: { data: { room_name: "CS100" }, name: "room_added" } },
                { progress_marker: "at this point, the initial room reserves the name" },
                { query: { rooms: ["Auditorium", "CS100"] },
                    purpose: "two rooms should be returned when two rooms have been added" },
                { event: { data: { room_name: "CS200" }, name: "room_added" } ,},
                { purpose: "three rooms should be returned when three rooms have been added",
                    query: { rooms: ["Auditorium", "CS100", "CS200"] } },
                { event: { data: { room_name: "CS300" }, name: "room_added" } },
                { purpose: "four rooms should be returned when three rooms have been added",
                    query: { rooms: ["Auditorium", "CS100", "CS200", "CS300"] } },
                { event: { data: { old_name: "Auditorium", new_name: "Main Hall" }, name: "room_renamed" } ,},
                { purpose: "renamed room should show new name in correct position",
                    query: { rooms: ["Main Hall", "CS100", "CS200", "CS300"] } },
                { event: { data: { room_name: "CS200" }, name: "room_deleted" } },
                { purpose: "deleted room should not be in the result",
                    query: { rooms: ["Main Hall", "CS100", "CS300"] } } 
            ] } ]
});

slices.push({ name: "add_room",
    navigation: { direction: "input", path: "/rooms", next_path: "/rooms",
        web_data: (req) => { return { roomName: req.body.roomName }; } },
    initial_state: [],
    event_handlers: { "room_added": (state, event) => { state.push(event.data.room_name); return state; },
        "room_renamed": (state, event) => {
            const index = state.indexOf(event.data.old_name);
            if (index !== -1) state[index] = event.data.new_name;
            return state; },
        "room_deleted": (state, event) => {
            const index = state.indexOf(event.data.room_name);
            if (index !== -1) state.splice(index, 1);
            return state; } },
    exceptions: { "room_already_exists": "Room by that name already exists" },
    refinement_function: (state, parameter) => { 
        if (state.some(room => room === parameter.roomName)) return make_exception_result("room_already_exists");
        return make_event_result("room_added", { room_name: parameter.roomName }, parameter.roomName); 
    },
});


slices.push({ name: "time_slots_addition",
    navigation: { direction: "input", path: "/time-slots", next_path: "/time-slots",
        web_data: (req) => { return { startTime: req.body.startTime, endTime: req.body.endTime, name: req.body.name }; } },
    initial_state: [],
    event_handlers: { "time_slot_added": (state, event) => { state.push(event.data); return state; } },
    exceptions: { 
        "time_slot_required_fields_missing": "Start time, end time, and name are required",
        "time_slot_time_order_invalid": "End time must be after start time",
        "time_slot_overlapping": "Time slot is overlapping with others that are already defined" },
    refinement_function: (state, parameter) => { 
        function timeToMinutes(timeStr) { const [hours, minutes] = timeStr.split(':').map(Number); return hours * 60 + minutes; }
        if (!parameter.startTime || !parameter.endTime || !parameter.name) return make_exception_result("time_slot_required_fields_missing");
        const newStart = timeToMinutes(parameter.startTime);
        const newEnd = timeToMinutes(parameter.endTime);
        if (newStart >= newEnd) return make_exception_result("time_slot_time_order_invalid");

        const hasOverlap = state.some(time_slot => {
            const existingStart = timeToMinutes(time_slot.start_time);
            const existingEnd = timeToMinutes(time_slot.end_time);
            return (newStart < existingEnd && newEnd > existingStart);
        });
        if (hasOverlap) return make_exception_result("time_slot_overlapping");
        return make_event_result("time_slot_added", { start_time: parameter.startTime, end_time: parameter.endTime, name: parameter.name }, parameter.startTime + " to " + parameter.endTime + " - " + parameter.name);
    },
    test_timelines: [
        { timeline_name: "Happy Path",
            checkpoints: [
                { purpose: "first time slot should be added when valid",
                    parameter: { startTime: "09:30", endTime: "10:25", name: "1st Session" },
                    event: { data: { start_time: "09:30", end_time: "10:25", name: "1st Session" }, name: "time_slot_added" } },
                { purpose: "second time slot should be added when valid",
                    parameter: { startTime: "10:30", endTime: "11:25", name: "2nd Session" },
                    event: { data: { start_time: "10:30", end_time: "11:25", name: "2nd Session" }, name: "time_slot_added" } },
                { purpose: "overlapping at the end of the time slot should be rejected",
                    parameter: { startTime: "11:00", endTime: "12:00", name: "1st Session" },
                    exception: "time_slot_overlapping" },
                { purpose: "overlapping at the start of the time slot should be rejected",
                    parameter: { startTime: "10:00", endTime: "11:00", name: "1st Session" },
                    exception: "time_slot_overlapping" },
                { purpose: "overlapping time slot entirely within an existing time slot should be rejected",
                    parameter: { startTime: "10:45", endTime: "11:10", name: "1st Session" },
                    exception: "time_slot_overlapping" } 
            ]
        }      
    ]
});

slices.push({ name: "time_slots_state_view",
    navigation: { direction: "output", path: "/time-slots", view: "time-slots" },
    initial_state: { time_slots: [] },
    event_handlers: { "time_slot_added": (state, event) => { state.time_slots.push(event.data); return state; } },
    refinement_function: (state, parameter) => { return make_query_result(state); },
});



// if (!run_tests) app.get("/time-slots",(_,res,error_next)=>{ 
//     get_state_http_wrapper(time_slots_state_view, error_next, (time_slots) => { res.render("time-slots", { time_slots });});
// });

// function time_slots_state_view(history) {
//     return history.reduce((acc, event) => {
//         if (event.meta.type === "time_slot_added") acc.push({ ...event.data, meta: undefined, data: undefined });
//         return acc;
//     }, []); } // time_slots_state_view

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

if (!run_tests) bootstrap(slices);

function assert(condition, message) { if (!condition) throw new Error(message); }
function tests() {
    let summary = "";
    console.log("🧪 Tests are running...");
    // add slices to slice_tests at the beginning of the array
    //slice_tests.unshift(...slices);
    slices.forEach(slice => {
        const slice_name = slice.name !== undefined ? slice.name : slice.test_function.name.replaceAll("_", " ");
        if (slice.test_timelines === undefined) return;
        summary += `🍰 Testing slice: ${slice_name}\n`;
        slice.test_timelines.forEach(timeline => {
            summary += ` ⏱️  Testing timeline: ${timeline.timeline_name}\n`;
            timeline.checkpoints.reduce((acc, checkpoint) => {
                summary += checkpoint.progress_marker ? `  🦉 ${checkpoint.progress_marker}\n` : '';
                if (checkpoint.purpose !== undefined) {
                    try {
                        const state = acc.events.reduce((event_handlers_acc, event) => {
                            if (slice.event_handlers[event.name] === undefined) return event_handlers_acc;
                            return slice.event_handlers[event.name](event_handlers_acc, event);
                        }, deepClone(slice.initial_state));
                        let result = slice.refinement_function(state, checkpoint.parameter, slice.exceptions);
                        const expected = checkpoint.exception !==undefined ? { name: checkpoint.exception } : (checkpoint.query !== undefined ? { query: checkpoint.query} : checkpoint.event);
                        result = { ...result, type: undefined, summary: undefined }; 
                        
                        assert(JSON.stringify(result) === JSON.stringify(expected), "Should be equal to " + JSON.stringify(expected) + " but was: " + JSON.stringify(result));
                        checkpoint.test_pass = true; console.log("test passed");
                        summary += `  ✅ Test passed: ${checkpoint.purpose} \n`;
                        
                    } catch (error) {
                        checkpoint.test_pass = false; console.log("test failed");
                        checkpoint.error_message = error.message;
                        summary += `  ❌ Test failed: ${checkpoint.purpose} due to: ${error.message}\n`;
                        console.log("💥 Test failed in Slice '" + slice_name + "' with test '" + (checkpoint.test !== undefined ? checkpoint.test.name : "auto-runner") + "'");
                        console.error(error);
                    }
                }
                if (checkpoint.event) acc.events.push(checkpoint.event);
                return acc;
            }, { events: []});
        });
    });
    console.log(JSON.stringify(slices, null, 2));
    console.log("🧪 Tests are finished");
    console.log("📊 Tests summary:");
    console.log(summary);
    const result_counts = slices.reduce((slice_acc, slice) => {
        if (slice.test_timelines === undefined) return slice_acc;
        const timeline_counts = slice.test_timelines.reduce((timeline_acc, timeline) => {
            const checkpoint_counts = timeline.checkpoints.reduce((checkpoint_acc, checkpoint) => {
                if (checkpoint.test_pass === undefined) return checkpoint_acc;
                if (checkpoint.test_pass) checkpoint_acc.passed++;
                else checkpoint_acc.failed++;
                return checkpoint_acc;
            }, { passed: 0, failed: 0 });
            return { passed: timeline_acc.passed + checkpoint_counts.passed, failed: timeline_acc.failed + checkpoint_counts.failed };
        }, { passed: 0, failed: 0 });
        return { passed: slice_acc.passed + timeline_counts.passed, failed: slice_acc.failed + timeline_counts.failed };
    }, { passed: 0, failed: 0 });
    const failed = result_counts.failed;
    const passed = result_counts.passed;
    console.log("\x1b[" + (failed > 0 ? "91" : "92") + "m 🧪 Tests summary: Failed: " + failed + " Passed: " + passed + " \x1b[0m");
    process.exit(0);
}

if (run_tests) tests();

app.listen(port, () => { 
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
