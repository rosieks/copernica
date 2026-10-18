using System.Security.Cryptography;
using System.Text;

namespace Copernica.Attachments;

/// <summary>File names for stored images: a safe stem plus a short random suffix (FR-012).</summary>
public static class AttachmentNames
{
    private const int MaxStemLength = 60;
    private const string Base32 = "abcdefghijklmnopqrstuvwxyz234567";

    /// <summary>Names browsers and operating systems give to pasted clipboard images.</summary>
    private static readonly HashSet<string> GenericStems = new(StringComparer.OrdinalIgnoreCase) { "", "image", "blob", "clipboard", "pasted image", "screenshot" };

    public static string Create(string? originalName, ImageFormat format)
    {
        var stem = Stem(originalName);
        return $"{stem}-{Suffix()}.{format.Extension}";
    }

    private static string Stem(string? originalName)
    {
        var name = Path.GetFileName(originalName ?? "");
        var dot = name.LastIndexOf('.');
        var raw = dot > 0 ? name[..dot] : name;
        if (GenericStems.Contains(raw.Trim()))
        {
            return "image";
        }

        var builder = new StringBuilder(raw.Length);
        var dash = false;
        foreach (var c in raw.ToLowerInvariant())
        {
            if (c is (>= 'a' and <= 'z') or (>= '0' and <= '9') or '.' or '_' or '-')
            {
                builder.Append(c);
                dash = c == '-';
            }
            else if (!dash)
            {
                builder.Append('-');
                dash = true;
            }
        }

        var stem = builder.ToString().Trim('-', '.', '_');
        if (stem.Length > MaxStemLength)
        {
            stem = stem[..MaxStemLength].TrimEnd('-', '.', '_');
        }

        return stem.Length == 0 ? "image" : stem;
    }

    /// <summary>8 base32 characters (40 random bits).</summary>
    private static string Suffix()
    {
        Span<byte> bytes = stackalloc byte[5];
        RandomNumberGenerator.Fill(bytes);
        ulong value = 0;
        foreach (var b in bytes)
        {
            value = (value << 8) | b;
        }

        Span<char> chars = stackalloc char[8];
        for (var i = 7; i >= 0; i--)
        {
            chars[i] = Base32[(int)(value & 31)];
            value >>= 5;
        }

        return new string(chars);
    }
}
