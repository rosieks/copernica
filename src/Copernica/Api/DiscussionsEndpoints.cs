using Copernica.Auth;
using Copernica.Discussions;
using Copernica.Spaces;

namespace Copernica.Api;

public sealed record CreateDiscussionRequest(string? Path, AnchorInput? Anchor, string? Body);

public sealed record CommentRequest(string? Body);

public sealed record StateRequest(string? State);

/// <summary>Discussions API (contracts/openapi.yaml); every call checks read access to the space (FR-025).</summary>
public static class DiscussionsEndpoints
{
    public static RouteGroupBuilder MapDiscussionsEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/spaces/{spaceId}/discussions", ListAsync);
        api.MapPost("/spaces/{spaceId}/discussions", CreateAsync);
        api.MapPost("/discussions/{discussionId:guid}/comments", ReplyAsync);
        api.MapPatch("/discussions/{discussionId:guid}/comments/{commentId:guid}", EditAsync);
        api.MapDelete("/discussions/{discussionId:guid}/comments/{commentId:guid}", DeleteAsync);
        api.MapPut("/discussions/{discussionId:guid}/state", SetStateAsync);
        return api;
    }

    private static async Task<IResult> ListAsync(string spaceId, string? path, string? state, HttpContext context, PermissionService permissions, DiscussionService discussions)
    {
        var access = await permissions.RequireReadAsync(context, spaceId);
        if (access.Problem is not null)
        {
            return access.Problem;
        }

        if (!SpacePaths.TryNormalizePage(path, out var normalized))
        {
            return ProblemTypes.BadRequest("A page path is required.");
        }

        return Results.Ok(await discussions.ListAsync(access.Space!, normalized, state ?? "open", access.User!, context.RequestAborted));
    }

    private static async Task<IResult> CreateAsync(string spaceId, CreateDiscussionRequest request, HttpContext context, PermissionService permissions, DiscussionService discussions)
    {
        var access = await permissions.RequireReadAsync(context, spaceId);
        if (access.Problem is not null)
        {
            return access.Problem;
        }

        if (!SpacePaths.TryNormalizePage(request.Path, out var normalized) || request.Anchor is null)
        {
            return ProblemTypes.BadRequest("A page path and a selected fragment are required.");
        }

        var result = await discussions.CreateAsync(access.Space!, normalized, request.Anchor, request.Body, access.User!, context.RequestAborted);
        return result is DiscussionResult.Ok ok ? Results.Created($"/api/discussions/{ok.Discussion.Id}", ok.Discussion) : ToHttp(result);
    }

    private static Task<IResult> ReplyAsync(Guid discussionId, CommentRequest request, HttpContext context, PermissionService permissions, DiscussionService discussions) =>
        WithDiscussionAsync(discussionId, context, permissions, discussions, async (discussion, user) =>
        {
            var result = await discussions.ReplyAsync(discussion, request.Body, user, context.RequestAborted);
            return result is DiscussionResult.CommentOk ok ? Results.Created($"/api/discussions/{discussionId}/comments/{ok.Comment.Id}", ok.Comment) : ToHttp(result);
        });

    private static Task<IResult> EditAsync(Guid discussionId, Guid commentId, CommentRequest request, HttpContext context, PermissionService permissions, DiscussionService discussions) =>
        WithDiscussionAsync(discussionId, context, permissions, discussions, async (discussion, user) =>
            ToHttp(await discussions.EditCommentAsync(discussion, commentId, request.Body, user, context.RequestAborted)));

    private static Task<IResult> DeleteAsync(Guid discussionId, Guid commentId, HttpContext context, PermissionService permissions, DiscussionService discussions) =>
        WithDiscussionAsync(discussionId, context, permissions, discussions, async (discussion, user) =>
            ToHttp(await discussions.DeleteCommentAsync(discussion, commentId, user, context.RequestAborted)));

    private static Task<IResult> SetStateAsync(Guid discussionId, StateRequest request, HttpContext context, PermissionService permissions, DiscussionService discussions) =>
        WithDiscussionAsync(discussionId, context, permissions, discussions, async (discussion, user) =>
            ToHttp(await discussions.SetStateAsync(discussion, request.State, user, context.RequestAborted)));

    private static async Task<IResult> WithDiscussionAsync(
        Guid discussionId,
        HttpContext context,
        PermissionService permissions,
        DiscussionService discussions,
        Func<Discussion, CurrentUser, Task<IResult>> action)
    {
        var discussion = await discussions.FindAsync(discussionId, context.RequestAborted);
        if (discussion is null)
        {
            return ProblemTypes.NotFound();
        }

        var access = await permissions.RequireReadAsync(context, discussion.SpaceId);
        return access.Problem ?? await action(discussion, access.User!);
    }

    private static IResult ToHttp(DiscussionResult result) => result switch
    {
        DiscussionResult.Ok ok => Results.Ok(ok.Discussion),
        DiscussionResult.CommentOk ok => Results.Ok(ok.Comment),
        DiscussionResult.Deleted => Results.NoContent(),
        DiscussionResult.NotFound => ProblemTypes.NotFound(),
        DiscussionResult.Invalid invalid => ProblemTypes.BadRequest(invalid.Message),
        DiscussionResult.AnchorNotFound => Results.Problem(
            title: "The selected text was not found in this version of the page.",
            detail: "Reload the page and select the text again.",
            statusCode: StatusCodes.Status422UnprocessableEntity,
            type: ProblemTypes.For("anchor-not-found")),
        DiscussionResult.NotAuthor => ProblemTypes.Forbidden("not-comment-author", "Only the author can change this comment."),
        _ => throw new InvalidOperationException($"Unexpected result {result}."),
    };
}
