namespace Copernica.Spaces;

/// <summary>Page title: the first level-1 heading, otherwise the file name (data-model.md "Page").</summary>
public static class PageTitle
{
    public static string Resolve(string content, string path)
    {
        return FirstHeading(content)?.Text ?? FromFileName(path);
    }

    public static string FromFileName(string path)
    {
        var name = Path.GetFileNameWithoutExtension(path.Replace('\\', '/').Split('/')[^1]);
        return name.Replace('-', ' ').Replace('_', ' ').Trim();
    }

    /// <summary>
    /// The content with the text of its first level-1 heading replaced (005 research R13), or null
    /// when the page has no such heading. The heading's indentation and line ending are kept.
    /// </summary>
    public static string? ReplaceFirstHeading(string content, string title)
    {
        if (FirstHeading(content) is not { } heading)
        {
            return null;
        }

        return content[..heading.LineStart] + new string(' ', heading.Indent) + "# " + title.Trim() + content[heading.LineEnd..];
    }

    private sealed record Heading(string Text, int LineStart, int LineEnd, int Indent);

    private static Heading? FirstHeading(string content)
    {
        var inFence = false;
        string? fence = null;
        var first = true;
        var inFrontMatter = false;
        var position = 0;

        while (position < content.Length)
        {
            var lineStart = position;
            var newline = content.IndexOf('\n', position);
            var lineEnd = newline < 0 ? content.Length : newline;
            position = newline < 0 ? content.Length : newline + 1;
            var contentEnd = lineEnd > lineStart && content[lineEnd - 1] == '\r' ? lineEnd - 1 : lineEnd;
            var line = content[lineStart..contentEnd].TrimEnd();

            if (first)
            {
                first = false;
                if (line == "---")
                {
                    inFrontMatter = true;
                    continue;
                }
            }

            if (inFrontMatter)
            {
                if (line is "---" or "...")
                {
                    inFrontMatter = false;
                }

                continue;
            }

            var trimmed = line.TrimStart();
            if (trimmed.StartsWith("```", StringComparison.Ordinal) || trimmed.StartsWith("~~~", StringComparison.Ordinal))
            {
                var marker = trimmed[..3];
                if (!inFence)
                {
                    inFence = true;
                    fence = marker;
                }
                else if (marker == fence)
                {
                    inFence = false;
                }

                continue;
            }

            var indent = line.Length - trimmed.Length;
            if (inFence || indent > 3)
            {
                continue;
            }

            if (trimmed.StartsWith("# ", StringComparison.Ordinal) || trimmed == "#")
            {
                var text = trimmed[1..].Trim().TrimEnd('#').Trim();
                if (text.Length > 0)
                {
                    return new Heading(text, lineStart, contentEnd, indent);
                }
            }
        }

        return null;
    }
}
