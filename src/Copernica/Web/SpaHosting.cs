using System.Reflection;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Primitives;

namespace Copernica.Web;

/// <summary>Serves the React build embedded in the executable (Constitution II: bundled assets).</summary>
public static class SpaHosting
{
    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    public static IFileProvider CreateFileProvider() => new EmbeddedWebFileProvider(typeof(SpaHosting).Assembly);

    public static WebApplication UseSpa(this WebApplication app, IFileProvider files)
    {
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = files,
            ContentTypeProvider = ContentTypes,
            OnPrepareResponse = context =>
            {
                // Vite emits content-hashed names under /assets.
                context.Context.Response.Headers.CacheControl = context.Context.Request.Path.StartsWithSegments("/assets")
                    ? "public, max-age=31536000, immutable"
                    : "no-cache";
            },
        });

        // Static files must run before endpoint routing, otherwise the catch-all fallback below
        // matches /assets/* first and the static file middleware skips the request.
        app.UseRouting();

        // "{*path}" instead of the default "{*path:nonfile}": page routes end in ".md".
        app.MapFallback("{*path}", async context =>
        {
            var path = context.Request.Path;
            if (path.StartsWithSegments("/api") || path.StartsWithSegments("/auth") || path.StartsWithSegments("/health") || path.StartsWithSegments("/assets"))
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }

            var index = files.GetFileInfo("index.html");
            if (!index.Exists)
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                await context.Response.WriteAsync("The web UI was not built into this binary.");
                return;
            }

            context.Response.ContentType = "text/html; charset=utf-8";
            context.Response.Headers.CacheControl = "no-cache";
            await using var stream = index.CreateReadStream();
            await stream.CopyToAsync(context.Response.Body);
        }).AllowAnonymous();

        return app;
    }

    /// <summary>Resolves files from manifest resources named <c>wwwroot/&lt;path&gt;</c> (see Copernica.csproj).</summary>
    private sealed class EmbeddedWebFileProvider(Assembly assembly) : IFileProvider
    {
        // RecursiveDir uses a backslash when built on Windows; normalize to '/'.
        private readonly Dictionary<string, string> _names = assembly.GetManifestResourceNames()
            .ToDictionary(n => n.Replace('\\', '/'), StringComparer.Ordinal);
        private readonly DateTimeOffset _lastModified = File.GetLastWriteTimeUtc(AppContext.BaseDirectory);

        public IFileInfo GetFileInfo(string subpath)
        {
            var name = "wwwroot/" + subpath.TrimStart('/');
            return _names.TryGetValue(name, out var resource)
                ? new ResourceFileInfo(assembly, resource, Path.GetFileName(subpath), _lastModified)
                : new NotFoundFileInfo(subpath);
        }

        public IDirectoryContents GetDirectoryContents(string subpath) => NotFoundDirectoryContents.Singleton;

        public IChangeToken Watch(string filter) => NullChangeToken.Singleton;
    }

    private sealed class ResourceFileInfo(Assembly assembly, string resourceName, string name, DateTimeOffset lastModified) : IFileInfo
    {
        public bool Exists => true;

        public long Length
        {
            get
            {
                using var stream = CreateReadStream();
                return stream.Length;
            }
        }

        public string? PhysicalPath => null;

        public string Name => name;

        public DateTimeOffset LastModified => lastModified;

        public bool IsDirectory => false;

        public Stream CreateReadStream() => assembly.GetManifestResourceStream(resourceName)!;
    }
}
