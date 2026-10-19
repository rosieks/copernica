namespace Copernica.Git;

/// <summary>A moved page (<c>a.md</c>) or folder (<c>guides/</c>, mapping its whole prefix).</summary>
public sealed record MoveRecord(string From, string To, bool Folder)
{
    /// <summary>The new path of <paramref name="path"/> if this move covers it.</summary>
    public string? Map(string path)
    {
        if (!Folder)
        {
            return string.Equals(path, From, StringComparison.Ordinal) ? To : null;
        }

        return path.StartsWith(From + "/", StringComparison.Ordinal) ? To + path[From.Length..] : null;
    }

    /// <summary>The old path of <paramref name="path"/> if this move produced it.</summary>
    public string? Unmap(string path)
    {
        if (!Folder)
        {
            return string.Equals(path, To, StringComparison.Ordinal) ? From : null;
        }

        return path.StartsWith(To + "/", StringComparison.Ordinal) ? From + path[To.Length..] : null;
    }
}

/// <summary>
/// <c>Copernica-Moved: old -&gt; new</c> commit trailers written by wiki moves (005 research R3).
/// Paths are space-relative with each segment percent-encoded, so they contain no spaces and
/// the separator is unambiguous; folders end in <c>/</c>.
/// </summary>
public static class MoveTrailers
{
    public const string Key = "Copernica-Moved";

    private const string Separator = " -> ";

    public static string Format(MoveRecord move)
    {
        var suffix = move.Folder ? "/" : "";
        return $"{Key}: {Encode(move.From)}{suffix}{Separator}{Encode(move.To)}{suffix}";
    }

    /// <summary>The user's message followed by a blank line and one trailer per move.</summary>
    public static string Append(string message, IEnumerable<MoveRecord> moves)
    {
        var trailers = moves.Select(Format).ToList();
        var text = message.Trim().ReplaceLineEndings("\n");
        return trailers.Count == 0 ? text : text + "\n\n" + string.Join('\n', trailers);
    }

    public static IReadOnlyList<MoveRecord> Parse(string message)
    {
        var result = new List<MoveRecord>();
        foreach (var raw in message.ReplaceLineEndings("\n").Split('\n'))
        {
            var line = raw.Trim();
            if (!line.StartsWith(Key + ":", StringComparison.Ordinal))
            {
                continue;
            }

            var value = line[(Key.Length + 1)..].Trim();
            var separator = value.IndexOf(Separator, StringComparison.Ordinal);
            if (separator <= 0)
            {
                continue;
            }

            var from = value[..separator].Trim();
            var to = value[(separator + Separator.Length)..].Trim();
            var folder = from.EndsWith('/');
            if (folder != to.EndsWith('/'))
            {
                continue;
            }

            from = Decode(from.TrimEnd('/'));
            to = Decode(to.TrimEnd('/'));
            if (from.Length == 0 || to.Length == 0)
            {
                continue;
            }

            result.Add(new MoveRecord(from, to, folder));
        }

        return result;
    }

    private static string Encode(string path) => string.Join('/', path.Split('/').Select(Uri.EscapeDataString));

    private static string Decode(string path)
    {
        try
        {
            return string.Join('/', path.Split('/').Select(Uri.UnescapeDataString));
        }
        catch (UriFormatException)
        {
            return "";
        }
    }
}
