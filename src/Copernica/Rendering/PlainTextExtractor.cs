using AngleSharp.Html.Parser;

namespace Copernica.Rendering;

/// <summary>
/// Plain text of rendered, sanitized page HTML, identical to the browser's
/// <c>textContent</c> of the article element: discussion anchors use offsets into it (research.md R6).
/// </summary>
public static class PlainTextExtractor
{
    private static readonly HtmlParser Parser = new();

    public static string Extract(string sanitizedHtml)
    {
        var document = Parser.ParseDocument($"<!DOCTYPE html><html><head></head><body>{sanitizedHtml}</body></html>");
        return document.Body?.TextContent ?? "";
    }
}
