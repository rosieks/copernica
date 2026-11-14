using YamlDotNet.Core;
using YamlDotNet.Core.Events;

namespace Copernica.Rendering;

/// <summary>
/// Reads a front matter body into <see cref="FrontMatter"/> (010 research R2–R4). Only YamlDotNet's
/// event parser is used: tags never construct objects, scalars stay text as written, and size,
/// depth and alias expansion are bounded here so a hostile page stays cheap.
/// </summary>
public static class FrontMatterParser
{
    public const int MaxBodyLength = 32 * 1024;
    public const int MaxDepth = 16;
    public const int MaxNodes = 2000;
    public const int MaxScalarLength = 8 * 1024;

    private static readonly string[] Statuses = ["draft", "deprecated", "archived"];

    public static FrontMatter Parse(string body) => Read(body).FrontMatter;

    /// <summary>The scalar that gives the page its title, with offsets in <paramref name="body"/> (rename, research R6).</summary>
    internal static YamlText? FindTitleScalar(string body) => Read(body).Title;

    private static (FrontMatter FrontMatter, YamlText? Title) Read(string body)
    {
        var root = ReadTree(body);
        return root is null ? (FrontMatter.Unreadable(body), null) : Interpret(root);
    }

    /// <summary>The top-level mapping, or null when the block is unreadable.</summary>
    private static YamlMap? ReadTree(string body)
    {
        if (body.Length > MaxBodyLength)
        {
            return null;
        }

        try
        {
            var parser = new Parser(new StringReader(body));
            var reader = new TreeReader(parser);
            return reader.ReadDocument();
        }
        catch (Exception ex) when (ex is YamlException or InvalidFrontMatterException)
        {
            return null;
        }
    }

    private static (FrontMatter, YamlText?) Interpret(YamlMap root)
    {
        // Which entry gives each known field: the canonical name first, then its aliases (FR-004);
        // among case variants the first one written wins. Everything not used is a property.
        var used = new HashSet<int>();
        int? Pick(Func<YamlNode, bool> usable, params string[] names)
        {
            foreach (var name in names)
            {
                for (var i = 0; i < root.Entries.Count; i++)
                {
                    if (string.Equals(root.Entries[i].Key, name, StringComparison.OrdinalIgnoreCase))
                    {
                        if (usable(root.Entries[i].Value))
                        {
                            used.Add(i);
                            return i;
                        }

                        break;
                    }
                }
            }

            return null;
        }

        var title = Pick(IsText, "title");
        var description = Pick(IsText, "description", "summary");
        var tags = Pick(IsTextOrTextList, "tags", "keywords");
        var status = Pick(IsStatus, "status");
        var owners = Pick(IsTextOrTextList, "owner");
        var authors = Pick(IsTextOrTextList, "authors", "author");
        var aliases = Pick(IsTextOrTextList, "aliases");

        var properties = new List<FrontMatterProperty>();
        for (var i = 0; i < root.Entries.Count; i++)
        {
            var (key, value) = root.Entries[i];
            if (used.Contains(i) || IsKnownNull(key, value))
            {
                continue;
            }

            properties.Add(new FrontMatterProperty(key, ToValue(value)));
        }

        string? Text(int? index) => index is { } i ? ((YamlText)root.Entries[i].Value).Value.Trim() : null;
        IReadOnlyList<string> List(int? index, bool splitCommas = false) =>
            index is { } i ? Strings(root.Entries[i].Value, splitCommas) : [];

        var titleNode = title is { } t ? (YamlText)root.Entries[t].Value : null;
        var frontMatter = new FrontMatter(
            Readable: true,
            Raw: null,
            Title: Text(title),
            Description: Text(description),
            Tags: List(tags, splitCommas: true),
            Status: Text(status)?.ToLowerInvariant(),
            Owners: List(owners),
            Authors: List(authors),
            Aliases: List(aliases),
            Properties: properties);
        return (frontMatter, titleNode);
    }

    private static readonly string[] KnownNames = ["title", "description", "summary", "tags", "keywords", "status", "owner", "authors", "author", "aliases"];

    /// <summary>A known field without a value counts as absent and is not listed (data-model.md).</summary>
    private static bool IsKnownNull(string key, YamlNode value) =>
        value is YamlText { IsNull: true } && KnownNames.Contains(key, StringComparer.OrdinalIgnoreCase);

    private static bool IsText(YamlNode node) => node is YamlText { IsNull: false } text && text.Value.Trim().Length > 0;

    private static bool IsStatus(YamlNode node) =>
        IsText(node) && Statuses.Contains(((YamlText)node).Value.Trim(), StringComparer.OrdinalIgnoreCase);

    private static bool IsTextOrTextList(YamlNode node) =>
        IsText(node) || node is YamlList list && list.Items.All(item => item is YamlText) && list.Items.Any(IsText);

