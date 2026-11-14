using System.Text.Json.Serialization;

namespace Copernica.Rendering;

/// <summary>
/// The leading YAML block of a page file (010 data-model.md "FrontMatterBlock"): character ranges
/// of the whole block (delimiters included) and of its YAML body.
/// </summary>
public sealed record FrontMatterBlock(int Start, int End, int BodyStart, int BodyEnd, string Body);

/// <summary>Interpreted front matter of a page (010 contracts/api.md <c>FrontMatter</c>).</summary>
public sealed record FrontMatter(
    bool Readable,
    string? Raw,
    string? Title,
    string? Description,
    IReadOnlyList<string> Tags,
    string? Status,
    IReadOnlyList<string> Owners,
    IReadOnlyList<string> Authors,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<FrontMatterProperty> Properties)
{
    /// <summary>A block that could not be read (syntax error, limits, duplicate keys); only its text is kept.</summary>
    public static FrontMatter Unreadable(string raw) => new(false, raw, null, null, [], null, [], [], [], []);

    /// <summary>
    /// Finds the front matter block (010 FR-001): the first line is exactly <c>---</c> (after an
    /// optional byte-order mark, trailing spaces allowed) and the block ends at the next line that
    /// is exactly <c>---</c> or <c>...</c>. Returns null when there is no such block.
    /// </summary>
    public static FrontMatterBlock? Locate(string text)
    {
        var start = text.StartsWith('﻿') ? 1 : 0;
        var (line, next) = ReadLine(text, start);
        if (line.TrimEnd(' ', '\t') != "---")
        {
            return null;
        }

        var bodyStart = next;
        var position = next;
        while (position < text.Length)
        {
            (line, next) = ReadLine(text, position);
            var trimmed = line.TrimEnd(' ', '\t');
            if (trimmed is "---" or "...")
            {
                return new FrontMatterBlock(start, next, bodyStart, position, text[bodyStart..position]);
            }

            position = next;
        }

        return null;
    }

    /// <summary>The line at <paramref name="start"/> without its line ending, and where the next line starts.</summary>
    private static (string Line, int Next) ReadLine(string text, int start)
    {
        var newline = text.IndexOf('\n', start);
        var end = newline < 0 ? text.Length : newline;
        var next = newline < 0 ? text.Length : newline + 1;
        var contentEnd = end > start && text[end - 1] == '\r' ? end - 1 : end;
        return (text[start..contentEnd], next);
    }
}

public sealed record FrontMatterProperty(string Name, FrontMatterValue Value);

/// <summary>A property value: text as written, a list, or a nested map.</summary>
[JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]
[JsonDerivedType(typeof(FrontMatterText), "text")]
[JsonDerivedType(typeof(FrontMatterList), "list")]
[JsonDerivedType(typeof(FrontMatterMap), "map")]
public abstract record FrontMatterValue;

/// <summary>
/// Text as written. <see cref="Href"/> is set when the whole value is an http, https or mailto
/// address, the schemes the content sanitizer allows, so the page can show it as a link.
/// </summary>
public sealed record FrontMatterText(string Text) : FrontMatterValue
{
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Href { get; } = LinkTarget(Text);

    private static string? LinkTarget(string text)
    {
        var value = text.Trim();
        return value.Length > 0
            && !value.Any(char.IsWhiteSpace)
            && Uri.TryCreate(value, UriKind.Absolute, out var uri)
            && uri.Scheme is "http" or "https" or "mailto"
            ? uri.AbsoluteUri
            : null;
    }
}

public sealed record FrontMatterList(IReadOnlyList<FrontMatterValue> Items) : FrontMatterValue;

public sealed record FrontMatterMap(IReadOnlyList<FrontMatterProperty> Entries) : FrontMatterValue;
