using System.Text;

namespace Copernica.Spaces;

/// <summary>
/// A folder's <c>.order</c> file, compatible with Azure DevOps Wiki (005 contracts/order-file.md):
/// one entry per line naming a page (file name without <c>.md</c>) or a subfolder. Edits are
/// minimal: lines that are not touched stay byte-for-byte.
/// </summary>
public sealed class FolderOrder
{
    public const int MaxBytes = 64 * 1024;

    private static readonly UTF8Encoding StrictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
    private static readonly byte[] Preamble = Encoding.UTF8.GetPreamble();

    private readonly List<string> _lines;
    private readonly string _newline;
    private readonly bool _bom;

    private FolderOrder(List<string> lines, string newline, bool bom)
    {
        _lines = lines;
        _newline = newline;
        _bom = bom;
    }

    /// <summary>The entries in file order: trimmed, blank lines left out.</summary>
    public IReadOnlyList<string> Entries => _lines.Select(l => l.Trim()).Where(l => l.Length > 0).ToList();

    /// <summary>The file, or null when it is too large or not UTF-8 (the folder is then ordered alphabetically).</summary>
    public static FolderOrder? Parse(byte[] bytes)
    {
        if (bytes.Length > MaxBytes)
        {
            return null;
        }

        var bom = bytes.AsSpan().StartsWith(Preamble);
        string text;
        try
        {
            text = StrictUtf8.GetString(bom ? bytes[Preamble.Length..] : bytes);
        }
        catch (DecoderFallbackException)
        {
            return null;
        }

        if (text.Contains('\0'))
        {
            return null;
        }

        var newline = text.IndexOf('\n') is var index and > 0 && text[index - 1] == '\r' ? "\r\n" : "\n";
        var lines = text.ReplaceLineEndings("\n").Split('\n').ToList();
        if (lines.Count > 0 && lines[^1].Length == 0)
        {
            lines.RemoveAt(lines.Count - 1);
        }

        return new FolderOrder(lines, newline, bom);
    }

    /// <summary>A new file listing <paramref name="entries"/> (the first reorder of a folder).</summary>
    public static FolderOrder Create(IEnumerable<string> entries) => new(entries.ToList(), "\n", bom: false);

    /// <summary>The entry naming a page or folder: the file name without <c>.md</c> for pages.</summary>
    public static string EntryFor(string name, bool isPage) =>
        isPage && name.EndsWith(".md", StringComparison.OrdinalIgnoreCase) ? name[..^3] : name;

    /// <summary>
    /// Orders children: listed ones first in file order (exact match, then ignoring case; a page
    /// and a folder of the same name stay together, page first), then the rest in their given order.
    /// </summary>
    public IReadOnlyList<T> Sort<T>(IReadOnlyList<T> children, Func<T, string> entryOf, Func<T, bool> isPage)
    {
        var placed = new HashSet<int>();
        var result = new List<T>(children.Count);
        foreach (var entry in Entries)
        {
            var matches = Matches(children.Count, i => !placed.Contains(i) ? entryOf(children[i]) : null, entry);
            foreach (var i in matches.OrderBy(i => isPage(children[i]) ? 0 : 1))
            {
                placed.Add(i);
                result.Add(children[i]);
            }
        }

        for (var i = 0; i < children.Count; i++)
        {
            if (!placed.Contains(i))
            {
                result.Add(children[i]);
            }
        }

        return result;
    }

    /// <summary>Adds <paramref name="entry"/> before the line of <paramref name="before"/>, or at the end.</summary>
    public FolderOrder Insert(string entry, string? before = null)
    {
        var lines = new List<string>(_lines);
        var index = before is null ? -1 : LineOf(lines, before);
        lines.Insert(index < 0 ? lines.Count : index, entry);
        return new FolderOrder(lines, _newline, _bom);
    }

    /// <summary>Removes the line of <paramref name="entry"/>; unchanged when it is not listed.</summary>
    public FolderOrder Remove(string entry)
    {
        var lines = new List<string>(_lines);
        var index = LineOf(lines, entry);
        if (index >= 0)
        {
            lines.RemoveAt(index);
        }

        return new FolderOrder(lines, _newline, _bom);
    }

    /// <summary>Replaces the line of <paramref name="entry"/> in place; appends when it is not listed.</summary>
    public FolderOrder Replace(string entry, string replacement)
    {
        var lines = new List<string>(_lines);
        var index = LineOf(lines, entry);
        if (index < 0)
        {
            lines.Add(replacement);
        }
        else
        {
            lines[index] = replacement;
        }

        return new FolderOrder(lines, _newline, _bom);
    }

    /// <summary>
    /// Lists <paramref name="ordered"/> (every current child, in its new order). Entries that name
    /// nothing current stay after the entry that preceded them.
    /// </summary>
    public FolderOrder Rewrite(IReadOnlyList<string> ordered)
    {
        var current = new HashSet<string>(ordered, StringComparer.OrdinalIgnoreCase);
        var lines = ordered.ToList();
        string? previous = null;
        foreach (var line in _lines)
        {
            var entry = line.Trim();
            if (entry.Length > 0 && current.Contains(entry))
            {
                previous = entry;
                continue;
            }

            var at = previous is null ? 0 : lines.FindIndex(l => string.Equals(l, previous, StringComparison.OrdinalIgnoreCase)) + 1;
            lines.Insert(at, line);
            previous = entry.Length > 0 ? entry : previous;
        }

        return new FolderOrder(lines, _newline, _bom);
    }

    public byte[] ToBytes()
    {
        var text = string.Concat(_lines.Select(l => l + _newline));
        var bytes = new UTF8Encoding(false).GetBytes(text);
        return _bom ? [.. Preamble, .. bytes] : bytes;
    }

    private static int LineOf(List<string> lines, string entry)
    {
        var exact = lines.FindIndex(l => string.Equals(l.Trim(), entry, StringComparison.Ordinal));
        return exact >= 0 ? exact : lines.FindIndex(l => string.Equals(l.Trim(), entry, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Indexes whose entry equals <paramref name="entry"/>: exact matches, or else matches ignoring case.</summary>
    private static List<int> Matches(int count, Func<int, string?> entryAt, string entry)
    {
        var exact = Enumerable.Range(0, count).Where(i => string.Equals(entryAt(i), entry, StringComparison.Ordinal)).ToList();
        return exact.Count > 0
            ? exact
            : Enumerable.Range(0, count).Where(i => string.Equals(entryAt(i), entry, StringComparison.OrdinalIgnoreCase)).ToList();
    }
}
