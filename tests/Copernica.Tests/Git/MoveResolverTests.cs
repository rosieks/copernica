using Copernica.Configuration;
using Copernica.Git;
using Copernica.Spaces;
using LibGit2Sharp;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace Copernica.Tests.Git;

public sealed class MoveResolverTests : IDisposable
{
    private const string Long = "# Page\n\nA long enough body so that rename detection recognises the file.\nLine two.\nLine three.\n";

    private readonly string _data = Path.Combine(Path.GetTempPath(), "copernica-unit-" + Guid.NewGuid().ToString("N"));
    private readonly Space _space;
    private readonly MoveResolver _resolver = new(new MemoryCache(new MemoryCacheOptions()));
    private readonly TestHistory _history;

    public MoveResolverTests()
    {
        var options = Options.Create(new CopernicaOptions { DataDirectory = _data, Spaces = [new SpaceOptions { Id = "wiki", Folder = "docs" }] });
        _space = new SpaceRegistry(options).Find("wiki")!;
        new MirrorRepository().EnsureInitialized(_space);
        _history = new TestHistory(_space);
    }

    private string Commit(IReadOnlyDictionary<string, string?> files, string message = "Change") => _history.Commit(files, message);

    private string Head() => _history.Head();

    [Fact]
    public void Existing_page_resolves_to_itself()
    {
        Commit(new Dictionary<string, string?> { ["a.md"] = Long });

        Assert.IsType<MoveResolution.Exists>(_resolver.Resolve(_space, Head(), "a.md"));
    }

    [Fact]
    public void Trailer_move_is_followed_even_when_content_changed_completely()
    {
        Commit(new Dictionary<string, string?> { ["tiny.md"] = "[s](setup.md)\n" });
        var move = Commit(new Dictionary<string, string?> { ["tiny.md"] = null, ["archive/tiny.md"] = "[s](../setup.md)\n" },
            MoveTrailers.Append("Move", [new MoveRecord("tiny.md", "archive/tiny.md", false)]));

        var moved = Assert.IsType<MoveResolution.Moved>(_resolver.Resolve(_space, Head(), "tiny.md"));

        Assert.Equal(("archive/tiny.md", move), (moved.Path, moved.MovedIn));
    }

    [Fact]
    public void Rename_without_trailer_is_found_by_rename_detection()
    {
        Commit(new Dictionary<string, string?> { ["a.md"] = Long });
        Commit(new Dictionary<string, string?> { ["a.md"] = null, ["b.md"] = Long }, "Renamed with plain git");

        Assert.Equal("b.md", Assert.IsType<MoveResolution.Moved>(_resolver.Resolve(_space, Head(), "a.md")).Path);
    }

    [Fact]
    public void Folder_trailer_maps_pages_inside_it()
    {
        Commit(new Dictionary<string, string?> { ["guides/x/setup.md"] = "x" });
        Commit(new Dictionary<string, string?> { ["guides/x/setup.md"] = null, ["docs2/setup.md"] = "y" },
            MoveTrailers.Append("Move folder", [new MoveRecord("guides/x", "docs2", true)]));

        Assert.Equal("docs2/setup.md", Assert.IsType<MoveResolution.Moved>(_resolver.Resolve(_space, Head(), "guides/x/setup.md")).Path);
    }

    [Fact]
    public void Chains_of_moves_are_followed()
    {
        Commit(new Dictionary<string, string?> { ["a.md"] = "1" });
        Commit(new Dictionary<string, string?> { ["a.md"] = null, ["b.md"] = "2" }, MoveTrailers.Append("m", [new MoveRecord("a.md", "b.md", false)]));
        Commit(new Dictionary<string, string?> { ["b.md"] = null, ["c.md"] = "3" }, MoveTrailers.Append("m", [new MoveRecord("b.md", "c.md", false)]));
        Commit(new Dictionary<string, string?> { ["c.md"] = null, ["d/c.md"] = "4" }, MoveTrailers.Append("m", [new MoveRecord("c.md", "d/c.md", false)]));

        Assert.Equal("d/c.md", Assert.IsType<MoveResolution.Moved>(_resolver.Resolve(_space, Head(), "a.md")).Path);
        Assert.Equal("d/c.md", Assert.IsType<MoveResolution.Moved>(_resolver.Resolve(_space, Head(), "b.md")).Path);
    }

