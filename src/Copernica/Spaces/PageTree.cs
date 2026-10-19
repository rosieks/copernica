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

    /// <summary>
    /// Builds the tree with already resolved titles. <paramref name="orders"/> gives a folder's
    /// <c>.order</c> (folder path → order; <c>""</c> is the root), which orders its children (005 FR-019).
    /// </summary>
    public static TreeNode Build(IEnumerable<string> paths, IReadOnlyDictionary<string, string> titles, Func<string, FolderOrder?>? orders = null)
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

        return root.ToNode(orders ?? (_ => null));
    }

    public static bool IsPage(string path) => path.EndsWith(".md", StringComparison.OrdinalIgnoreCase);

    /// <summary>Whether <paramref name="path"/> is a folder's order file (never a page).</summary>
    public static bool IsOrderFile(string path) => SpacePaths.Name(path) == SpacePaths.OrderFileName;

    /// <summary>Folders before pages, each case-insensitively by name: the order without an <c>.order</c> file.</summary>
    public static IReadOnlyList<TreeNode> DefaultOrder(IEnumerable<TreeNode> children) =>
        children
            .OrderBy(c => c.Kind == Page ? 1 : 0)
            .ThenBy(c => c.Name, NameOrder).ThenBy(c => c.Name, StringComparer.Ordinal)
            .ToList();

    private sealed class MutableNode(string name, string path)
    {
        public Dictionary<string, MutableNode> Folders { get; } = new(StringComparer.Ordinal);

        public List<TreeNode> Pages { get; } = [];

        public TreeNode ToNode(Func<string, FolderOrder?> orders)
        {
            IReadOnlyList<TreeNode> children = DefaultOrder(Folders.Values.Select(f => f.ToNode(orders)).Concat(Pages));
            if (orders(path) is { } order)
            {
                children = order.Sort(children, c => FolderOrder.EntryFor(c.Name, c.Kind == Page), c => c.Kind == Page);
            }

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
            var all = mirror.ListBlobs(space, commitId, space.Folder);
            var blobs = all
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

            // Folder order files (005 FR-019); unreadable ones are ignored.
            var orderBlobs = all
                .Select(b => (SpacePath: space.ToSpacePath(b.Path), Blob: b))
                .Where(b => b.SpacePath is not null && PageTreeBuilder.IsOrderFile(b.SpacePath) && b.Blob.Size <= FolderOrder.MaxBytes)
                .ToDictionary(b => SpacePaths.Parent(b.SpacePath!), b => b.Blob.Id, StringComparer.Ordinal);
            var orderContents = orderBlobs.Count == 0 ? new Dictionary<string, byte[]>() : mirror.ReadBlobs(space, orderBlobs.Values);
            var orders = orderBlobs
                .Select(o => (Folder: o.Key, Order: orderContents.TryGetValue(o.Value, out var bytes) ? FolderOrder.Parse(bytes) : null))
                .Where(o => o.Order is not null)
                .ToDictionary(o => o.Folder, o => o.Order!, StringComparer.Ordinal);

            return PageTreeBuilder.Build(blobs.Keys, titles, folder => orders.GetValueOrDefault(folder));
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
