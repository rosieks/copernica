namespace Copernica.Spaces;

/// <summary>Validation of space-relative paths received from clients.</summary>
public static class SpacePaths
{
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
}
