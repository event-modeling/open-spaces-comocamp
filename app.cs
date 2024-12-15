// First the using statements
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Stubble.Core.Builders;
using Microsoft.AspNetCore.Http;
using Stubble.Core;
using System.IO;
using Microsoft.Extensions.FileProviders;
// Then the top-level statements
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<IViewRenderer>(new StubbleViewRenderer("views"));
var app = builder.Build();

app.MapGet("/", () => "Hello World!");
app.UseStaticFiles(
	new StaticFileOptions {
		FileProvider = new PhysicalFileProvider(Path.Combine(Directory.GetCurrentDirectory(), "public")),
		RequestPath = ""
	}
);

app.MapGet("/rooms", async (IViewRenderer viewRenderer) => {
    var viewModel = new {
        rooms = new[] {
            "Main Hall",
            "Room 101",
            "Workshop Area"
        }
    };
    
    var html = await viewRenderer.RenderViewToStringAsync("rooms", viewModel);
    return Results.Content(html, "text/html");
});

app.Run();

// Finally, the type declarations
public interface IViewRenderer
{
    Task<string> RenderViewToStringAsync(string viewName, object model);
}

public class StubbleViewRenderer : IViewRenderer
{
    private readonly StubbleVisitorRenderer _renderer;
    private readonly string _viewsPath;

    public StubbleViewRenderer(string viewsPath)
    {
        _renderer = new StubbleBuilder().Build();
        _viewsPath = viewsPath;
    }

    public async Task<string> RenderViewToStringAsync(string viewName, object model)
    {
        var viewPath = Path.Combine(_viewsPath, $"{viewName}.mustache");
        var template = await File.ReadAllTextAsync(viewPath);
        return await _renderer.RenderAsync(template, model);
    }
}

