using Copernica.Spaces;

namespace Copernica.Tests.Spaces;

public sealed class NameValidationTests
{
    [Theory]
    [InlineData("a/b")]
    [InlineData("a\\b")]
    [InlineData("tab\there")]
    [InlineData(".")]
    [InlineData("..")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    [InlineData(" leading")]
    [InlineData("trailing ")]
    [InlineData("a<b")]
    [InlineData("a>b")]
    [InlineData("con:x")]
    [InlineData("a\"b")]
    [InlineData("a|b")]
    [InlineData("a?b")]
    [InlineData("a*b")]
    [InlineData(".order")]
    [InlineData(".ORDER")]
    public void Invalid_names_are_rejected(string? name)
    {
        Assert.False(SpacePaths.TryNormalizeName(name, out _));
    }

    [Theory]
    [InlineData("Zażółć gęślą jaźń.md")]
    [InlineData("getting started.md")]
    [InlineData("release-notes_2026.v2.md")]
    [InlineData("api")]
    [InlineData(".attachments")]
    public void Valid_names_are_accepted(string name)
    {
        Assert.True(SpacePaths.TryNormalizeName(name, out var normalized));
        Assert.Equal(name, normalized);
    }

    [Fact]
    public void Names_longer_than_255_utf8_bytes_are_rejected()
    {
        Assert.True(SpacePaths.TryNormalizeName(new string('a', 255), out _));
        Assert.False(SpacePaths.TryNormalizeName(new string('a', 256), out _));
        Assert.False(SpacePaths.TryNormalizeName(new string('ż', 128), out _));
    }

    [Theory]
    [InlineData("guides/setup.md", true)]
    [InlineData("guides/a:b.md", false)]
    [InlineData("guides/.order", false)]
    [InlineData("guides/../x.md", false)]
    public void Named_paths_check_every_segment(string path, bool valid)
    {
        Assert.Equal(valid, SpacePaths.TryNormalizeNamedPath(path, out _));
    }
}
