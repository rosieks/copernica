using LibGit2Sharp;

namespace Copernica.IntegrationTests.Infrastructure;

/// <summary>
/// A temporary bare repository acting as the "remote" of a space. Commits made here simulate
/// changes pushed by people using plain git outside the wiki.
/// </summary>
public sealed class TestRemote : IDisposable
{
    private static readonly Signature Outsider = new("Outside Author", "outside@example.test", DateTimeOffset.Parse("2026-01-01T00:00:00Z"));

    public TestRemote(string branch = "main", bool bare = true)
    {
        Branch = branch;
        Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "copernica-remote-" + Guid.NewGuid().ToString("N"));
        // Antivirus scanners on Windows occasionally lock fresh git config files; retry briefly.
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                Repository.Init(Path, isBare: bare);
                break;
            }
            catch (LibGit2SharpException) when (attempt < 5)
            {
                Thread.Sleep(100 * attempt);
            }
        }

        IsBare = bare;
    }

    public string Path { get; }

    public string Branch { get; }

    public bool IsBare { get; }

    /// <summary>Commits the given files (null content deletes) on top of the branch tip.</summary>
    public string Commit(IReadOnlyDictionary<string, string?> files, string message = "Outside change", Signature? author = null)
    {
        using var repo = new Repository(Path);
        var parent = repo.Branches[Branch]?.Tip;
        var definition = parent is null ? new TreeDefinition() : TreeDefinition.From(parent.Tree);
        foreach (var (path, content) in files)
        {
            if (content is null)
            {
                definition.Remove(path);
            }
            else
            {
                var blob = repo.ObjectDatabase.CreateBlob(new MemoryStream(System.Text.Encoding.UTF8.GetBytes(content)));
                definition.Add(path, blob, Mode.NonExecutableFile);
            }
        }

        var tree = repo.ObjectDatabase.CreateTree(definition);
        var signature = author ?? Outsider;
        var commit = repo.ObjectDatabase.CreateCommit(signature, signature, message, tree, parent is null ? [] : [parent], prettifyMessage: true);
        var refName = $"refs/heads/{Branch}";
        if (repo.Refs[refName] is null)
        {
            repo.Refs.Add(refName, commit.Id);
        }
        else
        {
            repo.Refs.UpdateTarget(repo.Refs[refName], commit.Id);
        }

        if (repo.Head.Tip is null)
        {
            repo.Refs.UpdateTarget("HEAD", refName);
        }

        return commit.Sha;
    }

    public string Commit(string path, string content, string message = "Outside change") =>
        Commit(new Dictionary<string, string?> { [path] = content }, message);

    public (string Sha, int ParentCount) Tip()
    {
        using var repo = new Repository(Path);
        var tip = repo.Branches[Branch].Tip;
        return (tip.Sha, tip.Parents.Count());
    }

    public IReadOnlyList<(string Sha, string AuthorName, string AuthorEmail, string Message)> Log()
    {
        using var repo = new Repository(Path);
        return repo.Commits.QueryBy(new CommitFilter { IncludeReachableFrom = $"refs/heads/{Branch}" })
            .Select(c => (c.Sha, c.Author.Name, c.Author.Email, c.MessageShort))
            .ToList();
    }

    public string? ReadFile(string path)
    {
        using var repo = new Repository(Path);
        return repo.Branches[Branch]?.Tip?[path]?.Target is Blob blob ? blob.GetContentText() : null;
    }

    public void Dispose()
    {
        try
        {
            DeleteDirectory(Path);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    internal static void DeleteDirectory(string path)
    {
        if (!Directory.Exists(path))
        {
            return;
        }

        // git object files are read-only on Windows.
        foreach (var file in Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories))
        {
            File.SetAttributes(file, FileAttributes.Normal);
        }

        Directory.Delete(path, recursive: true);
    }
}
