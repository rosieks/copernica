using System.Text.RegularExpressions;

namespace Copernica.Rendering;

/// <summary>
/// Metadata read from the text of a Mermaid diagram block (004 contracts/rendering.md):
/// readable type, accessible name and description, size limit and click links. The text
/// itself is never interpreted beyond these patterns; drawing happens in the browser.
/// </summary>
public sealed partial record DiagramBlock(
    string Type,
    string Name,
    string? Description,
    bool TooLarge,
    IReadOnlyList<DiagramClick> Clicks)
{
    public const int MaxSourceLength = 20_000;
    public const int MaxNameLength = 200;
    public const int MaxDescriptionLength = 1_000;

    private static readonly Dictionary<string, string> Types = new(StringComparer.OrdinalIgnoreCase)
    {
        ["flowchart"] = "Flowchart",
        ["graph"] = "Flowchart",
        ["sequenceDiagram"] = "Sequence",
        ["classDiagram"] = "Class",
        ["stateDiagram"] = "State",
        ["erDiagram"] = "Entity relationship",
        ["gantt"] = "Gantt",
        ["pie"] = "Pie chart",
        ["gitGraph"] = "Git graph",
        ["journey"] = "User journey",
        ["mindmap"] = "Mind map",
        ["timeline"] = "Timeline",
        ["quadrantChart"] = "Quadrant chart",
        ["xychart"] = "XY chart",
    };

    public static DiagramBlock Parse(string source)
    {
        var lines = source.Replace("\r\n", "\n").Split('\n');
        var index = 0;
        string? frontMatterTitle = null;

        // Optional YAML front matter: --- … --- (Mermaid reads `title:` from it).
        if (lines.Length > 0 && lines[0].Trim() == "---")
        {
            for (index = 1; index < lines.Length && lines[index].Trim() != "---"; index++)
            {
                var title = FrontMatterTitle().Match(lines[index]);
                if (title.Success)
                {
                    frontMatterTitle = title.Groups[1].Value.Trim().Trim('"', '\'');
                }
            }

            index++;
        }

        var header = lines.Skip(index).Select(l => l.Trim()).FirstOrDefault(l => l.Length > 0 && !l.StartsWith("%%", StringComparison.Ordinal)) ?? "";
        var keyword = header.Split([' ', '\t'], 2)[0];
        var dash = keyword.IndexOf('-');
        var baseKeyword = dash > 0 ? keyword[..dash] : keyword;
        var type = Types.GetValueOrDefault(baseKeyword, "Mermaid");

        var name = Clean(AccTitle().Match(source) is { Success: true } acc ? acc.Groups[1].Value : null)
            ?? Clean(TitleLine().Match(source) is { Success: true } t ? t.Groups[1].Value : null)
            ?? Clean(PieTitle().Match(header) is { Success: true } p ? p.Groups[1].Value : null)
            ?? Clean(frontMatterTitle)
            ?? $"{type} diagram";

        var descriptionMatch = AccDescrBlock().Match(source);
        if (!descriptionMatch.Success)
        {
            descriptionMatch = AccDescrLine().Match(source);
        }

        var description = descriptionMatch.Success ? Clean(descriptionMatch.Groups[1].Value) : null;

        var clicks = ClickLink().Matches(source)
            .Select(m => new DiagramClick(m.Groups["url"].Value, m.Groups["tip"].Success ? m.Groups["tip"].Value : m.Groups["id"].Value))
            .ToList();

        return new DiagramBlock(
            type,
            Truncate(name, MaxNameLength),
            description is null ? null : Truncate(description, MaxDescriptionLength),
            source.Length > MaxSourceLength,
            clicks);
    }

    /// <summary>Collapses whitespace; null for empty text.</summary>
    private static string? Clean(string? text)
    {
        if (text is null)
        {
            return null;
        }

        var cleaned = Whitespace().Replace(text, " ").Trim();
        return cleaned.Length == 0 ? null : cleaned;
    }

    private static string Truncate(string text, int max) => text.Length <= max ? text : text[..max];

    [GeneratedRegex(@"^\s*title\s*:\s*(.+)$")]
    private static partial Regex FrontMatterTitle();

    [GeneratedRegex(@"^\s*accTitle\s*:\s*(.+)$", RegexOptions.Multiline)]
    private static partial Regex AccTitle();

    [GeneratedRegex(@"^\s*title\s+(.+)$", RegexOptions.Multiline)]
    private static partial Regex TitleLine();

    [GeneratedRegex(@"^pie\b.*?\btitle\s+(.+)$")]
    private static partial Regex PieTitle();

    [GeneratedRegex(@"^\s*accDescr\s*:\s*(.+)$", RegexOptions.Multiline)]
    private static partial Regex AccDescrLine();

    [GeneratedRegex(@"^\s*accDescr\s*\{([^}]*)\}", RegexOptions.Multiline)]
    private static partial Regex AccDescrBlock();

    // click <id> "<url>" ["tooltip"] and click <id> href "<url>" ["tooltip"]; `call` and callback forms do not match.
    [GeneratedRegex("""^\s*click\s+(?<id>\S+)\s+(?:href\s+)?"(?<url>[^"]*)"(?:\s+"(?<tip>[^"]*)")?""", RegexOptions.Multiline)]
    private static partial Regex ClickLink();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}

/// <summary>A <c>click</c> link of a diagram node: the raw target and its label.</summary>
public sealed record DiagramClick(string Url, string Label);
