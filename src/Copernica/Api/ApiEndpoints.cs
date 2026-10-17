using Copernica.Hosting.AzureDevOps;

namespace Copernica.Api;

public static class ApiEndpoints
{
    public static IEndpointRouteBuilder MapCopernicaApi(this IEndpointRouteBuilder endpoints)
    {
        var api = endpoints.MapGroup("/api");
        api.MapSpacesEndpoints();
        api.MapFilesEndpoints();
        api.MapPageWriteEndpoints();
        api.MapDiscussionsEndpoints();
        api.MapUserTokenEndpoints();
        return endpoints;
    }
}
