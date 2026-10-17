using Copernica.Hosting;
using Copernica.Spaces;
using LibGit2Sharp;
using LibGit2Sharp.Handlers;

namespace Copernica.Git;

/// <summary>
/// Bare mirror of a space's repository on the data volume (research.md R2). LibGit2Sharp
/// <see cref="Repository"/> instances are not thread-safe, so every operation opens its own.
/// Reads always take an explicit commit id.
/// </summary>
public sealed class MirrorRepository
{
    public const string RemoteName = "origin";

    private static readonly Signature SystemSignature = new("Copernica", "copernica@localhost", DateTimeOffset.UnixEpoch);

    /// <summary>Creates the mirror if needed (bare repository with remote, or a local-only repository with an empty first commit).</summary>
    public void EnsureInitialized(Space space)
    {
        if (!Repository.IsValid(space.MirrorPath))
        {
            Directory.CreateDirectory(space.MirrorPath);
            Repository.Init(space.MirrorPath, isBare: true);
        }

        using var repo = new Repository(space.MirrorPath);
        if (space.HasRemote)
        {
            var remote = repo.Network.Remotes[RemoteName];
            if (remote is null)
            {
                repo.Network.Remotes.Add(RemoteName, NormalizeRemoteUrl(space.RemoteUrl!));
            }
            else if (remote.Url != NormalizeRemoteUrl(space.RemoteUrl!))
            {
                repo.Network.Remotes.Update(RemoteName, r => r.Url = NormalizeRemoteUrl(space.RemoteUrl!));
            }
        }
        else if (repo.Refs[space.TrackingRef] is null)
        {
            var tree = repo.ObjectDatabase.CreateTree(new TreeDefinition());
            var commit = repo.ObjectDatabase.CreateCommit(SystemSignature, SystemSignature, "Initialize wiki space\n", tree, [], prettifyMessage: false);
            repo.Refs.Add(space.TrackingRef, commit.Id);
            repo.Refs.UpdateTarget("HEAD", space.TrackingRef);
        }
    }

    /// <summary>Fetches the space branch into <see cref="Space.TrackingRef"/>. No-op for local-only spaces.</summary>
    public void Fetch(Space space, GitCredentials credentials)
    {
        if (!space.HasRemote)
        {
            return;
        }

        using var repo = new Repository(space.MirrorPath);
        var options = new FetchOptions { Prune = false, TagFetchMode = TagFetchMode.None };
        Apply(credentials, options);
        Commands.Fetch(repo, RemoteName, [$"+refs/heads/{space.Branch}:{space.TrackingRef}"], options, logMessage: null);

        if (repo.Refs[space.TrackingRef] is null)
        {
            throw new GitBranchNotFoundException($"Branch '{space.Branch}' does not exist in the remote repository.");
        }
    }

    public string? GetHead(Space space)
    {
        using var repo = new Repository(space.MirrorPath);
        return repo.Refs[space.TrackingRef]?.ResolveToDirectReference()?.TargetIdentifier;
    }

    /// <summary>Returns the blob at <paramref name="repositoryPath"/> in <paramref name="commitId"/>, or null.</summary>
    public GitBlob? ReadBlob(Space space, string commitId, string repositoryPath)
    {
        using var repo = new Repository(space.MirrorPath);
        var commit = repo.Lookup<Commit>(commitId);
        if (commit?[repositoryPath]?.Target is not Blob blob)
        {
            return null;
        }

        using var stream = blob.GetContentStream();
        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        return new GitBlob(blob.Sha, buffer.ToArray());
    }

    /// <summary>Reads many blobs by id in one repository session (page tree titles).</summary>
    public IReadOnlyDictionary<string, byte[]> ReadBlobs(Space space, IEnumerable<string> blobIds)
    {
        using var repo = new Repository(space.MirrorPath);
        var result = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        foreach (var id in blobIds)
        {
            if (result.ContainsKey(id) || repo.Lookup<Blob>(id) is not { } blob)
            {
                continue;
            }

            using var stream = blob.GetContentStream();
            using var buffer = new MemoryStream();
            stream.CopyTo(buffer);
            result[id] = buffer.ToArray();
        }

        return result;
    }

