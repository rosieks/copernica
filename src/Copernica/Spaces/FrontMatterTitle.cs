using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Copernica.Rendering;
using YamlDotNet.Core;

namespace Copernica.Spaces;

/// <summary>
/// Replaces the front matter <c>title</c> value of a page in place when it is renamed (010 research
/// R6). Only the value's characters change; its quoting style is kept when that is safe.
/// </summary>
public static partial class FrontMatterTitle
{
    /// <summary>The content with a new title, or null when the page has no readable front matter title.</summary>
    public static string? Replace(string content, string title)
    {
        if (FrontMatter.Locate(content) is not { } block || FrontMatterParser.FindTitleScalar(block.Body) is not { } scalar)
        {
            return null;
        }

        var start = block.BodyStart + scalar.Start;
        var end = block.BodyStart + scalar.End;
        // Block scalars end after their last line break; keep the line ending in place.
        while (end > start && content[end - 1] is '\n' or '\r' or ' ' or '\t')
        {
            end--;
        }

        return content[..start] + Encode(title.Trim(), scalar.Style) + content[end..];
    }

    private static string Encode(string title, ScalarStyle style) => style switch
    {
        ScalarStyle.SingleQuoted => "'" + title.Replace("'", "''", StringComparison.Ordinal) + "'",
        ScalarStyle.Plain when IsSafePlain(title) => title,
        _ => DoubleQuoted(title),
    };

    private static string DoubleQuoted(string text)
    {
        var builder = new StringBuilder("\"");
        foreach (var c in text)
        {
            builder.Append(c switch
            {
                '\\' => "\\\\",
                '"' => "\\\"",
                '\t' => "\\t",
                _ when char.IsControl(c) => "\\u" + ((int)c).ToString("x4", CultureInfo.InvariantCulture),
                _ => c.ToString(),
            });
        }

        return builder.Append('"').ToString();
    }

    /// <summary>Plain text that YAML reads back unchanged, as text.</summary>
    private static bool IsSafePlain(string text) =>
        text.Length > 0
        && !"-?:,[]{}#&*!|>'\"%@`".Contains(text[0])
        && !text.Contains(": ", StringComparison.Ordinal)
        && !text.Contains(" #", StringComparison.Ordinal)
        && !text.EndsWith(':')
        && !text.Any(char.IsControl)
        && !Special().IsMatch(text);

    [GeneratedRegex(@"^(~|null|true|false|yes|no|on|off|[-+]?(\.?\d[\d._]*([eE][-+]?\d+)?|0x[0-9a-fA-F]+|0o[0-7]+|\.inf|\.nan))$", RegexOptions.IgnoreCase)]
    private static partial Regex Special();
}
