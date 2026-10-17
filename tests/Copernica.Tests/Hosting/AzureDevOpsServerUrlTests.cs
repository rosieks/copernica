using Copernica.Hosting.AzureDevOps;

namespace Copernica.Tests.Hosting;

public sealed class AzureDevOpsServerUrlTests
{
    [Theory]
    [InlineData("https://ado.contoso.local/DefaultCollection/Platform/_git/handbook", "https://ado.contoso.local/DefaultCollection/")]
    [InlineData("https://ado.contoso.local/tfs/Engineering/Platform/_git/handbook", "https://ado.contoso.local/tfs/Engineering/")]
    [InlineData("https://ado.contoso.local:8443/Engineering/Platform/_git/handbook", "https://ado.contoso.local:8443/Engineering/")]
    public void Server_urls_resolve_to_their_collection(string url, string collection)
    {
        Assert.True(AzureDevOpsRepositoryUrl.TryParse(url, out var parsed));
        Assert.Equal(collection, parsed.CollectionUrl.ToString());
        Assert.Equal(("Platform", "handbook"), (parsed.Project, parsed.Repository));
        Assert.Equal($"{collection}_apis/securitynamespaces", parsed.Api("_apis/securitynamespaces").ToString());
    }
}
