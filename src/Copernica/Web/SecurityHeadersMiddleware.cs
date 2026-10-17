namespace Copernica.Web;

/// <summary>Strict CSP and related headers on every response (Constitution, Security section).</summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    // style-src-attr allows inline style *attributes* only (the code editor positions elements
    // with them); <style> elements stay blocked and user content is stripped of style attributes.
    public const string ContentSecurityPolicy =
        "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; " +
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
            headers.XFrameOptions = "DENY";
            return Task.CompletedTask;
        });

        return next(context);
    }
}
