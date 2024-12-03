let run_tests = false;
let port = 3002;
let test_collection = [];
let urls = [];
let eventstore = "./event-stream";
// create the eventstore if it doesn't exist
if (process.argv.some(arg => arg.startsWith('--') && arg !== '--tests')) { // bad parameters
    console.error('Error: Unrecognized parameter(s)');
    process.exit(1);
} else if (process.argv.includes('--tests')) { // run the tests
    run_tests = true;
}// run the server
const express = require("express");
const app = express();
const fs = require("fs");
app.set("view engine", "mustache");
app.engine("mustache", require("mustache-express")());
app.use(express.static('public'));
if (!fs.existsSync(eventstore)) fs.mkdirSync(eventstore);

function get_events() { return fs.readdirSync(eventstore).map(file => { return JSON.parse(fs.readFileSync(`${eventstore}/${file}`, "utf8")); }); }

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

const todo_gen_conf_ids_url = "/todo-gen-conf-ids"; urls.push(todo_gen_conf_ids_url);
app.get(todo_gen_conf_ids_url, (req, res) => {
    res.render("todo-gen-conf-ids", { conf_ids: [] });
});

if (run_tests) tests();
else app.listen(port, () => { 
    console.log("Server is running on port " + port + " click on http://localhost:" + port + "/");
    urls.forEach(url => {
        console.log("  http://localhost:" + port + url);
    });
});     