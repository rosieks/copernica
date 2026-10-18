using System.Text;

namespace Copernica.Attachments;

/// <summary>
/// The accepted image formats, detected from the content rather than the file name or the
/// client's content type (003 research R2). Renamed executables and HTML are rejected.
/// </summary>
public sealed record ImageFormat(string ContentType, string Extension)
{
    public static readonly ImageFormat Png = new("image/png", "png");
    public static readonly ImageFormat Jpeg = new("image/jpeg", "jpg");
    public static readonly ImageFormat Gif = new("image/gif", "gif");
    public static readonly ImageFormat Webp = new("image/webp", "webp");
    public static readonly ImageFormat Svg = new("image/svg+xml", "svg");

    public static readonly IReadOnlyList<ImageFormat> All = [Png, Jpeg, Gif, Webp, Svg];

    /// <summary>How many leading bytes <see cref="Detect"/> looks at.</summary>
    public const int HeaderLength = 4096;

    private static readonly UTF8Encoding StrictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);

    public static ImageFormat? Detect(ReadOnlySpan<byte> head)
    {
        if (head.StartsWith((ReadOnlySpan<byte>)[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
        {
            return Png;
        }

        if (head.Length >= 4 && head.StartsWith((ReadOnlySpan<byte>)[0xFF, 0xD8, 0xFF]))
        {
            return Jpeg;
        }

        if (head.StartsWith("GIF87a"u8) || head.StartsWith("GIF89a"u8))
        {
            return Gif;
        }

        if (head.Length >= 12 && head.StartsWith("RIFF"u8) && head[8..12].SequenceEqual("WEBP"u8))
        {
            return Webp;
        }

        return IsSvg(head) ? Svg : null;
    }

    private static bool IsSvg(ReadOnlySpan<byte> head)
    {
        var sample = head.Length > HeaderLength ? head[..HeaderLength] : head;
        string text;
        try
        {
            text = StrictUtf8.GetString(sample);
        }
        catch (DecoderFallbackException)
        {
            // A cut in the middle of a multi-byte character at the end of the sample is fine.
            if (sample.Length < HeaderLength)
            {
                return false;
            }

            try
            {
                text = StrictUtf8.GetString(sample[..^3]);
            }
            catch (DecoderFallbackException)
            {
                return false;
            }
        }

        var s = text.AsSpan().TrimStart('﻿');
        while (true)
        {
            s = s.TrimStart();
            if (s.StartsWith("<?xml", StringComparison.Ordinal))
            {
                var end = s.IndexOf("?>", StringComparison.Ordinal);
                if (end < 0)
                {
                    return false;
                }

                s = s[(end + 2)..];
            }
            else if (s.StartsWith("<!--", StringComparison.Ordinal))
            {
                var end = s.IndexOf("-->", StringComparison.Ordinal);
                if (end < 0)
                {
                    return false;
                }

                s = s[(end + 3)..];
            }
            else
            {
                break;
            }
        }

        return s.StartsWith("<svg", StringComparison.OrdinalIgnoreCase)
            && (s.Length == 4 || s[4] is ' ' or '>' or '/' or '\t' or '\r' or '\n');
    }
}
