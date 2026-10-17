// Fuzzy matching (Bitap) adapted from diff-match-patch by Neil Fraser, Google Inc.
// Copyright 2018 The diff-match-patch Authors. https://github.com/google/diff-match-patch
// Licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Only the "match" part is included; it is used to re-anchor discussions (research.md R6).

namespace Copernica.Discussions;

internal sealed class DiffMatchPatch
{
    /// <summary>At what point is no match declared (0.0 = perfection, 1.0 = very loose).</summary>
    public double MatchThreshold { get; init; } = 0.5;

    /// <summary>How far to search for a match (0 = exact location, 1000+ = broad match).</summary>
    public int MatchDistance { get; init; } = 1000;

    /// <summary>The number of bits in an int; patterns longer than this cannot be matched.</summary>
    public const int MatchMaxBits = 32;

    /// <summary>Locates the best instance of <paramref name="pattern"/> in <paramref name="text"/> near <paramref name="loc"/>; -1 if none.</summary>
    public int MatchMain(string text, string pattern, int loc)
    {
        loc = Math.Max(0, Math.Min(loc, text.Length));
        if (text == pattern)
        {
            return 0;
        }

        if (text.Length == 0)
        {
            return -1;
        }

        if (loc + pattern.Length <= text.Length && string.CompareOrdinal(text, loc, pattern, 0, pattern.Length) == 0)
        {
            return loc;
        }

        if (pattern.Length > MatchMaxBits)
        {
            throw new ArgumentException($"Pattern too long for Bitap (max {MatchMaxBits}).", nameof(pattern));
        }

        return MatchBitap(text, pattern, loc);
    }

    private int MatchBitap(string text, string pattern, int loc)
    {
        var s = MatchAlphabet(pattern);
        var scoreThreshold = MatchThreshold;

        var bestLoc = text.IndexOf(pattern, loc, StringComparison.Ordinal);
        if (bestLoc != -1)
        {
            scoreThreshold = Math.Min(BitapScore(0, bestLoc, loc, pattern), scoreThreshold);
            bestLoc = text.LastIndexOf(pattern, Math.Min(loc + pattern.Length, text.Length - 1), StringComparison.Ordinal);
            if (bestLoc != -1)
            {
                scoreThreshold = Math.Min(BitapScore(0, bestLoc, loc, pattern), scoreThreshold);
            }
        }

        var matchMask = 1L << (pattern.Length - 1);
        bestLoc = -1;

        int binMin, binMid;
        var binMax = pattern.Length + text.Length;
        var lastRd = Array.Empty<long>();
        for (var d = 0; d < pattern.Length; d++)
        {
            binMin = 0;
            binMid = binMax;
            while (binMin < binMid)
            {
                if (BitapScore(d, loc + binMid, loc, pattern) <= scoreThreshold)
                {
                    binMin = binMid;
                }
                else
                {
                    binMax = binMid;
                }

                binMid = ((binMax - binMin) / 2) + binMin;
            }

            binMax = binMid;
            var start = Math.Max(1, loc - binMid + 1);
            var finish = Math.Min(loc + binMid, text.Length) + pattern.Length;

            var rd = new long[finish + 2];
            rd[finish + 1] = (1L << d) - 1;
            for (var j = finish; j >= start; j--)
            {
                long charMatch = text.Length <= j - 1 || !s.TryGetValue(text[j - 1], out var bits) ? 0 : bits;
                rd[j] = d == 0
                    ? ((rd[j + 1] << 1) | 1) & charMatch
                    : (((rd[j + 1] << 1) | 1) & charMatch) | (((lastRd[j + 1] | lastRd[j]) << 1) | 1) | lastRd[j + 1];

                if ((rd[j] & matchMask) != 0)
                {
                    var score = BitapScore(d, j - 1, loc, pattern);
                    if (score <= scoreThreshold)
                    {
                        scoreThreshold = score;
                        bestLoc = j - 1;
                        if (bestLoc > loc)
                        {
                            start = Math.Max(1, (2 * loc) - bestLoc);
                        }
                        else
                        {
                            break;
                        }
                    }
                }
            }

            if (BitapScore(d + 1, loc, loc, pattern) > scoreThreshold)
            {
                break;
            }

            lastRd = rd;
        }

        return bestLoc;
    }

    private double BitapScore(int e, int x, int loc, string pattern)
    {
        var accuracy = (double)e / pattern.Length;
        var proximity = Math.Abs(loc - x);
        if (MatchDistance == 0)
        {
            return proximity == 0 ? accuracy : 1.0;
        }

        return accuracy + ((double)proximity / MatchDistance);
    }

    private static Dictionary<char, long> MatchAlphabet(string pattern)
    {
        var s = new Dictionary<char, long>();
        for (var i = 0; i < pattern.Length; i++)
        {
            s[pattern[i]] = s.GetValueOrDefault(pattern[i]) | (1L << (pattern.Length - i - 1));
        }

        return s;
    }
}
