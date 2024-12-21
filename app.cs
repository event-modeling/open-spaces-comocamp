using Stubble.Core.Builders;
using Stubble.Core;
using Microsoft.Extensions.FileProviders;
using System.Text.Json;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<IViewRenderer>(new StubbleViewRenderer("views"));
var app = builder.Build();

app.MapGet("/", () => "Hello World!");
app.UseStaticFiles( new StaticFileOptions {
    FileProvider = new PhysicalFileProvider(Path.Combine(Directory.GetCurrentDirectory(), "public")),
    RequestPath = ""
});
app.MapGet("/rooms", async (IViewRenderer viewRenderer) => {
    var viewModel = new { rooms = RoomsStateView(GetEvents()) };
    var html = await viewRenderer.RenderViewToStringAsync("rooms", viewModel);
    return Results.Content(html, "text/html");
});
app.Run("http://localhost:3003"); // Won´t start on 3002 if node uses it

static string[] RoomsStateView(IEnumerable<Event> history) {
    return history.Aggregate(new List<string>(), (acc, evt) => {
        switch (evt) {
            case RoomAddedEvent addedEvent:
                acc.Add(addedEvent.RoomName ?? "");
                break;
            case RoomRenamedEvent renamedEvent:
                var index = acc.IndexOf(renamedEvent.OldName ?? "");
                if (index != -1) acc[index] = renamedEvent.NewName ?? "";
                break;
            case RoomDeletedEvent deletedEvent:
                var deleteIndex = acc.IndexOf(deletedEvent.RoomName ?? "");
                if (deleteIndex != -1) acc.RemoveAt(deleteIndex);
                break;
        }
        return acc;
    }).ToArray();
}

static IEnumerable<Event> GetEvents() {
    var eventstore = "event-stream";
    if(!Path.Exists(eventstore)) return [];
    var files = Directory.GetFiles(eventstore);
    Console.WriteLine($"Found {files.Length} files in event store");

    var orderedFiles = files.OrderBy(f => f);
    Console.WriteLine("Ordered files by name");

    var events = orderedFiles
        .Select<string, Event>(f => {
            var content = File.ReadAllText(f);
            Console.WriteLine($"Read file: {f}");
            Console.WriteLine($"Content: {content}");
            var type = Path.GetFileNameWithoutExtension(f).Split('-')[1];
            Console.WriteLine($"Type: {type}");
            return type switch {
                "room_added_event" => JsonSerializer.Deserialize<RoomAddedEvent>(content)!,
                "room_renamed_event" => JsonSerializer.Deserialize<RoomRenamedEvent>(content)!,
                "room_deleted_event" => JsonSerializer.Deserialize<RoomDeletedEvent>(content)!,
                _ => throw new Exception($"Unknown event type: {type}")
            };
        })
        .Where(e => e != null);
    Console.WriteLine("Finished deserializing events: " + JsonSerializer.Serialize(events));
    return events;
}

public interface IViewRenderer { Task<string> RenderViewToStringAsync(string viewName, object model); }

public class StubbleViewRenderer(string viewsPath) : IViewRenderer {
    private readonly StubbleVisitorRenderer _renderer = new StubbleBuilder().Build();

    public async Task<string> RenderViewToStringAsync(string viewName, object model) {
        var viewPath = Path.Combine(viewsPath, $"{viewName}.mustache");
        var template = await File.ReadAllTextAsync(viewPath);
        return await _renderer.RenderAsync(template, model);
    }
}

public abstract class Event {
    [JsonPropertyName("type")] public string Type { get; set; } = "";
    [JsonPropertyName("timestamp")] public string Timestamp { get; set; } = "";
}

public class RoomAddedEvent : Event {
    [JsonPropertyName("room_name")] public string? RoomName { get; set; }
}

public class RoomRenamedEvent : Event {
    [JsonPropertyName("old_name")] public string? OldName { get; set; }
    [JsonPropertyName("new_name")] public string? NewName { get; set; }
}

public class RoomDeletedEvent : Event{
    [JsonPropertyName("room_name")] public string? RoomName { get; set; }
}
