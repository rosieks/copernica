namespace Copernica.Discussions;

public sealed record AnchorPosition(int Start, int End, string Exact, string Prefix, string Suffix);

/// <summary>
/// Finds an anchored fragment again after the page changed (research.md R6):
/// exact quote (best prefix/suffix, then nearest to the old offset) → fuzzy match → not found.
/// </summary>
public static class Reanchorer
{
    public const double MinimumSimilarity = 0.75;

    private static readonly DiffMatchPatch Matcher = new() { MatchThreshold = 0.3, MatchDistance = 1000 };

    /// <summary>Returns the new position of <paramref name="anchor"/> in <paramref name="text"/>, or null when it is gone.</summary>
    public static AnchorPosition? Locate(string text, TextAnchor anchor)
    {
        var exact = anchor.Exact;
        if (exact.Length == 0 || text.Length == 0)
        {
            return null;
        }

        var best = BestExactMatch(text, anchor);
        if (best is { } start)
        {
            return At(text, start, start + exact.Length);
        }

        return FuzzyMatch(text, anchor);
    }

    public static AnchorPosition At(string text, int start, int end) => new(
        start,
        end,
        text[start..end],
        text[Math.Max(0, start - TextAnchor.ContextLength)..start],
        text[end..Math.Min(text.Length, end + TextAnchor.ContextLength)]);

    private static int? BestExactMatch(string text, TextAnchor anchor)
    {
        int? best = null;
        var bestScore = int.MinValue;
        var bestDistance = int.MaxValue;
        for (var i = text.IndexOf(anchor.Exact, StringComparison.Ordinal); i >= 0; i = text.IndexOf(anchor.Exact, i + 1, StringComparison.Ordinal))
        {
            var score = CommonSuffix(text[..i], anchor.Prefix) + CommonPrefix(text[(i + anchor.Exact.Length)..], anchor.Suffix);
            var distance = Math.Abs(i - anchor.Start);
            if (score > bestScore || (score == bestScore && distance < bestDistance))
            {
                (best, bestScore, bestDistance) = (i, score, distance);
            }
        }

        return best;
    }

    private static AnchorPosition? FuzzyMatch(string text, TextAnchor anchor)
    {
        var exact = anchor.Exact;
        var expected = Math.Clamp(anchor.Start, 0, text.Length);
        int start, end;

        if (exact.Length <= DiffMatchPatch.MatchMaxBits)
        {
            start = Matcher.MatchMain(text, exact, expected);
            if (start < 0)
            {
                return null;
            }

            end = Math.Min(text.Length, start + exact.Length);
        }
        else
        {
            var head = exact[..DiffMatchPatch.MatchMaxBits];
            var tail = exact[^DiffMatchPatch.MatchMaxBits..];
            start = Matcher.MatchMain(text, head, expected);
            if (start < 0)
            {
                return null;
            }

            var tailStart = Matcher.MatchMain(text, tail, start + exact.Length - DiffMatchPatch.MatchMaxBits);
            if (tailStart < start)
            {
                return null;
            }

            end = Math.Min(text.Length, tailStart + DiffMatchPatch.MatchMaxBits);
        }

        if (end <= start)
        {
            return null;
        }

        var candidate = text[start..end];
        var lengthRatio = (double)candidate.Length / exact.Length;
        if (lengthRatio is < 0.75 or > 1.25 || Similarity(candidate, exact) < MinimumSimilarity)
        {
            return null;
        }

        return At(text, start, end);
    }

    /// <summary>1 − (Levenshtein distance / longer length).</summary>
    internal static double Similarity(string a, string b)
    {
        if (a.Length == 0 && b.Length == 0)
        {
            return 1;
        }

        var previous = new int[b.Length + 1];
        var current = new int[b.Length + 1];
        for (var j = 0; j <= b.Length; j++)
        {
            previous[j] = j;
        }

        for (var i = 1; i <= a.Length; i++)
        {
            current[0] = i;
            for (var j = 1; j <= b.Length; j++)
            {
                var cost = a[i - 1] == b[j - 1] ? 0 : 1;
                current[j] = Math.Min(Math.Min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
            }

            (previous, current) = (current, previous);
        }

        return 1.0 - ((double)previous[b.Length] / Math.Max(a.Length, b.Length));
    }

    private static int CommonSuffix(string text, string suffix)
    {
        var n = 0;
        while (n < suffix.Length && n < text.Length && text[^(n + 1)] == suffix[^(n + 1)])
        {
            n++;
        }

        return n;
    }

    private static int CommonPrefix(string text, string prefix)
    {
        var n = 0;
        while (n < prefix.Length && n < text.Length && text[n] == prefix[n])
        {
            n++;
        }

        return n;
    }
}
