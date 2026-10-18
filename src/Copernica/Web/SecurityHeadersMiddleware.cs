namespace Copernica.Web;

/// <summary>Strict CSP and related headers on every response (Constitution, Security section).</summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    // style-src-attr allows inline style *attributes* only (the code editor and positioned
    // popovers use them); <style> elements stay blocked unless they carry the per-request
    // nonce of the SPA shell (see SpaHosting), and user content is stripped of style attributes.
    public static readonly string ContentSecurityPolicy = BuildPolicy(null);

    /// <summary>
    /// Policy of the isolated diagram renderer page (004 contracts/renderer.md, constitution v1.3.0):
    /// runs only in a sandboxed opaque-origin frame; inline styles for Mermaid, no network, no eval.
    /// </summary>
    public const string RendererPolicy =
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'none'; " +
        "connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";

    public const string RendererPath = "/diagram-renderer.html";

    /// <summary>The policy; <paramref name="styleNonce"/> additionally allows nonce-tagged &lt;style&gt; elements.</summary>
    public static string BuildPolicy(string? styleNonce) =>
        "default-src 'self'; script-src 'self'; " +
        (styleNonce is null ? "style-src 'self'; " : $"style-src 'self' 'nonce-{styleNonce}'; ") +
        "style-src-attr 'unsafe-inline'; img-src 'self' data:; " +
        "object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            if (!headers.ContainsKey("Content-Security-Policy"))
            {
                headers.ContentSecurityPolicy = ContentSecurityPolicy;
            }

            headers.XContentTypeOptions = "nosniff";
            headers["Referrer-Policy"] = "no-referrer";
            // Only the diagram renderer may be framed, and only by the wiki itself.
            headers.XFrameOptions = context.Request.Path.Equals(RendererPath, StringComparison.OrdinalIgnoreCase) ? "SAMEORIGIN" : "DENY";
            return Task.CompletedTask;
        });

        return next(context);
    }
}