    /// <summary>Trimmed, non-empty, de-duplicated (ignoring case) strings in written order.</summary>
    private static IReadOnlyList<string> Strings(YamlNode node, bool splitCommas)
    {
        IEnumerable<string> values = node switch
        {
            YamlText text when splitCommas => text.Value.Split(','),
            YamlText text => [text.Value],
            YamlList list => list.Items.Cast<YamlText>().Where(t => !t.IsNull).Select(t => t.Value),
            _ => [],
        };

        return values.Select(v => v.Trim()).Where(v => v.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static FrontMatterValue ToValue(YamlNode node) => node switch
    {
        YamlText text => new FrontMatterText(text.IsNull ? "" : text.Value),
        YamlList list => new FrontMatterList(list.Items.Select(ToValue).ToList()),
        YamlMap map => new FrontMatterMap(map.Entries.Select(e => new FrontMatterProperty(e.Key, ToValue(e.Value))).ToList()),
        _ => throw new InvalidOperationException(),
    };

    /// <summary>Builds the value tree from parser events and enforces the limits.</summary>
    private sealed class TreeReader(IParser parser)
    {
        private readonly Dictionary<string, YamlNode> _anchors = new(StringComparer.Ordinal);
        private int _nodes;

        public YamlMap? ReadDocument()
        {
            Expect<StreamStart>();
            if (parser.Current is StreamEnd)
            {
                return new YamlMap([], 1);
            }

            Expect<DocumentStart>();
            var root = ReadNode(1);
            Expect<DocumentEnd>();
            if (parser.Current is not StreamEnd)
            {
                throw new InvalidFrontMatterException();
            }

            return root switch
            {
                YamlMap map => map,
                YamlText { IsNull: true } => new YamlMap([], 1),
                _ => throw new InvalidFrontMatterException(),
            };
        }

        private YamlNode ReadNode(int depth)
        {
            if (depth > MaxDepth)
            {
                throw new InvalidFrontMatterException();
            }

            var current = parser.Current;
            parser.MoveNext();
            YamlNode node;
            switch (current)
            {
                case AnchorAlias alias:
                    if (!_anchors.TryGetValue(alias.Value.Value, out var target))
                    {
                        throw new InvalidFrontMatterException();
                    }

                    Count(target.Size);
                    return target;

                case Scalar scalar:
                    if (scalar.Value.Length > MaxScalarLength)
                    {
                        throw new InvalidFrontMatterException();
                    }

                    Count(1);
                    node = new YamlText(scalar.Value, scalar.Style, (int)scalar.Start.Index, (int)scalar.End.Index, IsNull(scalar));
                    break;

                case SequenceStart:
                    Count(1);
                    var items = new List<YamlNode>();
                    while (parser.Current is not SequenceEnd)
                    {
                        items.Add(ReadNode(depth + 1));
                    }

                    parser.MoveNext();
                    node = new YamlList(items, 1 + items.Sum(i => i.Size));
                    break;

                case MappingStart:
                    Count(1);
                    var entries = new List<(string Key, YamlNode Value)>();
                    var keys = new HashSet<string>(StringComparer.Ordinal);
                    while (parser.Current is not MappingEnd)
                    {
                        // Only text keys, each once: tools disagree on how duplicates resolve (spec Edge Cases).
                        if (ReadNode(depth + 1) is not YamlText key || !keys.Add(key.Value))
                        {
                            throw new InvalidFrontMatterException();
                        }

                        entries.Add((key.Value, ReadNode(depth + 1)));
                    }

                    parser.MoveNext();
                    node = new YamlMap(entries, 1 + entries.Sum(e => 1 + e.Value.Size));
                    break;

                default:
                    throw new InvalidFrontMatterException();
            }

            if (current is NodeEvent { Anchor.IsEmpty: false } anchored)
            {
                _anchors[anchored.Anchor.Value] = node;
            }

            return node;
        }

        private void Expect<T>()
            where T : ParsingEvent
        {
            if (parser.Current is null && !parser.MoveNext() || parser.Current is not T)
            {
                throw new InvalidFrontMatterException();
            }

            parser.MoveNext();
        }

        private void Count(int nodes)
        {
            _nodes += nodes;
            if (_nodes > MaxNodes)
            {
                throw new InvalidFrontMatterException();
            }
        }

        private static bool IsNull(Scalar scalar) =>
            scalar.Style is ScalarStyle.Plain or ScalarStyle.Any && scalar.Value is "" or "~" or "null" or "Null" or "NULL";
    }

    private sealed class InvalidFrontMatterException : Exception;
}

internal abstract record YamlNode(int Size);

/// <summary>A scalar as written; <c>Start</c>/<c>End</c> are offsets in the block body.</summary>
internal sealed record YamlText(string Value, ScalarStyle Style, int Start, int End, bool IsNull) : YamlNode(1);

internal sealed record YamlList(IReadOnlyList<YamlNode> Items, int Size) : YamlNode(Size);

internal sealed record YamlMap(IReadOnlyList<(string Key, YamlNode Value)> Entries, int Size) : YamlNode(Size);