    [Fact]
    public void Cycles_stop_the_walk()
    {
        Commit(new Dictionary<string, string?> { ["a.md"] = "1", ["b.md"] = "2" });
        Commit(new Dictionary<string, string?> { ["a.md"] = null }, MoveTrailers.Append("m", [new MoveRecord("a.md", "b.md", false)]));
        Commit(new Dictionary<string, string?> { ["b.md"] = null }, MoveTrailers.Append("m", [new MoveRecord("b.md", "a.md", false)]));

        Assert.IsType<MoveResolution.Unknown>(_resolver.Resolve(_space, Head(), "a.md"));
    }

    [Fact]
    public void Hop_limit_is_respected()
    {
        Commit(new Dictionary<string, string?> { ["p0.md"] = "0" });
        for (var i = 0; i < MoveResolver.MaxHops + 1; i++)
        {
            Commit(new Dictionary<string, string?> { [$"p{i}.md"] = null, [$"p{i + 1}.md"] = $"{i + 1}" },
                MoveTrailers.Append("m", [new MoveRecord($"p{i}.md", $"p{i + 1}.md", false)]));
        }

        Assert.IsType<MoveResolution.Unknown>(_resolver.Resolve(_space, Head(), "p0.md"));
        Assert.IsType<MoveResolution.Moved>(_resolver.Resolve(_space, Head(), "p2.md"));
    }

    [Fact]
    public void Deleted_page_reports_the_deleting_commit()
    {
        Commit(new Dictionary<string, string?> { ["gone.md"] = Long });
        var deletion = Commit(new Dictionary<string, string?> { ["gone.md"] = null }, "Delete");

        Assert.Equal(deletion, Assert.IsType<MoveResolution.Deleted>(_resolver.Resolve(_space, Head(), "gone.md")).DeletedIn);
    }

    [Fact]
    public void Path_that_never_existed_is_unknown()
    {
        Commit(new Dictionary<string, string?> { ["a.md"] = "1" });

        Assert.IsType<MoveResolution.Unknown>(_resolver.Resolve(_space, Head(), "never.md"));
    }

    [Fact]
    public void Previous_path_comes_from_the_trailer_of_the_adding_commit()
    {
        Commit(new Dictionary<string, string?> { ["g/a.md"] = "1" });
        var sha = Commit(new Dictionary<string, string?> { ["g/a.md"] = null, ["h/a.md"] = "2" },
            MoveTrailers.Append("m", [new MoveRecord("g", "h", true)]));
        using var repo = new Repository(_space.MirrorPath);

        Assert.Equal("g/a.md", MoveResolver.PreviousPath(repo.Lookup<LibGit2Sharp.Commit>(sha), "h/a.md"));
        Assert.Null(MoveResolver.PreviousPath(repo.Lookup<LibGit2Sharp.Commit>(sha), "other.md"));
    }

    public void Dispose() => TestHistory.Delete(_data);
}

/// <summary>Writes commits of space paths straight into a local-only space mirror.</summary>
internal sealed class TestHistory(Space space)
{
    private static readonly Signature Author = new("Alice", "alice@example.test", DateTimeOffset.Parse("2026-01-01T00:00:00Z"));

    /// <summary>Commits changes to space paths; null deletes.</summary>
    public string Commit(IReadOnlyDictionary<string, string?> files, string message = "Change")
    {
        using var repo = new Repository(space.MirrorPath);
        var parent = repo.Lookup<LibGit2Sharp.Commit>(repo.Refs[space.TrackingRef].ResolveToDirectReference().TargetIdentifier);
        var definition = TreeDefinition.From(parent.Tree);
        foreach (var (path, content) in files)
        {
            var target = space.ToRepositoryPath(path);
            if (content is null)
            {
                definition.Remove(target);
            }
            else
            {
                definition.Add(target, repo.ObjectDatabase.CreateBlob(new MemoryStream(System.Text.Encoding.UTF8.GetBytes(content))), Mode.NonExecutableFile);
            }
        }

        var commit = repo.ObjectDatabase.CreateCommit(Author, Author, message, repo.ObjectDatabase.CreateTree(definition), [parent], prettifyMessage: false);
        repo.Refs.UpdateTarget(repo.Refs[space.TrackingRef], commit.Id);
        return commit.Sha;
    }

    public string Head()
    {
        using var repo = new Repository(space.MirrorPath);
        return repo.Refs[space.TrackingRef].ResolveToDirectReference().TargetIdentifier;
    }

    public static void Delete(string directory)
    {
        try
        {
            foreach (var file in Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories))
            {
                File.SetAttributes(file, FileAttributes.Normal);
            }

            Directory.Delete(directory, recursive: true);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }
}
