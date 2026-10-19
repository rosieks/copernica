using Copernica.Auth;
using Copernica.Discussions;
using Copernica.Spaces;

namespace Copernica.Api;

public sealed record TreeMoveRequest(string? Base, string? Kind, string? From, string? To, string? Retitle, string? Message, bool? DryRun);

public sealed record TreeDeleteRequest(string? Base, string? Folder, int? ExpectedPageCount, string? Message, bool? DryRun);

public sealed record TreeReorderRequest(string? Base, string? Folder, string? Item, string? Before, string? Message);

public sealed record MovedItem(string From, string To);

/// <summary>Rename, move, delete and reorder pages and folders (005 contracts/api.md §1–3).</summary>
public static class TreeEndpoints
{
    public const int MaxTitleLength = 200;

    public static RouteGroupBuilder MapTreeEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/spaces/{spaceId}/tree/move", MoveAsync);
        api.MapPost("/spaces/{spaceId}/tree/delete", DeleteAsync);
        api.MapPost("/spaces/{spaceId}/tree/reorder", ReorderAsync);
        return api;
    }

    private static async Task<IResult> MoveAsync(
        string spaceId,
        TreeMoveRequest request,
        HttpContext context,
        PermissionService permissions,
        PageWriteService identities,
        TreeOperations operations,
        PageService pages,
        SpaceSynchronizer synchronizer,
        DiscussionService discussions)
    {
        var access = await permissions.RequireWriteAsync(context, spaceId);
        if (access.Problem is not null)
        {
            return access.Problem;
        }

        var dryRun = request.DryRun ?? false;
        var isFolder = request.Kind == TreeItemKind.Folder;
        if (request.Kind is not (TreeItemKind.Page or TreeItemKind.Folder))
        {
            return ProblemTypes.BadRequest("The kind must be “page” or “folder”.");
        }

        if (!(isFolder ? SpacePaths.TryNormalize(request.From, out var from) : SpacePaths.TryNormalizePage(request.From, out from)))
        {
            return ProblemTypes.BadRequest("The current path is invalid.");
        }

        if (!SpacePaths.TryNormalizeNamedPath(request.To, out var to))
        {
            return ProblemTypes.BadRequest(
                "The new name is invalid.",
                "Names cannot be empty, start or end with a space, contain / \\ < > : \" | ? * or control characters, or be “.order”; page names end in .md.");
        }

        if (PageTreeBuilder.IsPage(to) != !isFolder)
        {
            return ProblemTypes.BadRequest(isFolder ? "Folder names cannot end in .md." : "Page names end in .md.");
        }

        var retitle = request.Retitle?.Trim();
        if (retitle is { Length: > 0 } && (isFolder || retitle.Length > MaxTitleLength || retitle.Any(char.IsControl)))
        {
            return ProblemTypes.BadRequest($"The title must be a single line of at most {MaxTitleLength} characters.");
        }

        if (ValidateCommon(request.Base, request.Message, dryRun) is { } invalid)
        {
            return invalid;
        }

        var space = access.Space!;
        var operation = new MoveOperation(request.Base!, request.Kind!, from, to, retitle is { Length: > 0 } ? retitle : null, request.Message?.Trim() ?? "");
        if (dryRun)
        {
            var head = pages.GetHead(space);
            return head is null ? SpacesEndpoints.SpaceUnavailable(space) : ToResult(operations.PreviewMove(space, head, operation));
        }

        var identity = await identities.PrepareAsync(access, context.RequestAborted);
        if (identity.Problem is not null)
        {
            return identity.Problem;
        }

        var outcome = await operations.MoveAsync(space, operation, identity.Author!, identity.Credentials!, context.RequestAborted);
        if (outcome is TreeOutcome.Moved moved)
        {
            await synchronizer.MarkHeadAsync(space, moved.CommitId, context.RequestAborted);
            await discussions.ApplyMovesAsync(space, moved.Effects.Map, context.RequestAborted);
        }

        return ToResult(outcome);
    }

    private static async Task<IResult> DeleteAsync(
        string spaceId,
        TreeDeleteRequest request,
        HttpContext context,
        PermissionService permissions,
        PageWriteService identities,
        TreeOperations operations,
        PageService pages,
        SpaceSynchronizer synchronizer)
    {
        var access = await permissions.RequireWriteAsync(context, spaceId);
        if (access.Problem is not null)
        {
            return access.Problem;
        }

        var dryRun = request.DryRun ?? false;
        if (!SpacePaths.TryNormalize(request.Folder, out var folder))
        {
            return ProblemTypes.BadRequest("The folder path is invalid.");
        }

        if (!dryRun && request.ExpectedPageCount is null or < 0)
        {
            return ProblemTypes.BadRequest("The number of pages you confirmed deleting is required.");
        }

        if (ValidateCommon(request.Base, request.Message, dryRun) is { } invalid)
        {
            return invalid;
        }

        var space = access.Space!;
        var operation = new DeleteFolderOperation(request.Base!, folder, request.ExpectedPageCount, request.Message?.Trim() ?? "");
        if (dryRun)
        {
            var head = pages.GetHead(space);
            return head is null ? SpacesEndpoints.SpaceUnavailable(space) : ToResult(operations.PreviewDeleteFolder(space, head, operation));
        }

        var identity = await identities.PrepareAsync(access, context.RequestAborted);
        if (identity.Problem is not null)
        {
            return identity.Problem;
        }

        var outcome = await operations.DeleteFolderAsync(space, operation, identity.Author!, identity.Credentials!, context.RequestAborted);
        if (outcome is TreeOutcome.FolderDeleted deleted)
        {
            await synchronizer.MarkHeadAsync(space, deleted.CommitId, context.RequestAborted);
        }

        return ToResult(outcome);
    }

    private static async Task<IResult> ReorderAsync(
        string spaceId,
        TreeReorderRequest request,
        HttpContext context,
        PermissionService permissions,
        PageWriteService identities,
        TreeOperations operations,
        SpaceSynchronizer synchronizer)
    {
        var access = await permissions.RequireWriteAsync(context, spaceId);
        if (access.Problem is not null)
        {
            return access.Problem;
        }

        var folder = "";
        if (!string.IsNullOrEmpty(request.Folder) && !SpacePaths.TryNormalize(request.Folder, out folder))
        {
            return ProblemTypes.BadRequest("The folder path is invalid.");
        }

        if (string.IsNullOrEmpty(request.Item) || request.Item.Contains('/') || request.Before is { } before && (before.Length == 0 || before.Contains('/')))
        {
            return ProblemTypes.BadRequest("The item and the item it goes before must be names of children of the folder.");
        }

        if (request.Message is { Length: > PageWriteEndpoints.MaxMessageLength })
        {
            return ProblemTypes.BadRequest($"The change description can be at most {PageWriteEndpoints.MaxMessageLength} characters.");
        }

        if (ValidateBase(request.Base) is { } invalid)
        {
            return invalid;
        }

        var identity = await identities.PrepareAsync(access, context.RequestAborted);
        if (identity.Problem is not null)
        {
            return identity.Problem;
        }

        var space = access.Space!;
        var operation = new ReorderOperation(request.Base!, folder, request.Item, request.Before, request.Message?.Trim());
        var outcome = await operations.ReorderAsync(space, operation, identity.Author!, identity.Credentials!, context.RequestAborted);
        if (outcome is TreeOutcome.Reordered reordered)
        {
            await synchronizer.MarkHeadAsync(space, reordered.CommitId, context.RequestAborted);
        }

        return ToResult(outcome);
    }

    internal static IResult? ValidateBase(string? @base) =>
        @base is null || !PageService.IsCommitId(@base) ? ProblemTypes.BadRequest("The version the tree was loaded at is required.") : null;

    internal static IResult? ValidateCommon(string? @base, string? message, bool dryRun)
    {
        if (ValidateBase(@base) is { } invalid)
        {
            return invalid;
        }

        var trimmed = message?.Trim() ?? "";
        if (!dryRun && trimmed.Length is 0 or > PageWriteEndpoints.MaxMessageLength)
        {
            return ProblemTypes.BadRequest($"A change description of 1–{PageWriteEndpoints.MaxMessageLength} characters is required.");
        }

        return null;
    }

    internal static IResult ToResult(TreeOutcome outcome) => outcome switch
    {
        TreeOutcome.MovePreview preview => Results.Ok(new
        {
            moves = Roots(preview.Effects),
            pageCount = preview.Effects.PageCount,
            fileCount = preview.Effects.FileCount,
            linkingPages = preview.Effects.LinkingPages,
        }),
        TreeOutcome.Moved moved => Results.Ok(new
        {
            commitId = moved.CommitId,
            path = moved.Effects.Path,
            moves = Roots(moved.Effects),
            updatedPages = moved.Effects.LinkingPages,
        }),
        TreeOutcome.FolderPreview preview => Results.Ok(new { pageCount = preview.Contents.PageCount, fileCount = preview.Contents.FileCount }),
        TreeOutcome.FolderDeleted deleted => Results.Ok(new { commitId = deleted.CommitId, pageCount = deleted.Contents.PageCount }),
        TreeOutcome.Reordered reordered => Results.Ok(new { commitId = reordered.CommitId }),
        TreeOutcome.Invalid invalid => ProblemTypes.BadRequest(invalid.Title),
        TreeOutcome.InvalidMove invalid => Results.Problem(title: invalid.Title, statusCode: StatusCodes.Status400BadRequest, type: ProblemTypes.For("invalid-move")),
        TreeOutcome.TargetExists exists => Results.Problem(
            title: "An item with this name already exists.",
            detail: $"“{exists.Path}” already exists (names that differ only in letter case count as the same).",
            statusCode: StatusCodes.Status409Conflict,
            type: ProblemTypes.For("target-exists")),
        TreeOutcome.TreeChanged changed => Results.Problem(
            title: "The tree changed since you opened it.",
            detail: changed.Detail,
            statusCode: StatusCodes.Status409Conflict,
            type: ProblemTypes.For("tree-changed"),
            extensions: changed.PageCount is { } count ? new Dictionary<string, object?> { ["pageCount"] = count } : null),
        TreeOutcome.Rejected rejected => ProblemTypes.Forbidden("push-rejected", "The git hosting platform rejected the change.", rejected.Reason),
        TreeOutcome.HostingUnavailable unavailable => ProblemTypes.Unavailable("hosting-unavailable", "The git hosting platform is not available.", unavailable.Reason),
        _ => throw new InvalidOperationException($"Unexpected outcome {outcome}."),
    };

    private static IEnumerable<MovedItem> Roots(MoveEffects effects) => effects.Map.Roots.Select(r => new MovedItem(r.From, r.To));
}
