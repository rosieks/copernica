using Copernica.Configuration;
using Copernica.Spaces;

namespace Copernica.Tests.Configuration;

public sealed class OptionsValidationTests
{
    [Theory]
    [InlineData("handbook", true)]
    [InlineData("a1", true)]
    [InlineData("payments-docs", true)]
    [InlineData("a", false)]
    [InlineData("Handbook", false)]
    [InlineData("-docs", false)]
    [InlineData("docs_1", false)]
    [InlineData("", false)]
    public void Space_id_must_be_a_slug(string id, bool valid)
    {
        var space = Space.CreateAll([new SpaceOptions { Id = id }], "data").Single();

        Assert.Equal(valid, space.IsValid);
    }

    [Fact]
    public void Duplicate_space_ids_make_both_spaces_invalid_but_not_others()
    {
        var spaces = Space.CreateAll(
            [new SpaceOptions { Id = "docs" }, new SpaceOptions { Id = "docs" }, new SpaceOptions { Id = "other" }],
            "data");

        Assert.False(spaces[0].IsValid);
        Assert.False(spaces[1].IsValid);
        Assert.True(spaces[2].IsValid);
        Assert.NotEqual(spaces[0].MirrorPath, spaces[2].MirrorPath);
    }

    [Fact]
    public void AzureDevOps_space_requires_remote_url()
    {
        var space = Space.CreateAll([new SpaceOptions { Id = "ado", Provider = SpaceProvider.AzureDevOps }], "data").Single();

        Assert.False(space.IsValid);
        Assert.Contains(space.ConfigurationErrors, e => e.Contains("RemoteUrl"));
    }

    [Fact]
    public void Display_name_longer_than_100_characters_is_rejected()
    {
        var space = Space.CreateAll([new SpaceOptions { Id = "docs", DisplayName = new string('x', 101) }], "data").Single();

        Assert.False(space.IsValid);
    }

    [Fact]
    public void Folder_is_normalized_and_used_for_paths()
    {
        var space = Space.CreateAll([new SpaceOptions { Id = "docs", Folder = "/docs/guides/" }], "data").Single();

        Assert.Equal("docs/guides", space.Folder);
        Assert.Equal("docs/guides/a.md", space.ToRepositoryPath("a.md"));
        Assert.Equal("a.md", space.ToSpacePath("docs/guides/a.md"));
        Assert.Null(space.ToSpacePath("src/a.md"));
    }

    [Fact]
    public void Folder_with_parent_segments_is_rejected()
    {
        var space = Space.CreateAll([new SpaceOptions { Id = "docs", Folder = "../secrets" }], "data").Single();

        Assert.False(space.IsValid);
    }

    [Fact]
    public void Defaults_match_the_configuration_contract()
    {
        var options = new CopernicaOptions();

        Assert.Equal(TimeSpan.FromMinutes(1), options.SyncInterval);
        Assert.Equal(TimeSpan.FromMinutes(2), options.PermissionCacheTtl);
        Assert.Equal(1_048_576, options.MaxRenderBytes);
        Assert.Equal("users.noreply.invalid", options.FallbackEmailDomain);
        Assert.True(new CopernicaOptionsValidator().Validate(null, options).Succeeded);
    }

    [Fact]
    public void Permission_cache_ttl_above_five_minutes_is_rejected()
    {
        var options = new CopernicaOptions { PermissionCacheTtl = TimeSpan.FromMinutes(6) };

        var result = new CopernicaOptionsValidator().Validate(null, options);

        Assert.True(result.Failed);
        Assert.Contains("PermissionCacheTtl", result.FailureMessage);
    }

    [Fact]
    public void EntraId_mode_requires_tenant_and_client()
    {
        var options = new CopernicaOptions { Auth = { Mode = AuthMode.EntraId } };

        Assert.True(new CopernicaOptionsValidator().Validate(null, options).Failed);
    }
}
