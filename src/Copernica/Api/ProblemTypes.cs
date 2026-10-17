namespace Copernica;

/// <summary>Stable problem <c>type</c> identifiers; the suffix is listed per endpoint in contracts/openapi.yaml.</summary>
public static class ProblemTypes
{
    public const string Base = "urn:copernica:problem:";

    public static string For(string suffix) => Base + suffix;

    public static IResult NotFound(string? detail = null) =>
        Results.Problem(title: "Not found.", detail: detail, statusCode: StatusCodes.Status404NotFound, type: For("not-found"));

    public static IResult Forbidden(string type, string title, string? detail = null) =>
        Results.Problem(title: title, detail: detail, statusCode: StatusCodes.Status403Forbidden, type: For(type));

    public static IResult BadRequest(string title, string? detail = null) =>
        Results.Problem(title: title, detail: detail, statusCode: StatusCodes.Status400BadRequest, type: For("validation"));

    public static IResult Unavailable(string type, string title, string? detail = null) =>
        Results.Problem(title: title, detail: detail, statusCode: StatusCodes.Status503ServiceUnavailable, type: For(type));
}