    /// <summary>Returns blob metadata without loading content, or null.</summary>
    public GitBlobInfo? FindBlob(Space space, string commitId, string repositoryPath)
    {
        using var repo = new Repository(space.MirrorPath);
        var commit = repo.Lookup<Commit>(commitId);
        return commit?[repositoryPath]?.Target is Blob blob ? new GitBlobInfo(blob.Sha, blob.Size) : null;
    }

    /// <summary>Lists all blobs below <paramref name="folder"/> (repository-relative paths).</summary>
    public IReadOnlyList<GitBlobInfoWithPath> ListBlobs(Space space, string commitId, string folder)
    {
        using var repo = new Repository(space.MirrorPath);
        var commit = repo.Lookup<Commit>(commitId);
        if (commit is null)
        {
            return [];
        }

        var root = folder.Length == 0 ? commit.Tree : commit[folder]?.Target as Tree;
        var result = new List<GitBlobInfoWithPath>();
        if (root is not null)
        {
            Walk(root, folder, result);
        }

        return result;
    }

    /// <summary>New repository path of <paramref name="repositoryPath"/> if it was renamed between the commits.</summary>
    public string? FindRename(Space space, string fromCommit, string toCommit, string repositoryPath)
    {
        using var repo = new Repository(space.MirrorPath);
        if (repo.Lookup<Commit>(fromCommit) is not { } from || repo.Lookup<Commit>(toCommit) is not { } to)
        {
            return null;
        }

        var changes = repo.Diff.Compare<TreeChanges>(from.Tree, to.Tree, new CompareOptions { Similarity = SimilarityOptions.Renames });
        return changes.Renamed.FirstOrDefault(c => c.OldPath == repositoryPath)?.Path;
    }

    internal static void Apply(GitCredentials credentials, FetchOptions options)
    {
        if (credentials.BearerToken is { } token)
        {
            options.CustomHeaders = [$"Authorization: Bearer {token}"];
        }
        else if (credentials.Username is not null)
        {
            options.CredentialsProvider = Basic(credentials);
        }
    }

    internal static void Apply(GitCredentials credentials, PushOptions options)
    {
        if (credentials.BearerToken is { } token)
        {
            options.CustomHeaders = [$"Authorization: Bearer {token}"];
        }
        else if (credentials.Username is not null)
        {
            options.CredentialsProvider = Basic(credentials);
        }
    }

    /// <summary>libgit2 accepts native paths, but forward slashes avoid escaping issues on Windows.</summary>
    internal static string NormalizeRemoteUrl(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri) && !uri.IsFile)
        {
            return url;
        }

        var local = uri is { IsFile: true } && url.StartsWith("file:", StringComparison.OrdinalIgnoreCase) ? uri.LocalPath : url;
        return Path.GetFullPath(local).Replace('\\', '/');
    }

    private static CredentialsHandler Basic(GitCredentials credentials) =>
        (_, _, _) => new UsernamePasswordCredentials { Username = credentials.Username, Password = credentials.Password ?? "" };

    private static void Walk(Tree tree, string prefix, List<GitBlobInfoWithPath> result)
    {
        foreach (var entry in tree)
        {
            var path = prefix.Length == 0 ? entry.Name : $"{prefix}/{entry.Name}";
            switch (entry.Target)
            {
                case Tree child:
                    Walk(child, path, result);
                    break;
                case Blob blob:
                    result.Add(new GitBlobInfoWithPath(path, blob.Sha, blob.Size));
                    break;
            }
        }
    }
}

public sealed record GitBlob(string Id, byte[] Content);

public sealed record GitBlobInfo(string Id, long Size);

public sealed record GitBlobInfoWithPath(string Path, string Id, long Size);

public sealed class GitBranchNotFoundException(string message) : Exception(message);
