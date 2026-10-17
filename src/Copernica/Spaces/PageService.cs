using System.Text;
using Copernica.Configuration;
using Copernica.Git;
using Copernica.Rendering;
using LibGit2Sharp;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace Copernica.Spaces;

public sealed record PageVersionRef(string CommitId, string? BlobId);

/// <summary>A rendered page (contracts/openapi.yaml <c>Page</c>).</summary>
public sealed record PageDto(
    string SpaceId,
    string Path,
    string Title,
    string Html,
    string? Source,
    PageVersionRef Version,
    bool IsCurrent,
    bool TooLarge);

public enum PageLookupStatus
{
    Found,
    NotFound,
    SpaceUnavailable,
}

public sealed record PageLookup(PageLookupStatus Status, PageDto? Page = null);

public sealed class PageService(
    SpaceRegistry registry,
    MirrorRepository mirror,
    PageTreeService trees,
    MarkdownRenderer renderer,
    IMemoryCache cache,
    IOptions<CopernicaOptions> options)
{
    /// <summary>Current branch tip of the space, or null if the space has no content yet.</summary>
    public string? GetHead(Space space)
    {
        return registry.GetStatus(space).HeadCommit ?? SafeHead(space);
    }

    public PageLookup GetPage(Space space, string path, string? version, bool includeSource)
    {
        var head = GetHead(space);
        if (head is null)
        {
            return new PageLookup(PageLookupStatus.SpaceUnavailable);
        }

        if (!string.IsNullOrEmpty(version) && !IsCommitId(version))
        {
            return new PageLookup(PageLookupStatus.NotFound);
        }

        var commitId = string.IsNullOrEmpty(version) ? head : version;
        GitBlob? blob;
        try
        {
            blob = mirror.ReadBlob(space, commitId, space.ToRepositoryPath(path));
        }
        catch (Exception ex) when (ex is LibGit2SharpException or ArgumentException)
        {
            return new PageLookup(PageLookupStatus.NotFound);
        }

        if (blob is null)
        {
            return new PageLookup(PageLookupStatus.NotFound);
        }

        var content = Encoding.UTF8.GetString(blob.Content);
        var tooLarge = blob.Content.LongLength > options.Value.MaxRenderBytes;
        var html = tooLarge ? "" : Render(space, path, commitId, blob.Id, content);
        var title = tooLarge ? PageTitle.FromFileName(path) : PageTitle.Resolve(content, path);

        return new PageLookup(PageLookupStatus.Found, new PageDto(
            space.Id,
            path,
            title,
            html,
            includeSource && !tooLarge ? content : null,
            new PageVersionRef(commitId, blob.Id),
            IsCurrent: commitId == head,
            TooLarge: tooLarge));
    }

    /// <summary>Plain text of the rendered page at <paramref name="commitId"/> (discussion anchors), or null if missing.</summary>
    public string? GetPlainText(Space space, string path, string commitId)
    {
        var lookup = GetPage(space, path, commitId, includeSource: false);
        if (lookup.Page is not { TooLarge: false } page)
        {
            return null;
        }

        return cache.GetOrCreate((nameof(GetPlainText), space.Id, page.Version.CommitId, page.Version.BlobId, path), entry =>
        {
            entry.SlidingExpiration = TimeSpan.FromMinutes(10);
            return PlainTextExtractor.Extract(page.Html);
        });
    }

    /// <summary>Renders arbitrary Markdown as if it were the page at <paramref name="path"/> (editor preview).</summary>
    public string RenderPreview(Space space, string path, string markdown)
    {
        var head = GetHead(space) ?? "";
        var pages = head.Length == 0 ? new HashSet<string>() : trees.GetPagePaths(space, head);
        return renderer.Render(markdown, new WikiLinkRewriter(space.Id, path, head, pages.Contains));
    }

    private string Render(Space space, string path, string commitId, string blobId, string content) =>
        cache.GetOrCreate((nameof(PageService), space.Id, commitId, blobId, path), entry =>
        {
            entry.SlidingExpiration = TimeSpan.FromMinutes(10);
            var pages = trees.GetPagePaths(space, commitId);
            return renderer.Render(content, new WikiLinkRewriter(space.Id, path, commitId, pages.Contains));
        })!;

    /// <summary>Only full hexadecimal object ids are accepted as versions (no revision expressions).</summary>
    public static bool IsCommitId(string value) =>
        value.Length is 40 or 64 && value.All(c => char.IsAsciiHexDigitLower(c) || char.IsAsciiDigit(c));

    private string? SafeHead(Space space)
    {
        try
        {
            return Repository.IsValid(space.MirrorPath) ? mirror.GetHead(space) : null;
        }
        catch (LibGit2SharpException)
        {
            return null;
        }
    }
}
