using Copernica.Git;

namespace Copernica.Spaces;

/// <summary>
/// Every file a move relocates, old → new space path, plus the moved roots written as commit
/// trailers (005 data-model.md "Move map").
/// </summary>
public sealed class MoveMap
{
    private readonly Dictionary<string, string> _files = new(StringComparer.Ordinal);

    public MoveMap(IEnumerable<MoveRecord> roots, IEnumerable<KeyValuePair<string, string>> files)
    {
        Roots = roots.ToList();
        foreach (var (from, to) in files)
        {
            _files[from] = to;
        }
    }

    public IReadOnlyList<MoveRecord> Roots { get; }

    public IReadOnlyDictionary<string, string> Files => _files;

    /// <summary>The new path of a moved file, or null when the file does not move.</summary>
    public string? Map(string path) => _files.GetValueOrDefault(path);

    /// <summary>
    /// Texts a link to a moved file must contain: the name of a moved root, raw or encoded
    /// (cheap prefilter before parsing a page, research R7).
    /// </summary>
    public IReadOnlyList<string> Needles =>
        Roots.Select(r => SpacePaths.Name(r.From))
            .SelectMany(name => new[] { name, Uri.EscapeDataString(name), name.Replace(" ", "%20", StringComparison.Ordinal) })
            .Distinct(StringComparer.Ordinal)
            .ToList();
}
