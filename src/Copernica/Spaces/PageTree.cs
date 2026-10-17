using System.Text;
using Copernica.Git;
using Microsoft.Extensions.Caching.Memory;

namespace Copernica.Spaces;

/// <summary>Node of the page tree (contracts/openapi.yaml <c>TreeNode</c>).</summary>
public sealed record TreeNode(string Name, string Path, string? Title, string Kind, IReadOnlyList<TreeNode>? Children);

public static class PageTreeBuilder
{
    public const string Folder = "folder";
    public const string Page = "page";

    private static readonly StringComparer NameOrder = StringComparer.OrdinalIgnoreCase;

    /// <summary>Builds the tree from space-relative file paths; only <c>*.md</c> files become pages.</summary>
    public static TreeNode Build(IEnumerable<string> paths, Func<string, string> readContent) =>
        Build(paths, paths.Where(IsPage).ToDictionary(p => p, p => PageTitle.Resolve(readContent(p), p), StringComparer.Ordinal));

    /// <summary>Builds the tree with already resolved titles.</summary>
    public static TreeNode Build(IEnumerable<string> paths, IReadOnlyDictionary<string, string> titles)
    {
        var root = new MutableNode("", "");
        foreach (var path in paths.Where(IsPage))
        {
            var segments = path.Split('/');
            var node = root;
            for (var i = 0; i < segments.Length - 1; i++)
            {
                var folderPath = string.Join('/', segments[..(i + 1)]);
                node = node.Folders.TryGetValue(segments[i], out var child)
                    ? child
                    : node.Folders[segments[i]] = new MutableNode(segments[i], folderPath);
            }

            node.Pages.Add(new TreeNode(segments[^1], path, titles.GetValueOrDefault(path) ?? PageTitle.FromFileName(path), Page, null));
        }

        return root.ToNode();
    }

    public static bool IsPage(string path) => path.EndsWith(".md", StringComparison.OrdinalIgnoreCase);

    private sealed class MutableNode(string name, string path)
    {
        public Dictionary<string, MutableNode> Folders { get; } = new(StringComparer.Ordinal);

        public List<TreeNode> Pages { get; } = [];

        public TreeNode ToNode()
        {
            var children = Folders.Values
                .OrderBy(f => f.Name, NameOrder).ThenBy(f => f.Name, StringComparer.Ordinal)
                .Select(f => f.ToNode())
                .Concat(Pages.OrderBy(p => p.Name, NameOrder).ThenBy(p => p.Name, StringComparer.Ordinal))
                .ToList();
            return new TreeNode(Name, path, null, Folder, children);
        }

        public string Name => name;
    }
}

/// <summary>
/// Page trees per (space, commit), cached because commits are immutable. Titles are cached per
/// blob id, so after a change only the changed files are read again.
/// </summary>
public sealed class PageTreeService(MirrorRepository mirror, IMemoryCache cache)
{
    public TreeNode GetTree(Space space, string commitId) =>
        cache.GetOrCreate((nameof(PageTreeService), space.Id, commitId), entry =>
        {
            entry.SlidingExpiration = TimeSpan.FromMinutes(30);
            var blobs = mirror.ListBlobs(space, commitId, space.Folder)
                .Select(b => (SpacePath: space.ToSpacePath(b.Path)!, Blob: b))
                .Where(b => b.SpacePath is not null && PageTreeBuilder.IsPage(b.SpacePath))
                .ToDictionary(b => b.SpacePath, b => b.Blob, StringComparer.Ordinal);

            var titles = new Dictionary<string, string>(StringComparer.Ordinal);
            var missing = new List<string>();
            foreach (var (path, blob) in blobs)
            {
                if (cache.TryGetValue((nameof(PageTitle), blob.Id, path), out string? title) && title is not null)
                {
                    titles[path] = title;
                }
                else
                {
                    missing.Add(blob.Id);
                }
            }

            var contents = missing.Count == 0 ? new Dictionary<string, byte[]>() : mirror.ReadBlobs(space, missing);
            foreach (var (path, blob) in blobs)
            {
                if (titles.ContainsKey(path))
                {
                    continue;
                }

                var text = contents.TryGetValue(blob.Id, out var bytes) ? Encoding.UTF8.GetString(bytes) : "";
                var title = PageTitle.Resolve(text, path);
                cache.Set((nameof(PageTitle), blob.Id, path), title, new MemoryCacheEntryOptions { SlidingExpiration = TimeSpan.FromHours(6) });
                titles[path] = title;
            }

            return PageTreeBuilder.Build(blobs.Keys, titles);
        })!;

    /// <summary>Space-relative paths of all pages at the commit.</summary>
    public IReadOnlySet<string> GetPagePaths(Space space, string commitId) =>
        cache.GetOrCreate((nameof(GetPagePaths), space.Id, commitId), entry =>
        {
            entry.SlidingExpiration = TimeSpan.FromMinutes(30);
            return (IReadOnlySet<string>)mirror.ListBlobs(space, commitId, space.Folder)
                .Select(b => space.ToSpacePath(b.Path))
                .OfType<string>()
                .Where(PageTreeBuilder.IsPage)
                .ToHashSet(StringComparer.Ordinal);
        })!;
}
