let port = 3002;
let slice_tests = [];
const eventstore = "./event-stream";
const event_seq_padding = '0000';

let run_tests = process.argv.includes('--test');
let long_ids = process.argv.includes('--long-ids');

const { v4: uuidv4 } = require('uuid'); function generate_id() { return long_ids ? uuidv4() : uuidv4().slice(0, 8); }
function deepClone(obj) { if (obj === undefined) return undefined; if (obj === null) return null;
    if (Array.isArray(obj)) return obj.map(deepClone);
    if (typeof obj === 'object') { return Object.fromEntries( Object.entries(obj).map(([key, value]) => [key, deepClone(value)]) ); }
    return obj; }
function get_request(req) { return { method: req.method, url: req.url, headers: req.headers, body: req.body, ip: req.ip }; }

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
function get_events(on_each_event, error_callback) { 
    if (!on_each_event) throw new Error("on_each_event is required");
    try {
        console.log("1.0 getting events");
        if (!fs.existsSync(eventstore)) fs.mkdirSync(eventstore);
        let event_count = 0;
        fs.readdirSync(eventstore).forEach(file => { 
            if (!file.endsWith('-event.json')) return;
            let event = undefined;
            try {
                event = JSON.parse(fs.readFileSync(`${eventstore}/${file}`, "utf8"));
                if (!event.meta) event.meta = {}; event.meta.sequence = parseInt(file.substring(0, 4));
                if (on_each_event) on_each_event(event);
            } catch (error) {
                if (error_callback) error_callback(error);
                return;
            }
        }); 
    } catch (error) {
        if (error_callback) error_callback(error);
        return 0;
    }
}
function push_event(event) {
    let event_type = event.name;
    let summary = event.summary ? event.summary : "";
    event = strip_summary(event);
    if (!fs.existsSync(eventstore)) fs.mkdirSync(eventstore);
    const event_count = fs.readdirSync(eventstore).filter(file => file.endsWith('-event.json')).length;
    const event_seq = event_seq_padding.slice(0, event_seq_padding.length - event_count.toString().length) + event_count;   
    fs.writeFileSync(`${eventstore}/${event_seq}-${event_type}-${summary}-event.json`, JSON.stringify(event));
    notify_processors(event); }
function calculate_state(get_events_function, initial_state, event_handlers) { 
    console.log("1.0 calculate_state called with get_events_function: ", get_events_function, "initial_state: ", initial_state, "event_handlers: ", event_handlers);
    if (get_events_function === undefined) throw new Error("get_events_function is required");
    if (event_handlers === undefined) throw new Error("event_handlers is required");
    let state = deepClone(initial_state);
    get_events_function( (event) => {
        if (event_handlers[event.name]) { state = event_handlers[event.name](state, event); } }, (error) => { console.error("Error getting events: " + error.message); });
    return state;}

function notify_processors(event = null) {
    console.log("notifying processors with event: ", JSON.stringify(event, null, 2));
    console.log("processors: ", JSON.stringify(processors, null, 2));
    try {
    if (event === null) { console.log("no event, so notifying all processors"); processors.forEach(processor => processor.do_each_item()); return;}
    console.log("notifying processors that care about this event");
    processors.forEach(processor => { 
        console.log("inspecting processor: ", JSON.stringify(processor, null, 2));
        if (processor.triggering_events === undefined) { console.log("processor has no triggering events, so not notifying"); return; }
        if (processor.triggering_events.includes(event.name)) processor.do_each_item(); });
    } catch (error) { console.error("Error notifying processors: " + error.message); } }
const processors = [];

