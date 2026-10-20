using LibGit2Sharp;

namespace Copernica.Spaces;

/// <summary>A page or folder as shown in the tree, for ordering.</summary>
public sealed record TreeChild(string Name, bool IsPage)
{
    public string Entry => FolderOrder.EntryFor(Name, IsPage);
}

/// <summary>
/// Keeps the <c>.order</c> files of the folders an operation touches consistent, in the same
/// commit (005 research R8, FR-021). Reads come from <paramref name="commit"/>; writes go into
/// <paramref name="definition"/>. Folders without an order file are never given one here.
/// </summary>
public sealed class OrderFiles(Repository repo, Space space, Commit commit, TreeDefinition definition)
{
    private readonly Dictionary<string, FolderOrder?> _orders = new(StringComparer.Ordinal);

    public FolderOrder? Get(string folder)
    {
        if (!_orders.TryGetValue(folder, out var order))
        {
            order = commit[space.ToRepositoryPath(SpacePaths.Combine(folder, SpacePaths.OrderFileName))]?.Target is Blob { Size: <= FolderOrder.MaxBytes } blob
                ? FolderOrder.Parse(Read(blob))
                : null;
            _orders[folder] = order;
        }

        return order;
    }

    public void Set(string folder, FolderOrder order)
    {
        _orders[folder] = order;
        var blob = repo.ObjectDatabase.CreateBlob(new MemoryStream(order.ToBytes()));
        definition.Add(space.ToRepositoryPath(SpacePaths.Combine(folder, SpacePaths.OrderFileName)), blob, Mode.NonExecutableFile);
    }

    /// <summary>A new item in <paramref name="folder"/>: appended, as Azure DevOps Wiki does.</summary>
    public void Added(string folder, string entry)
    {
        if (Get(folder) is { } order && !Listed(order, entry))
        {
            Set(folder, order.Insert(entry));
        }
    }

    /// <summary>An item left <paramref name="folder"/>; its line goes unless another item still has the same entry.</summary>
    public void Removed(string folder, string entry, bool stillUsed)
    {
        if (!stillUsed && Get(folder) is { } order && Listed(order, entry))
        {
            Set(folder, order.Remove(entry));
        }
    }

    /// <summary>An item was renamed within <paramref name="folder"/>: its line changes in place.</summary>
    public void Renamed(string folder, string entry, string replacement, bool stillUsed)
    {
        if (Get(folder) is not { } order || !Listed(order, entry) || entry == replacement)
        {
            return;
        }

        if (stillUsed)
        {
            // The old line still names another item (a page and a folder of the same name).
            if (!Listed(order, replacement))
            {
                Set(folder, order.Insert(replacement));
            }
        }
        else if (Listed(order, replacement) && !string.Equals(entry, replacement, StringComparison.OrdinalIgnoreCase))
        {
            Set(folder, order.Remove(entry));
        }
        else
        {
            Set(folder, order.Replace(entry, replacement));
        }
    }

    /// <summary>The visible children of <paramref name="folder"/> at <paramref name="at"/>: pages and folders containing pages.</summary>
    public static IReadOnlyList<TreeChild> Children(Commit at, Space space, string folder)
    {
        var prefix = folder.Length == 0 ? "" : folder + "/";
        var result = new List<TreeChild>();
        var folders = new HashSet<string>(StringComparer.Ordinal);
        foreach (var path in PagePaths(at, space))
        {
            if (!path.StartsWith(prefix, StringComparison.Ordinal))
            {
                continue;
            }

            var rest = path[prefix.Length..];
            var slash = rest.IndexOf('/');
            if (slash < 0)
            {
                result.Add(new TreeChild(rest, IsPage: true));
            }
            else if (folders.Add(rest[..slash]))
            {
                result.Add(new TreeChild(rest[..slash], IsPage: false));
            }
        }

        return result;
    }

    /// <summary>File names of a folder's own page, which opens when the folder is clicked (like a README), in priority order.</summary>
    public static readonly string[] FolderPageNames = ["README.md", "index.md"];

    /// <summary>The page a folder opens with: README.md, else index.md (ignoring case); none for the space root.</summary>
    public static TreeChild? FolderPage(string folder, IEnumerable<TreeChild> children)
    {
        if (folder.Length == 0)
        {
            return null;
        }

        var pages = children.Where(c => c.IsPage).ToList();
        return FolderPageNames
            .Select(name => pages.FirstOrDefault(c => string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase)))
            .FirstOrDefault(c => c is not null);
    }

    /// <summary>Children in the order the tree shows them (folder order file, else folders then pages alphabetically).</summary>
    public IReadOnlyList<TreeChild> Ordered(string folder)
    {
        IReadOnlyList<TreeChild> children = Children(commit, space, folder)
            .OrderBy(c => c.IsPage ? 1 : 0)
            .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase).ThenBy(c => c.Name, StringComparer.Ordinal)
            .ToList();
        return Get(folder) is { } order ? order.Sort(children, c => c.Entry, c => c.IsPage) : children;
    }

    private static bool Listed(FolderOrder order, string entry) =>
        order.Entries.Any(e => string.Equals(e, entry, StringComparison.OrdinalIgnoreCase));

    private static IEnumerable<string> PagePaths(Commit at, Space space)
    {
        var root = space.Folder.Length == 0 ? at.Tree : at[space.Folder]?.Target as Tree;
        return root is null ? [] : Walk(root, "");

        static IEnumerable<string> Walk(Tree tree, string prefix)
        {
            foreach (var entry in tree)
            {
                var path = prefix.Length == 0 ? entry.Name : $"{prefix}/{entry.Name}";
                if (entry.Target is Tree child)
                {
                    foreach (var page in Walk(child, path))
                    {
                        yield return page;
                    }
                }
                else if (entry.Target is Blob && PageTreeBuilder.IsPage(path))
                {
                    yield return path;
                }
            }
        }
    }

    private static byte[] Read(Blob blob)
    {
        using var stream = blob.GetContentStream();
        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        return buffer.ToArray();
    }
}
