using System.Text;

namespace Copernica.Spaces;

/// <summary>Validation of space-relative paths received from clients.</summary>
public static class SpacePaths
{
    /// <summary>Folder order file (005 contracts/order-file.md); never a page or folder name.</summary>
    public const string OrderFileName = ".order";

    public const int MaxNameBytes = 255;

    private static readonly char[] InvalidNameChars = ['<', '>', ':', '"', '|', '?', '*', '/', '\\'];

    /// <summary>Normalizes a <c>/</c>-separated relative path; rejects empty, absolute and <c>.</c>/<c>..</c> segments.</summary>
    public static bool TryNormalize(string? raw, out string path)
    {
        path = "";
        if (string.IsNullOrWhiteSpace(raw) || raw.Contains('\\') || raw.StartsWith('/') || raw.Any(char.IsControl))
        {
            return false;
        }

        var segments = raw.Split('/');
        if (segments.Any(s => s.Length == 0 || s is "." or ".." || s.Trim().Length == 0))
        {
            return false;
        }

        path = string.Join('/', segments);
        return true;
    }

    public static bool TryNormalizePage(string? raw, out string path) =>
        TryNormalize(raw, out path) && PageTreeBuilder.IsPage(path);

    /// <summary>
    /// A single file or folder name created or renamed through the wiki (005 research R15): no
    /// separators, control or Windows-reserved characters, no leading/trailing spaces, at most
    /// 255 UTF-8 bytes, and not the reserved <c>.order</c>.
    /// </summary>
    public static bool TryNormalizeName(string? raw, out string name)
    {
        name = "";
        if (string.IsNullOrEmpty(raw)
            || raw.Trim().Length == 0
            || raw != raw.Trim()
            || raw is "." or ".."
            || raw.Any(char.IsControl)
            || raw.IndexOfAny(InvalidNameChars) >= 0
            || Encoding.UTF8.GetByteCount(raw) > MaxNameBytes
            || IsReservedName(raw))
        {
            return false;
        }

        name = raw;
        return true;
    }

    /// <summary>A path whose every segment is a valid name (paths created through the tree).</summary>
    public static bool TryNormalizeNamedPath(string? raw, out string path)
    {
        path = "";
        if (!TryNormalize(raw, out var normalized) || normalized.Split('/').Any(s => !TryNormalizeName(s, out _)))
        {
            return false;
        }

        path = normalized;
        return true;
    }

    public static bool IsReservedName(string name) => string.Equals(name, OrderFileName, StringComparison.OrdinalIgnoreCase);

    /// <summary>Folder part of a space path (<c>""</c> for the root).</summary>
    public static string Parent(string path)
    {
        var slash = path.LastIndexOf('/');
        return slash < 0 ? "" : path[..slash];
    }

    /// <summary>Last segment of a space path.</summary>
    public static string Name(string path) => path[(path.LastIndexOf('/') + 1)..];

    public static string Combine(string folder, string name) => folder.Length == 0 ? name : $"{folder}/{name}";
}
