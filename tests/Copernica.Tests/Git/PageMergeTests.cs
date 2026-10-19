using Copernica.Configuration;
using Copernica.Git;
using Copernica.Hosting;
using Copernica.Spaces;
using LibGit2Sharp;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Copernica.Tests.Git;

/// <summary>Three-way merge behaviour of <see cref="PageWriter"/> on a space without remote (research.md R5).</summary>
public sealed class PageMergeTests : IDisposable
{
    private const string Original = "# Page\n\nOne.\n\nTwo.\n\nThree.\n";

    private readonly string _data = Path.Combine(Path.GetTempPath(), "copernica-unit-" + Guid.NewGuid().ToString("N"));
    private readonly Space _space;
    private readonly SpaceRegistry _registry;
    private readonly MirrorRepository _mirror = new();
    private readonly PageWriter _writer;
    private readonly CommitAuthor _alice = new("Alice", "alice@example.test");
    private readonly CommitAuthor _bob = new("Bob", "bob@example.test");

    public PageMergeTests()
    {
        var options = Options.Create(new CopernicaOptions { DataDirectory = _data, Spaces = [new SpaceOptions { Id = "wiki" }] });
        _registry = new SpaceRegistry(options);
        _space = _registry.Find("wiki")!;
        _mirror.EnsureInitialized(_space);
        var repositoryWriter = new RepositoryWriter(_registry, _mirror, TimeProvider.System, NullLogger<RepositoryWriter>.Instance);
        _writer = new PageWriter(repositoryWriter, new MoveResolver(new Microsoft.Extensions.Caching.Memory.MemoryCache(new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions())));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<PageVersionRef> CreateAsync()
    {
        var created = await _writer.SaveAsync(_space, new PageChange("page.md", Original, "Create", null), _alice, GitCredentials.None, Ct);
        return Assert.IsType<SaveOutcome.Saved>(created).Version;
    }

    [Fact]
    public async Task Non_overlapping_edits_merge_into_one_single_parent_commit()
    {
        var @base = await CreateAsync();
        await _writer.SaveAsync(_space, new PageChange("page.md", Original.Replace("One.", "ONE."), "Alice", @base), _alice, GitCredentials.None, Ct);

        var outcome = await _writer.SaveAsync(_space, new PageChange("page.md", Original.Replace("Three.", "THREE."), "Bob", @base), _bob, GitCredentials.None, Ct);

        var saved = Assert.IsType<SaveOutcome.Saved>(outcome);
        Assert.True(saved.Merged);
        using var repo = new Repository(_space.MirrorPath);
        var tip = repo.Lookup<Commit>(saved.Version.CommitId);
        Assert.Single(tip.Parents);
        Assert.Equal(("Bob", "Bob\n"), (tip.Author.Name, tip.Message));
        var content = ((Blob)tip["page.md"].Target).GetContentText();
        Assert.Contains("ONE.", content);
        Assert.Contains("THREE.", content);
    }

    [Fact]
    public async Task Same_line_edits_conflict_with_all_three_sources()
    {
        var @base = await CreateAsync();
        await _writer.SaveAsync(_space, new PageChange("page.md", Original.Replace("Two.", "Alice two."), "Alice", @base), _alice, GitCredentials.None, Ct);

        var outcome = await _writer.SaveAsync(_space, new PageChange("page.md", Original.Replace("Two.", "Bob two."), "Bob", @base), _bob, GitCredentials.None, Ct);

        var conflict = Assert.IsType<SaveOutcome.Conflict>(outcome);
        Assert.Equal(Original, conflict.BaseSource);
        Assert.Contains("Alice two.", conflict.TheirsSource);
        Assert.Contains("Bob two.", conflict.MineSource);
        Assert.Equal(["Alice"], conflict.TheirsAuthors);
    }

    [Fact]
    public async Task Delete_versus_edit_conflicts()
    {
        var @base = await CreateAsync();
        await _writer.SaveAsync(_space, new PageChange("page.md", Original + "More.\n", "Alice", @base), _alice, GitCredentials.None, Ct);

        var outcome = await _writer.SaveAsync(_space, new PageChange("page.md", null, "Bob deletes", @base), _bob, GitCredentials.None, Ct);

        Assert.IsType<SaveOutcome.Conflict>(outcome);
    }

    [Fact]
    public async Task Change_to_another_page_merges_cleanly()
    {
        var @base = await CreateAsync();
        await _writer.SaveAsync(_space, new PageChange("other.md", "# Other\n", "Alice adds", null), _alice, GitCredentials.None, Ct);

        var outcome = await _writer.SaveAsync(_space, new PageChange("page.md", Original + "Bob.\n", "Bob", @base), _bob, GitCredentials.None, Ct);

        Assert.True(Assert.IsType<SaveOutcome.Saved>(outcome).Merged);
    }

    [Fact]
    public async Task Saving_identical_content_creates_no_commit()
    {
        var @base = await CreateAsync();

        var outcome = await _writer.SaveAsync(_space, new PageChange("page.md", Original, "No-op", @base), _alice, GitCredentials.None, Ct);

        Assert.Equal(@base.CommitId, Assert.IsType<SaveOutcome.Saved>(outcome).Version.CommitId);
    }

    public void Dispose()
    {
        if (!Directory.Exists(_data))
        {
            return;
        }

        foreach (var file in Directory.EnumerateFiles(_data, "*", SearchOption.AllDirectories))
        {
            File.SetAttributes(file, FileAttributes.Normal);
        }

        Directory.Delete(_data, recursive: true);
    }
}
