using AngleSharp.Html.Dom;
using Ganss.Xss;

namespace Copernica.Rendering;

/// <summary>
/// Allow-list sanitizer applied to every piece of rendered user content (Constitution:
/// server-side sanitization). Scripts, event handlers, inline styles, frames and forms are removed.
/// </summary>
public static class HtmlSanitizerFactory
{
    private static readonly string[] AllowedTags =
    [
        "a", "abbr", "b", "blockquote", "br", "code", "dd", "del", "details", "div", "dl", "dt", "em",
        "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "input", "ins", "kbd",
        "li", "mark", "ol", "p", "pre", "q", "s", "samp", "small", "span", "strong", "sub", "summary", "sup",
        "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul", "var",
    ];

    private static readonly string[] AllowedAttributes =
    [
        "href", "src", "alt", "title", "id", "class", "colspan", "rowspan", "align", "start", "type",
        "checked", "disabled", "rel", "open", "width", "height", "data-wiki-page",
    ];

    public static HtmlSanitizer Create()
    {
        var sanitizer = new HtmlSanitizer(new HtmlSanitizerOptions
        {
            AllowedTags = new HashSet<string>(AllowedTags, StringComparer.OrdinalIgnoreCase),
            AllowedAttributes = new HashSet<string>(AllowedAttributes, StringComparer.OrdinalIgnoreCase),
            AllowedSchemes = new HashSet<string>(["http", "https", "mailto"], StringComparer.OrdinalIgnoreCase),
            UriAttributes = new HashSet<string>(["href", "src"], StringComparer.OrdinalIgnoreCase),
            AllowedCssProperties = new HashSet<string>(),
            AllowedAtRules = new HashSet<AngleSharp.Css.Dom.CssRuleType>(),
        });

        sanitizer.AllowDataAttributes = false;
        sanitizer.KeepChildNodes = true;

        // Only disabled checkboxes survive (Markdown task lists).
        sanitizer.PostProcessNode += (_, e) =>
        {
            if (e.Node is IHtmlInputElement input)
            {
                if (!string.Equals(input.Type, "checkbox", StringComparison.OrdinalIgnoreCase))
                {
                    input.Remove();
                    return;
                }

                input.SetAttribute("disabled", "disabled");
            }

            if (e.Node is IHtmlAnchorElement anchor && IsExternal(anchor.GetAttribute("href")))
            {
                anchor.SetAttribute("rel", "noopener noreferrer");
            }
        };

        return sanitizer;
    }

    private static bool IsExternal(string? href) =>
        href is not null && Uri.TryCreate(href, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https";
}
