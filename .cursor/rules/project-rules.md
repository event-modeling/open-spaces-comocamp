# Open Spaces Comocamp - Project Rules

## Project Overview
This is an event-sourced Node.js application for managing open spaces conferences. The draw io diagram contains the event model that matches the slices.

## Slice Architecture

### Slice Components (Required)
- `name`: string (required)
- `navigation`: navigation_node (required)
- `initial_state`: any (required)
- `event_handlers`: object (required)
- `refinement_function`: function (required)

### initial state rules

- **Type**: any (required)
- **Purpose**: Defines the starting state for the slice before any events have been applied. May be an empty string, empty array or an object with a message parameter that may be displayed when no events exist yet but it is used in a state view.

### Slice Components (Optional)
- `exceptions`: array of exceptions (optional)
- `test_timelines`: array of timeline_node (optional)
- `processor`: processor_node (optional)

**Purpose**: Slices are the core architectural units that encapsulate business logic, handle HTTP routing, define how one step in a workflow changes state or provides a certain view of state.

## Exceptions Rules
- the array is made of key-value pairs like { "name_of_exception", "exception message to display" }
- these are used in the refinement function if needed

## Name Node Rules
- the name of the slice is unique and can be referenced by other slices if they have a processor. This will act as a todo list. those referenced slices will need to be output slices.

## Navigation Node Rules

### Properties
- `direction`: "input" | "output" (required)
- `path`: string (required)
- `web_data`: function (optional)
- `access_checks`: array of functions (optional)

### Direction-Specific Rules
- **Input direction**: `next_path` is required, `view` is not allowed
- **Output direction**: `view` is required, `next_path` is not allowed

**Purpose**: Navigation nodes define HTTP routing configuration, determining whether a slice handles user input (POST requests) or displays output (GET requests), and specifying the URL paths, access controls, and data extraction from HTTP requests.

## Processor Node Rules

### Properties
- `execution`: "immediate" | "timed" (required)
- `todo_list_slice`: name (required)
- `triggering_events`: array of events (required)
- `processor_filter`: function (required)
- `processor_action`: function (required)

**Purpose**: Processor nodes enable background processing by automatically responding to specific events, filtering todo items from a designated slice, and executing actions like generating conference IDs or other automated tasks.

## Timeline Node Rules

### Properties
- `timeline_name`: string (required)
- `checkpoints`: array of checkpoint_node (required)

**Purpose**: Timeline nodes define test scenarios that validate slice behavior by replaying sequences of events and verifying expected outcomes, enabling comprehensive testing of business logic flows.

## Checkpoint Node Rules

### Properties
- **`event`**: event_object (optional) - Specifies an event to be applied to the timeline state
- **`check`**: string (optional) - Description of what is being tested
- **`parameter`**: parameter_object (optional) - Input parameters to test the slice's refinement function
- **`query`**: query_object (optional) - Expected query result for output slices
- **`exception`**: string (optional) - Expected exception name to be thrown when testing for an expected exceptios for an input slice
- **`progress_marker`**: string (optional) - Human-readable description of the current point in the timeline

### Structure Rules
- **For Input Slices**: Can contain either:
  - `{ event: event_object }` - to add an event to the timeline
  - `{ check: "description", parameter: parameter_object, event: event_object }` - to test with parameters and verify expected output event
  - `{ check: "description", parameter: parameter_object, exception: exception_key }` - to test with parameters and verify expected output exception
  - `{ progress_marker: "description" }` - to mark progress points
- **For Output Slices**: Can contain either:
  - `{ check: "description", query: query_object }` - to verify the slice produces expected query results
  - `{ event: event_object }` - to add events that affect the slice's state
  - `{ progress_marker: "description" }` - to mark progress points

### Validation Rules
- Either `event` OR (`check` with `parameter`/`query`/`exception`) must be present
- If `check` is present, either `parameter`, `query`, or `exception` must be present
- `progress_marker` can be used independently or alongside other properties
- `query` is used for output slices to verify state views
- `parameter` is used for input slices to test refinement functions
- `exception` is used to verify error handling

### Examples

#### Input Slice Checkpoints
```javascript
// Add an event to the timeline
{ event: { name: "user_registered", data: { name: "John Doe" } } }

// Test with parameters and verify output
{ 
  check: "should create user when valid name provided",
  parameter: { name: "Jane Smith" },
  event: { name: "user_registered", data: { name: "Jane Smith" } }
}

// Test exception handling
{ 
  check: "should reject duplicate user names",
  parameter: { name: "John Doe" },
  exception: "user_already_exists"
}

// Mark progress point
{ progress_marker: "user registration completed" }
```

#### Output Slice Checkpoints
```javascript

// Mark progress point
{ progress_marker: "starting with empty user list" }

// Verify state view produces expected query result
{ 
  check: "should return empty user list initially",
  query: { users: [] }
}

// Add events that affect the slice's state
{ event: { name: "user_registered", data: { name: "Alice" } } }

// Verify state view after events have been applied
{ 
  check: "should return populated user list after registration",
  query: { users: ["Alice"] }
}

// Mark progress point
{ progress_marker: "first user successfully registered" }
```

#### Complete Timeline Example
```javascript
{
  timeline_name: "User Registration Flow",
  checkpoints: [
    { check: "should start with empty user list", query: { users: [] } },
    { event: { name: "user_registered", data: { name: "Bob" } } },
    { check: "should show one user after registration", query: { users: ["Bob"] } },
    { progress_marker: "first user successfully added" },
    { 
      check: "should reject duplicate registration",
      parameter: { name: "Bob" },
      exception: "user_already_exists"
    }
  ]
}
```

**Purpose**: Checkpoint nodes represent individual test steps that either specify events on the timeline or verify that the slice produces expected results (events, state views, or exceptions) when given specific parameters. They enable comprehensive testing of business logic flows by replaying sequences of events and validating outcomes.