function get_access_token_http_wrapper(request, error_next, success_action) {
    throw new Error("get_access_token_http_wrapper is deprecated");
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
        if (slice.test_timelines !== undefined) delete slice.test_timelines; // not needed to run the app
        if (slice.refinement_function === undefined) {
           
            console.log("bootstrapping view only slice: ", slice.name);
            app.get(slice.navigation.path + "", (req, res, error_next) => { 
                console.log("rendering view only slice: ", slice.navigation.view + "", "with data: ", JSON.stringify(slice.navigation.web_data(req), null, 2));
                if (slice.navigation.access_checks !== undefined) {
                    // fail here because access checks only protect dynamic data. 
                    // this requires a refinement function to be defined. 
                    const new_error = new Error("Access checks only protect dynamic data. This slice requires a refinement function to be defined.");
                    new_error.status = 500;
                    return error_next(new_error);
                }
                res.render(slice.navigation.view + "", {}); });
            return;
        }
        const app_method = slice.navigation.direction === "input" ? app_post : app_get;
        app_method(slice.navigation.path, (req, res, error_next) => {
            console.log("EXECUTING SLICE: ", slice.name, slice.navigation.direction);
            if (slice.navigation.access_checks !== undefined) {
                console.log("ACCESS CHECKS: Running", slice.navigation.access_checks.length, "access check(s) for slice:", slice.name);
                console.log("ACCESS CHECKS: Request details:", JSON.stringify(get_request(req), null, 2));
                const failed_checks = [];
                slice.navigation.access_checks.forEach((check, index) => {
                    const check_result = check(get_events, req);
                    console.log("ACCESS CHECKS: Check", index + 1, "of", slice.navigation.access_checks.length, "- Result:", check_result);
                    if (!check_result) {
                        failed_checks.push(index + 1);
                    }
                });
                if (failed_checks.length > 0) {
                    console.log("ACCESS CHECKS: FAILED - Check(s)", failed_checks.join(", "), "failed. Denying access. Returning 403");
                    const new_error = new Error("Access denied");
                    new_error.status = 403;
                    return error_next(new_error);
                }
                console.log("ACCESS CHECKS: PASSED - All", slice.navigation.access_checks.length, "check(s) passed. Continuing");
            }
            let state_function = undefined; 
            try { console.log("2.0 setting up calculating state function");
                state_function = () => calculate_state(get_events, slice.initial_state, slice.event_handlers);
            } catch (error) { console.error("2.1 Error setting up calculating state function: " + error.message);
                const new_error = new Error(error.message); new_error.status = 500; return error_next(new_error); }
            let result = undefined; 
            try { console.log("3.0 calling refinement function");
                result = slice.refinement_function(state_function, () => {if (slice.navigation.web_data === undefined) return undefined;  return slice.navigation.web_data(req);} );
            } catch (error) { console.error("3.1 Error invariant function: " + error.message);
                const new_error = new Error(error.message); new_error.status = 422; return error_next(new_error); }
            console.log("3.2 result: ", JSON.stringify(result, null, 2));
            if (result.type === undefined) {
                const new_error = new Error("No result type!");
                new_error.status = 500;
                return error_next(new_error); }
            switch (result.type) {
                case "event":
                    try { console.log("4.0 storing event from result: ", JSON.stringify(result, null, 2));
                        let event_type = result.name;
                        let summary = result.summary ? result.summary : "";
                        let event = { data: result.data, name: event_type};
                        console.log("4.1 ensuring eventstore exists");
                        if (!fs.existsSync(eventstore)) fs.mkdirSync(eventstore);
                        console.log("4.2 getting event count");
                        const event_count = fs.readdirSync(eventstore).filter(file => file.endsWith('-event.json')).length;
                        console.log("4.3 calculating event sequence");
                        const event_seq = event_seq_padding.slice(0, event_seq_padding.length - event_count.toString().length) + event_count;
                        console.log("4.4 writing event to eventstore"); 
                        fs.writeFileSync(`${eventstore}/${event_seq}-${event_type}-${summary}-event.json`, JSON.stringify(event));
                        console.log("4.5 notifying processors");
                        notify_processors(event); 
                        console.log("4.6 about to redirect to next path");
                        const next_path = typeof slice.navigation.next_path === 'function' 
                            ? slice.navigation.next_path(result) 
                            : slice.navigation.next_path;
                        console.log("4.7 redirecting to next path: ", next_path);
                        res.redirect(next_path);
                    } catch (error) { console.error("4.7 Error persisting event: " + error.message);
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
                    let query_data = typeof result.query === "string" ? { model: result.query } : result.query;
                    
                    // For output slices, merge web_data with query result
                    if (slice.navigation.direction === "output" && slice.navigation.web_data) {
                        const web_data = slice.navigation.web_data(req);
                        query_data = { ...query_data, ...web_data };
                    }
                    
                    console.log("6.1 rendering query data: ", JSON.stringify(query_data, null, 2));
                    res.render(slice.navigation.view, query_data);
                    break;
                default:
                    console.log("7.0 unknown result type: ", JSON.stringify(result, null, 2));
                    const new_error = new Error("Unknown result type: " + result.type);
                    new_error.status = 500;
                    error_next(new_error);
                    break;
            }
        });
        if (slice.processor === undefined) return;
        let processor = slice.processor;
        processor.slice_name = slice.name;
        processor.todo_list_slice = slices.find(slice => slice.name === processor.todo_list_slice);
        processor.todo_list = {
            initial_state: processor.todo_list_slice.initial_state,
            event_handlers: processor.todo_list_slice.event_handlers,
            refinement_function: processor.todo_list_slice.refinement_function,
            };
        function do_each_item(processor) {
            console.log("do_each_item - calling calculate_state");
            calculate_state(get_events, processor.todo_list.initial_state, processor.todo_list.event_handlers)
            .forEach(item => {
                console.log("do_each_item - checking if item should be processed. item: ", JSON.stringify(item, null, 2));
                if (processor.processor_filter(item)) { 
                    console.log("do_each_item - item should be processed. calling state_change_function");

                    // some command handlers may not need to use the state. this may be based on the command parameters. 
                    // so the state determination needs to be a function instaead of a parameter to not bother with the expensive state calculation
                    let state_function = undefined; 
                    try { console.log("2.0 setting up calculating state function");
                        const slice = slices.find(s => s.name === processor.slice_name);
                        state_function = () => calculate_state(get_events, slice.initial_state, slice.event_handlers); 
                    } catch (error) { console.error("2.1 Error setting up calculating state function: " + error.message); return;}

                    let result = undefined; 
                    try { console.log("3.0 calling refinement function");
                        const slice = slices.find(s => s.name === processor.slice_name);
                        result = slice.refinement_function(state_function, () => { if (processor.processor_action === undefined) return undefined;  return processor.processor_action(get_events, item);} );
                    } catch (error) { console.error("3.1 Error invariant function: " + error.message); return; }
                    console.log("3.2 result: ", JSON.stringify(result, null, 2));
                    // act on the type of result
                    switch (result.type) {
                        case "event":
                            try { console.log("4.0 storing event from result: ", JSON.stringify(result, null, 2));
                                let event_type = result.name;
                                let summary = result.summary ? result.summary : "";
                                let event = { data: result.data, name: event_type};
                                console.log("4.1 ensuring eventstore exists");
                                if (!fs.existsSync(eventstore)) fs.mkdirSync(eventstore);
                                console.log("4.2 getting event count");
                                const event_count = fs.readdirSync(eventstore).filter(file => file.endsWith('-event.json')).length;
                                console.log("4.3 calculating event sequence");
                                const event_seq = event_seq_padding.slice(0, event_seq_padding.length - event_count.toString().length) + event_count;
                                console.log("4.4 writing event to eventstore"); 
                                fs.writeFileSync(`${eventstore}/${event_seq}-${event_type}-${summary}-event.json`, JSON.stringify(event));
                                console.log("4.5 notifying processors");
                                notify_processors(event); 
                                console.log("4.6 event stored successfully");
                            } catch (error) { console.error("4.7 Error persisting event: " + error.message); }
                            break;
                        case "exception":
                            console.error("exception: ", JSON.stringify(result, null, 2));
                            break;
                        default:
                            console.error("unknown result type in result: ", JSON.stringify(result, null, 2));
                            break;
                    }
                }
            });
        }
        if (processor.execution === "immediate") {
            // add to processors so they are checked when new events are stored and provide a way to do each item
            processor.do_each_item = () => { do_each_item(processor); };
            processors.push(processor);
        } else {
            // set up a timer according to the frequency
            const timer = setInterval(() => {
                // get the todo list
                processor.todo_list = processor.todo_list_function(get_events);
                // for each item in the todo list, check if it should be processed
                processor.todo_list.forEach(item => { if (processor.processor_filter(item)) { const result = processor.processor_action(item); 
                    if (result && result.type === "event") { push_event(result); } } });
            }, processor.frequency);
            processor.timer = timer;
        }
    });
    // Custom error handler for 404s
    app.use((req, res, next) => {
        // skip favicon.ico requests and Chrome DevTools requests
        if (req.path === "/favicon.ico" || req.path.startsWith("/.well-known/")) return;
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

function participant_registered(get_events_function, request) {
    const registration_id = request.query.registration_id || request.params.registration_id;
    console.log("access check - participant_registered - registration_id from request: ", registration_id);
    const state = calculate_state(get_events_function, { registrations: {} }, {
        "registered": (state, event) => {
            state.registrations[event.data.registration_id] = event.data.name;
            return state;
        }
    });
    console.log("access check - participant_registered - state: ", JSON.stringify(state, null, 2));
    if (registration_id in state.registrations) {
        console.log("access check passed - participant_registered - registration_id found in registrations");
        return true;
    }
    console.log("access check failed - participant_registered - registration_id not found in registrations");
    return false;
} // participant_registered

slices.push({ name: "set_conference_name_default", 
    navigation: { direction: "output", path: "/set-conference-name", view: "set-conference-name" } });

slices.push({ name: "name_the_conference", 
    navigation: { direction: "input", path: "/set-conference-name", next_path: "/set-conference-name-confirmation", 
        web_data: (req) => { return req.body.conferenceName; } },
    initial_state: "",
    event_handlers: { "conference_named": (state = null, event) => { return event.data.name; } },
    exceptions: { "no_change_to_name": "You didn't change the name. No change registered." },
    refinement_function: (state_function, parameter_function) => {
        const state = state_function(); const parameter = parameter_function();
        if (state === parameter) return make_exception_result("no_change_to_name");
        return make_event_result("conference_named", { name: parameter }, parameter);
    },
    test_timelines: [
        {   timeline_name: "Happy Path",
            checkpoints: [
                {   check: "test that the conference name is set to the new name",
                    parameter: "EM Open Spaces", 
                    event: { data: { name: "EM Open Spaces" }, name: "conference_named" } } ] },
        {   timeline_name: "Renames allowed",
            checkpoints: [
                {   event: { data: { name: "EM Open Spaces" }, name: "conference_named" } }, 
                {   check: "name should be changeable",
                    parameter: "Event Modeling Space",
                    event: { data: { name: "Event Modeling Space" }, name: "conference_named" } } ] },
        {   timeline_name: "Renames allowed multiple times",
            checkpoints: [
                {   event: { data: { name: "EM Open Spaces" }, name: "conference_named", } },
                {   event: { data: { name: "Event Modeling Space" }, name: "conference_named", } },
                {   check: "name should be changeable multiple times",
                    parameter: "Event Modeling Open Spaces",
                    event: { data: { name: "Event Modeling Open Spaces" }, name: "conference_named", }, } ] },
        {   timeline_name: "Renames not allowed if new name is the same",
            checkpoints: [
                {   event: { data: { name: "EM Open Spaces" }, name: "conference_named" } },
                {   check: "exception should be thrown if the conference name is not changed",
                    parameter: "EM Open Spaces",
                    exception: "no_change_to_name",
                } ] } ]
});

slices.push( { name: "conference_name_confirmation", 
    navigation: { direction: "output", path: "/set-conference-name-confirmation", view: "set-conference-name-confirmation" },
    initial_state: "",
    event_handlers: { "conference_named": (state, event) => { console.log("conference_named: " + event.data.name); return event.data.name; } },
    refinement_function: (state_function, parameter_function) => { return make_query_result({ name: state_function() }); },
});

slices.push({ name: "set_dates_default", 
    navigation: { direction: "output", path: "/set-dates", view: "set-dates" } });
 
slices.push({ name: "set_dates", 
    navigation: { direction: "input", path: "/set-dates", next_path: "/set-dates-confirmation", 
        web_data: (req) => { return { startDate: req.body.startDate, endDate: req.body.endDate }; } },
    event_handlers: { "dates_set": (state, event) => { return event.data.startDate; } },
    exceptions: { "invalid_range": "Start date must be before end date" } ,
    refinement_function: (state_function, parameter_function) => {
        const parameter = parameter_function();
        const start_date = new Date(parameter.startDate);
        const end_date = new Date(parameter.endDate);
        if (start_date > end_date) return make_exception_result("invalid_range");
        return make_event_result("dates_set", { start_date: parameter.startDate, end_date: parameter.endDate }, parameter.startDate + " to " + parameter.endDate);
    }
});

slices.push({ name: "conference_dates_confirmation", 
    navigation: { direction: "output", path: "/set-dates-confirmation", view: "set-dates-confirmation" },
    event_handlers: { "dates_set": (state, event) => { return event.data; } },
    refinement_function: (state_function, parameter_function) => { return make_query_result(state_function()); },
});

slices.push({ name: "rooms",
    navigation: { direction: "output", path: "/rooms", view: "rooms" },
    initial_state: { rooms: [] },
    event_handlers: { 
        "room_added": (state, event) => { state.rooms.push(event.data.room_name); return state; },
        "room_renamed": (state, event) => {
            const index = state.rooms.indexOf(event.data.old_name);
            if (index !== -1) state.rooms[index] = event.data.new_name;
            return state; },
        "room_deleted": (state, event) => {
            const index = state.rooms.indexOf(event.data.room_name);
            if (index !== -1) state.rooms.splice(index, 1);
            return state; },
    },
    refinement_function: (state_function, parameter_function) => { return make_query_result({ rooms: state_function().rooms  }); },
    test_timelines: [
        { timeline_name: "happy path",
            checkpoints: [
                { check: "no rooms should be returned when no events have occurred",
                    query: { rooms: [] } },
                { event: { data: { room_name: "Auditorium" }, name: "room_added" }},
                { check: "one room should be returned when one room has been added",
                    query: { rooms: ["Auditorium"] } },
                { event: { data: { room_name: "CS100" }, name: "room_added" } },
                { progress_marker: "at this point, the initial room reserves the name" },
                { query: { rooms: ["Auditorium", "CS100"] },
                    check: "two rooms should be returned when two rooms have been added" },
                { event: { data: { room_name: "CS200" }, name: "room_added" } ,},
                { check: "three rooms should be returned when three rooms have been added",
                    query: { rooms: ["Auditorium", "CS100", "CS200"] } },
                { event: { data: { room_name: "CS300" }, name: "room_added" } },
                { check: "four rooms should be returned when three rooms have been added",
                    query: { rooms: ["Auditorium", "CS100", "CS200", "CS300"] } },
                { event: { data: { old_name: "Auditorium", new_name: "Main Hall" }, name: "room_renamed" } ,},
                { check: "renamed room should show new name in correct position",
                    query: { rooms: ["Main Hall", "CS100", "CS200", "CS300"] } },
                { event: { data: { room_name: "CS200" }, name: "room_deleted" } },
                { check: "deleted room should not be in the result",
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
    refinement_function: (state_function, parameter_function) => { 
        const state = state_function();
        const parameter = parameter_function();
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
    refinement_function: (state_function, parameter_function) => { 
        function timeToMinutes(timeStr) { const [hours, minutes] = timeStr.split(':').map(Number); return hours * 60 + minutes; }
        const parameter = parameter_function();
        if (!parameter.startTime || !parameter.endTime || !parameter.name) return make_exception_result("time_slot_required_fields_missing");
        const newStart = timeToMinutes(parameter.startTime);
        const newEnd = timeToMinutes(parameter.endTime);
        if (newStart >= newEnd) return make_exception_result("time_slot_time_order_invalid");

        const hasOverlap = state_function().some(time_slot => {
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
                { check: "first time slot should be added when valid",
                    parameter: { startTime: "09:30", endTime: "10:25", name: "1st Session" },
                    event: { data: { start_time: "09:30", end_time: "10:25", name: "1st Session" }, name: "time_slot_added" } },
                { check: "second time slot should be added when valid",
                    parameter: { startTime: "10:30", endTime: "11:25", name: "2nd Session" },
                    event: { data: { start_time: "10:30", end_time: "11:25", name: "2nd Session" }, name: "time_slot_added" } },
                { check: "overlapping at the end of the time slot should be rejected",
                    parameter: { startTime: "11:00", endTime: "12:00", name: "1st Session" },
                    exception: "time_slot_overlapping" },
                { check: "overlapping at the start of the time slot should be rejected",
                    parameter: { startTime: "10:00", endTime: "11:00", name: "1st Session" },
                    exception: "time_slot_overlapping" },
                { check: "overlapping time slot entirely within an existing time slot should be rejected",
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
    refinement_function: (state_function, parameter_function) => { return make_query_result(state_function()); },
});

slices.push({ name: "generate_conference_id_request_creation",
    navigation: { direction: "output", path: "/generate-conf-id", view: "generate-conf-id" },
});

slices.push({ name: "generate_conference_id_request",
    navigation: { direction: "input", path: "/generate-conf-id", next_path: "/join-conference",
        web_data: (req) => { return { conference_id: req.body.conference_id }; } },
    initial_state: false,
    event_handlers: { 
        "conference_id_requested": (state, event) => { return true; },
        "conference_id_generated": (state, event) => { return false; } },
    exceptions: { "conference_id_already_requested": "A request already exists" },
    refinement_function: (state_function, parameter_function) => { 
        if (state_function()) return make_exception_result("conference_id_already_requested");
        return make_event_result("conference_id_requested", {}); },
    test_timelines: [
        {
            timeline_name: "Happy Path",
            checkpoints: [        
                {
                    check: "request unique ID should be added when requested",
                    parameter: {},
                    event: { data: {},  name: "conference_id_requested" },
                },
                {
                    check: "request unique ID should throw an error when request already exists",
                    parameter: {},
                    exception: "conference_id_already_requested",
                },
                {
                    event: { data: { conference_id: "1111-2222-3333" }, name: "conference_id_generated" }
                },
                {
                    check: "request unique ID event should be added when requested after a conference ID has been generated",
                    parameter: {},
                    event: { data: {}, name: "conference_id_requested" },
                }
            ]
        }
    ]
});

slices.push( { name: "conference_id_generation_todo",
    navigation: { direction: "output", path: "/todo-gen-conf-ids", view: "todo-gen-conf-ids" },
    initial_state: true,
    event_handlers: { 
        "conference_id_requested": (state, event) => { console.log("conference_id_requested handler - returning true"); return [true]; },
        "conference_id_generated": (state, event) => { console.log("conference_id_generated handler - returning false"); return [false]; } },
    refinement_function: (state_function, parameter_function) => { return make_query_result({ requested: state_function()[0] }); },
});

slices.push( { name: "conference_id_generation_processor_action",
    navigation: { direction: "input", path: "/provide-conference-id", next_path: "/todo-gen-conf-ids", web_data: (req) => { return req.body.conference_id; } },
    initial_state: [false],
    processor: { execution: "immediate", todo_list_slice: "conference_id_generation_todo", triggering_events: ["conference_id_requested"],
        processor_filter: (todo_list_item) => { console.log("processor_filter - returning todo_list_item"); return todo_list_item; },
        processor_action: (events_function, todo_list_item) => {
            console.log("processor_action - generating a conference ID");
            return generate_id();
    }},
    event_handlers: { 
        "conference_id_requested": (state, event) => { return [true]; },
        "conference_id_generated": (state, event) => { return [false]; } },
    exceptions: { 
        "conference_id_not_requested": "No request for a conference ID has been made",
        "conference_id_cannot_be_blank": "Conference ID cannot be blank" },
    refinement_function: (state_function, parameter_function) => { 
        console.log("refinement_function for conference_id_generation_processor_action");
        const state = state_function();
        console.log("refinement_function - got state: ", JSON.stringify(state, null, 2));
        const parameter = parameter_function() || "";
        console.log("refinement_function - got parameter: ", JSON.stringify(parameter, null, 2));
        if (parameter === "") return make_exception_result("conference_id_cannot_be_blank");
        if (state[0]) return make_event_result("conference_id_provided", { conference_id: parameter });
        return make_exception_result("conference_id_not_requested"); }
});

slices.push({ name: "join_conference",
    navigation: { direction: "output", path: "/join-conference", view: "join-conference"},
    initial_state: "",
    event_handlers: { "conference_id_provided": (state, event) => { return event.data.conference_id; } },
    refinement_function: (state_function, parameter_function) => { return make_query_result({ conference_id: state_function() }); },
});

slices.push({name: "register",
    navigation: { 
        direction: "output", 
        path: "/register/:conference_id", 
        view: "register",
        web_data: (req) => req.params.conference_id
    },
    initial_state: { conference_id: "", conference_name: "" },
    event_handlers: { 
        "conference_id_provided": (state, event) => { 
            state.conference_id = event.data.conference_id; 
            return state; 
        },
        "conference_named": (state, event) => { 
            state.conference_name = event.data.name; 
            return state; 
        }
    },
    refinement_function: (state_function, parameter_function) => { 
        const state = state_function();
        const param_id = parameter_function();

        // Return not found if either ID is missing or they don't match
        if (!state.conference_id || !param_id || state.conference_id !== param_id) {
            return make_query_result({ not_found: true });
        }

        return make_query_result({ 
            conference_id: param_id,
            conference_name: state.conference_name || "Unnamed Conference",
            not_found: false
        });
    },
    exceptions: { "registration_closed": "Registration is closed." },
})

slices.push({name: "submit_registration",
    navigation: { 
        direction: "input", 
        path: "/register/:conference_id", 
        next_path: (result)=> "/register-success/" + result.data.registration_id,
        web_data: (req) => { 
            console.log("submit_registration - web_data - req.body: ", JSON.stringify(req.body, null, 2));
            console.log("submit_registration - web_data - req.params: ", JSON.stringify(req.params, null, 2));
            return { 
                conference_id: req.params.conference_id, 
                participantName: req.body.participantName,
                registration_id: generate_id()
            }; 
        }
    },
    initial_state: { conference_id: null, names: new Set(), closed: false },
    event_handlers: { 
        "conference_id_provided": (state, event) => { 
            state.conference_id = event.data.conference_id; 
            state.names = new Set();
            state.closed = false;
            return state; 
        },
        "registered": (state, event) => { 
            if (state.conference_id !== null) {
                state.names.add(event.data.name);
            }
            return state; 
        },
        "registration_closed": (state, event) => { 
            state.closed = true;
            return state; 
        }
    },
    exceptions: { 
        "registration_closed": "Registration is closed.",
        "already_registered": "You are already registered.",
        "conference_not_found": "Conference not found."
    },
    refinement_function: (state_function, parameter_function) => {
        const state = state_function();
        const parameter = parameter_function();
        console.log("submit_registration - refinement_function - state: ", JSON.stringify(state, null, 2));
        console.log("submit_registration - refinement_function - parameter: ", JSON.stringify(parameter, null, 2));
        // Check if registration is closed first
        if (state.closed) {
            return make_exception_result("registration_closed");
        }
        
        // Check if conference exists and matches
        if (state.conference_id === null || state.conference_id !== parameter.conference_id) {
            return make_exception_result("conference_not_found");
        }
        
        // Check if participant is already registered
        if (state.names.has(parameter.participantName)) {
            return make_exception_result("already_registered");
        }
        
        return make_event_result("registered", { 
            name: parameter.participantName, 
            registration_id: parameter.registration_id, 
            conference_id: parameter.conference_id 
        }, parameter.participantName + "," + parameter.registration_id);
    },
    test_timelines: [
        {
            timeline_name: "Happy Path",
            checkpoints: [
                {
                    event: { data: { conference_id: "1111-2222-3333" }, name: "conference_id_provided" }
                },
                {
                    check: "Should allow first registration",
                    parameter: { 
                        conference_id: "1111-2222-3333", 
                        participantName: "Adam", 
                        registration_id: "eeee-ffff-00000" 
                    },
                    event: { 
                        data: { 
                            name: "Adam", 
                            registration_id: "eeee-ffff-00000", 
                            conference_id: "1111-2222-3333" 
                        }, 
                        name: "registered" 
                    }
                }
            ]
        },
        {
            timeline_name: "Duplicate Registration",
            checkpoints: [
                {
                    event: { data: { conference_id: "1111-2222-3333" }, name: "conference_id_provided" }
                },
                {
                    event: { 
                        data: { 
                            name: "Adam", 
                            registration_id: "eeee-ffff-00000", 
                            conference_id: "1111-2222-3333" 
                        }, 
                        name: "registered" 
                    }
                },
                {
                    check: "Should reject duplicate registration",
                    parameter: { 
                        conference_id: "1111-2222-3333", 
                        participantName: "Adam", 
                        registration_id: "cccc-dddd-1111" 
                    },
                    exception: "already_registered"
                }
            ]
        },
        {
            timeline_name: "Registration Closed",
            checkpoints: [
                {
                    event: { data: { conference_id: "1111-2222-3333" }, name: "conference_id_provided" }
                },
                {
                    event: { data: {}, name: "registration_closed" }
                },
                {
                    check: "Should reject registration when closed",
                    parameter: { 
                        conference_id: "1111-2222-3333", 
                        participantName: "Adam", 
                        registration_id: "eeee-ffff-00000" 
                    },
                    exception: "registration_closed"
                }
            ]
        },
        {
            timeline_name: "Conference Not Found",
            checkpoints: [
                {
                    check: "Should reject registration when conference doesn't exist",
                    parameter: { 
                        conference_id: "1111-2222-3333", 
                        participantName: "Adam", 
                        registration_id: "eeee-ffff-00000" 
                    },
                    exception: "conference_not_found"
                }
            ]
        }
    ]
});

// function participant_registered(get_events_function, request) {
//     const registration_id = request.params.registration_id;
//     const state = calculate_state(get_events_function, { registrations: {} }, {
//         "registered": (state, event) => {
//             state.registrations[event.data.registration_id] = event.data.name;
//             return state;
//         }
//     });
//     console.log("state: ", JSON.stringify(state, null, 2));
//     return registration_id in state.registrations;
// }; // participant_registered

slices.push({name: "register_success",
    navigation: { direction: "output", path: "/register-success/:registration_id", view: "register-success", web_data: (req) => { return { registration_id: req.params.registration_id }; },
        access_checks: [ participant_registered ]
    },
    initial_state: { registrations: {}, conference_name: "Unnamed Conference" },
    event_handlers: { 
        "conference_named": (state, event) => { 
            state.conference_name = event.data.name; 
            return state; 
        },
        "registered": (state, event) => { 
            state.registrations[event.data.registration_id] = event.data.name; 
            return state; 
        }
    },
    refinement_function: (state_function, parameter_function) => { 
        const state = state_function();
        const registration_id = parameter_function();
        
        return make_query_result({ 
            name: state.registrations[registration_id],
            conference_name: state.conference_name,
            registration_id: registration_id,
            not_found: false
        }); 
    },
})
        
// if (!run_tests) app.get("/register-success/:registration_id", (req, res, error_next) => { 
//     const registration_id = req.params.registration_id;
//     get_state_http_wrapper(registrations_state_view, error_next, (state) => { res.render("register-success", { conference_name: state.conference_name, registration_id: registration_id, name: state.registrations[registration_id] }); });
// }); 

if (!run_tests) app.post("/close-registration", (_, r, error_next) => { 
    change_state_http_wrapper(close_registration_state_change, {}, error_next, () => { r.redirect("/sessions"); });
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
                    check: "Should reject registration when conference doesn't exist"
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
                    check: "Should allow first registration"
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
                    check: "Should reject duplicate registration"
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
                    check: "Should reject registration for old conference"
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
                    check: "Should allow registration for new conference"
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
                    check: "Should reject registration when closed"
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

const error_session_already_submitted = new Error("A session with this topic has already been suggested");

slices.push({name: "topics",
    navigation: { direction: "output", path: "/topics/:registration_id", view: "topics", web_data: (req) => { return { registration_id: req.params.registration_id }; },
        access_checks: [ participant_registered ]
    },
    initial_state: { registrations: {}, topics: [] },
    event_handlers: { 
        "conference_id_generated": (state, event) => { 
            state.registrations = {};
            state.topics = [];
            return state;
        },
        "registered": (state, event) => { 
            state.registrations[event.data.registration_id] = event.data.name; 
            return state;
        },
        "session_submitted": (state, event) => { 
            state.topics.push({ 
                topic: event.data.topic, 
                facilitation: event.data.facilitation, 
                name: state.registrations[event.data.registration_id] 
            });
            return state;
        }
    },
    refinement_function: (state_function, parameter_function) => { 
        const state = state_function();
        return make_query_result({ topics: state.topics }); 
    },
});

slices.push({name: "topic_suggestion",
    navigation: { direction: "output", path: "/topic-suggestion/:registration_id", view: "submit-session", 
        access_checks: [participant_registered],
        web_data: (req) => { return { registration_id: req.params.registration_id }; } },
    initial_state: { registrations: {}, topics: [] },
    event_handlers: { 
        "conference_id_generated": (state, event) => { 
            state.registrations = {};
            state.topics = [];
            return state;
        },
        "registered": (state, event) => { 
            state.registrations[event.data.registration_id] = event.data.name; 
            return state;
        },
        "session_submitted": (state, event) => { 
            state.topics.push({ 
                topic: event.data.topic, 
                facilitation: event.data.facilitation, 
                name: state.registrations[event.data.registration_id],
                registration_id: event.data.registration_id
            });
            return state;
        }
    },
    refinement_function: (state_function, parameter_function) => { 
        const state = state_function();
        const parameter = parameter_function();
        return make_query_result({ 
            name: state.registrations[parameter.registration_id],
            registration_id: parameter.registration_id,
            topics: state.topics
        }); 
    }
});

slices.push({name: "submit_session",
    navigation: { 
        path: "/topic-suggestion/:registration_id", 
        direction: "input", 
        next_path: (result) => "/topics/" + result.data.registration_id,
        access_checks: [participant_registered],
        web_data: (req) => { 
            return { 
                topic: req.body.topic, 
                facilitation: req.body.facilitation, 
                registration_id: req.params.registration_id 
            }; 
        }
    },
    initial_state: { topics: [] },
    event_handlers: { 
        "conference_id_generated": (state, event) => { 
            state.topics = [];
            return state; 
        },
        "session_submitted": (state, event) => { 
            state.topics.push(event.data.topic.toLowerCase());
            return state; 
        }
    },
    exceptions: { 
        "session_already_submitted": "This topic has already been submitted."
    },
    refinement_function: (state_function, parameter_function) => {
        const state = state_function();
        const parameter = parameter_function();
        
        if (state.topics.includes(parameter.topic.toLowerCase())) {
            return make_exception_result("session_already_submitted");
        }
        
        return make_event_result("session_submitted", { 
            topic: parameter.topic, 
            facilitation: parameter.facilitation, 
            registration_id: parameter.registration_id 
        }, parameter.facilitation + "," + parameter.topic + "," + parameter.registration_id);
    }
});

slices.push({ name: "topics_state_view",
    navigation: { direction: "output", path: "/topics/:registration_id", view: "topics", web_data: (req) => { return { registration_id: req.params.registration_id }; } },
    initial_state: { registrations: {}, topics: [] },
    event_handlers: { 
        "conference_id_generated": (state, event) => { 
            state.registrations = {};
            state.topics = [];
            return state;
        },
        "registered": (state, event) => { 
            state.registrations[event.data.registration_id] = event.data.name;
            return state;
        },
        "session_submitted": (state, event) => { 
            try {
                state.topics.push({ 
                    topic: event.data.topic, 
                    facilitation: event.data.facilitation, 
                    name: state.registrations[event.data.registration_id],
                    registration_id: event.data.registration_id
                });
            } catch (error) { 
                console.log("Error adding topic: " + error.message); 
            }
            return state;
        }
    },
    refinement_function: (state_function, parameter_function) => { 
        return make_query_result({ 
            topics: state_function().topics
        }); 
    },
    test_timelines: [
        { timeline_name: "Happy Path",
            checkpoints: [
                { check: "no topics should be returned when no events have occurred",
                    query: { topics: [] } },
                { event: { data: { conference_id: "1111-2222-3333" }, name: "conference_id_generated" }},
                { event: { data: { registration_id: "reg-001", name: "John Doe" }, name: "registered" }},
                { event: { data: { topic: "Event Sourcing", facilitation: "Adam", registration_id: "reg-001" }, name: "session_submitted" }},
                { check: "one topic should be returned when one session has been submitted",
                    query: { topics: [{ topic: "Event Sourcing", facilitation: "Adam", name: "John Doe", registration_id: "reg-001" }] } },
                { event: { data: { registration_id: "reg-002", name: "Jane Smith" }, name: "registered" }},
                { event: { data: { topic: "CQRS", facilitation: "Jane", registration_id: "reg-002" }, name: "session_submitted" }},
                { check: "two topics should be returned when two sessions have been submitted",
                    query: { topics: [
                        { topic: "Event Sourcing", facilitation: "Adam", name: "John Doe", registration_id: "reg-001" },
                        { topic: "CQRS", facilitation: "Jane", name: "Jane Smith", registration_id: "reg-002" }
                    ] } }
            ]
        }
    ]
});

slices.push({ name: "voting",
    navigation: { 
        direction: "output", 
        path: "/voting", 
        view: "voting",
        web_data: (req) => { return { registration_id: req.query.registration_id }; },
        access_checks: [ participant_registered ]
    },
    initial_state: { registrations: {}, topics: [], closed: false },
    event_handlers: { 
        "conference_id_generated": (state, event) => { 
            state.registrations = {};
            state.topics = [];
            state.closed = false;
            return state;
        },
        "registered": (state, event) => { 
            state.registrations[event.data.registration_id] = event.data.name;
            return state;
        },
        "session_submitted": (state, event) => { 
            state.topics.push({ 
                topic: event.data.topic, 
                facilitation: event.data.facilitation, 
                name: state.registrations[event.data.registration_id], 
                votes: [] 
            });
            return state;
        },
        "voted_for_sessions": (state, event) => {
            state.topics.forEach(topic => { 
                topic.votes = topic.votes.filter(vote => vote !== event.data.registration_id); 
            });
            event.data.topics.forEach(topic => { 
                const topicState = state.topics.find(t => t.topic === topic);
                if (topicState) {
                    topicState.votes.push(event.data.registration_id);
                }
            });
            return state;
        },
        "close_voting": (state, event) => { 
            state.closed = true;
            return state;
        }
    },
    refinement_function: (state_function, parameter_function) => { 
        const state = state_function();
        const parameter = parameter_function();
        const registration_id = parameter.registration_id;
        
        const sessions = state.topics.map(topic => ({
            topic: topic.topic,
            facilitation: topic.facilitation,
            name: topic.name,
            vote_count: topic.votes.length,
            voters: topic.votes,
            voted: topic.votes.includes(registration_id)
        }));
        
        return make_query_result({ 
            registration_id: registration_id,
            sessions: sessions
        }); 
    }
});

slices.push({ name: "submit_votes",
    navigation: { 
        direction: "input", 
        path: "/voting", 
        next_path: (result) => "/voting?registration_id=" + result.data.registration_id,
        web_data: (req) => { 
            const selectedTopics = [];
            for (const [key, value] of Object.entries(req.body)) {
                if (key.startsWith("session_")) {
                    selectedTopics.push(key.replace("session_", ""));
                }
            }
            return { 
                topics: selectedTopics,
                registration_id: req.query.registration_id || req.body.registration_id
            }; 
        },
        access_checks: [ participant_registered ]
    },
    initial_state: { topics: [], closed: false },
    event_handlers: { 
        "conference_id_generated": (state, event) => { 
            state.topics = [];
            state.closed = false;
            return state; 
        },
        "session_submitted": (state, event) => { 
            state.topics.push({ topic: event.data.topic }); 
            return state; 
        },
        "close_voting": (state, event) => { 
            state.closed = true;
            return state; 
        }
    },
    exceptions: { 
        "voting_closed": "Voting is closed",
        "topic_not_found": "Topic not found"
    },
    refinement_function: (state_function, parameter_function) => {
        const state = state_function();
        const parameter = parameter_function();
        
        if (state.closed) {
            return make_exception_result("voting_closed");
        }
        
        const allTopicsExist = parameter.topics.reduce((acc, topic) => {
            if (!state.topics.find(t => t.topic === topic)) return false;
            return acc;
        }, true);
        
        if (!allTopicsExist) {
            return make_exception_result("topic_not_found");
        }
        
        return make_event_result("voted_for_sessions", { 
            registration_id: parameter.registration_id, 
            topics: parameter.topics 
        }, parameter.registration_id + "," + parameter.topics.join(","));
    }
});

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
            console.log(`testing timeline: ${timeline.timeline_name}`);
            timeline.checkpoints.reduce((acc, checkpoint) => {
                summary += checkpoint.progress_marker ? `  🦉 ${checkpoint.progress_marker}\n` : '';
                if (checkpoint.check !== undefined) {
                    try {
                        const state_function = () => acc.events.reduce((event_handlers_acc, event) => {
                            if (slice.event_handlers[event.name] === undefined) return event_handlers_acc;
                            return slice.event_handlers[event.name](event_handlers_acc, event);
                        }, deepClone(slice.initial_state));
                        let result = slice.navigation.direction === "input" 
                            ? slice.refinement_function(state_function, () => checkpoint.parameter, slice.exceptions)
                            : slice.refinement_function(state_function, () => checkpoint.parameter);
                        const expected = checkpoint.exception !==undefined ? { name: checkpoint.exception } : (checkpoint.query !== undefined ? { query: checkpoint.query} : checkpoint.event);
                        result = { ...result, type: undefined, summary: undefined }; 
                        console.log("result: ", JSON.stringify(result, null, 2));
                        console.log("expected: ", JSON.stringify(expected, null, 2));
                        assert(JSON.stringify(result) === JSON.stringify(expected), "Should be equal to\n" + JSON.stringify(expected) + "\nbut was:\n" + JSON.stringify(result));
                        checkpoint.test_pass = true; console.log("test passed");
                        summary += `  ✅ Test passed: ${checkpoint.check} \n`;
                        
                    } catch (error) {
                        checkpoint.test_pass = false; console.log("test failed");
                        checkpoint.error_message = error.message;
                        summary += `  ❌ Test failed: ${checkpoint.check} due to: ${error.message}\n`;
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
