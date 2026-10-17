using Copernica.Hosting.AzureDevOps;

namespace Copernica.Tests.Hosting;

public sealed class AzureDevOpsTokenTests
{
    [Theory]
    [InlineData("https://dev.azure.com/contoso/Platform/_git/handbook", "https://dev.azure.com/contoso/", "Platform", "handbook")]
    [InlineData("https://contoso@dev.azure.com/contoso/Platform/_git/handbook", "https://dev.azure.com/contoso/", "Platform", "handbook")]
    [InlineData("https://contoso.visualstudio.com/Platform/_git/handbook", "https://contoso.visualstudio.com/", "Platform", "handbook")]
    [InlineData("https://contoso.visualstudio.com/DefaultCollection/Platform/_git/handbook", "https://contoso.visualstudio.com/DefaultCollection/", "Platform", "handbook")]
    [InlineData("https://tfs.contoso.local/tfs/Main/Platform/_git/handbook", "https://tfs.contoso.local/tfs/Main/", "Platform", "handbook")]
    [InlineData("https://dev.azure.com/contoso/My%20Project/_git/My%20Repo", "https://dev.azure.com/contoso/", "My Project", "My Repo")]
    public void Repository_urls_are_parsed(string url, string collection, string project, string repository)
    {
        Assert.True(AzureDevOpsRepositoryUrl.TryParse(url, out var parsed));
        Assert.Equal(collection, parsed.CollectionUrl.ToString());
        Assert.Equal(project, parsed.Project);
        Assert.Equal(repository, parsed.Repository);
    }

    [Theory]
    [InlineData("http://dev.azure.com/contoso/Platform/_git/handbook")]
    [InlineData("https://dev.azure.com/contoso/Platform/handbook")]
    [InlineData("https://dev.azure.com/_git/handbook")]
    [InlineData("/srv/git/handbook.git")]
    [InlineData("")]
    public void Non_azure_devops_urls_are_rejected(string url)
    {
        Assert.False(AzureDevOpsRepositoryUrl.TryParse(url, out _));
    }

    [Fact]
    public void Api_urls_are_relative_to_the_collection()
    {
        AzureDevOpsRepositoryUrl.TryParse("https://dev.azure.com/contoso/Platform/_git/handbook", out var parsed);

        Assert.Equal("https://dev.azure.com/contoso/_apis/permissions", parsed.Api("_apis/permissions").ToString());
    }

    private static readonly Guid Project = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Repo = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public void Repository_token()
    {
        Assert.Equal($"repoV2/{Project}/{Repo}", SecurityTokens.Repository(Project, Repo));
    }

    [Fact]
    public void Branch_token_hex_encodes_utf16le_segments()
    {
        Assert.Equal($"repoV2/{Project}/{Repo}/refs/heads/6d00610069006e00", SecurityTokens.Branch(Project, Repo, "main"));
        Assert.Equal($"repoV2/{Project}/{Repo}/refs/heads/6600650061007400750072006500/7800", SecurityTokens.Branch(Project, Repo, "feature/x"));
    }
}
