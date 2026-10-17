namespace Copernica.Spaces;

/// <summary>Page title: the first level-1 heading, otherwise the file name (data-model.md "Page").</summary>
public static class PageTitle
{
    public static string Resolve(string content, string path)
    {
        return FirstHeading(content) ?? FromFileName(path);
    }

    public static string FromFileName(string path)
    {
        var name = Path.GetFileNameWithoutExtension(path.Replace('\\', '/').Split('/')[^1]);
        return name.Replace('-', ' ').Replace('_', ' ').Trim();
    }

    private static string? FirstHeading(string content)
    {
        using var reader = new StringReader(content);
        var inFence = false;
        string? fence = null;
        var first = true;
        var inFrontMatter = false;

        while (reader.ReadLine() is { } raw)
        {
            var line = raw.TrimEnd();

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

            if (inFence || line.Length - trimmed.Length > 3)
            {
                continue;
            }

            if (trimmed.StartsWith("# ", StringComparison.Ordinal) || trimmed == "#")
            {
                var text = trimmed[1..].Trim().TrimEnd('#').Trim();
                if (text.Length > 0)
                {
                    return text;
                }
            }
        }

        return null;
    }
}
