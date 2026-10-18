using System.Text.RegularExpressions;
using Copernica.Attachments;

namespace Copernica.Tests.Attachments;

public sealed partial class AttachmentNamesTests
{
    private static readonly ImageFormat Png = ImageFormat.Detect(Convert.FromHexString("89504E470D0A1A0A"))!;

    [Theory]
    [InlineData("image.png")]
    [InlineData("blob")]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("Image.PNG")]
    public void Generic_clipboard_names_become_image(string? original)
    {
        Assert.Matches(Pattern("image"), AttachmentNames.Create(original, Png));
    }

    [Fact]
    public void Original_names_are_made_safe_and_get_a_suffix()
    {
        Assert.Matches(Pattern("network-diagram-v2"), AttachmentNames.Create("Network Diagram (v2).PNG", Png));
    }

    [Fact]
    public void The_extension_follows_the_detected_format()
    {
        Assert.Matches(Pattern("photo"), AttachmentNames.Create("photo.jpg", Png));
    }

    [Fact]
    public void Long_stems_are_trimmed_and_never_empty()
    {
        var longName = AttachmentNames.Create(new string('a', 200) + ".png", Png);
        var stem = longName[..longName.LastIndexOf('-')];
        Assert.Equal(60, stem.Length);

        Assert.Matches(Pattern("image"), AttachmentNames.Create("ąęś!!!.png", Png));
    }

    [Fact]
    public void Suffixes_are_random()
    {
        Assert.NotEqual(AttachmentNames.Create("a.png", Png), AttachmentNames.Create("a.png", Png));
    }

    private static Regex Pattern(string stem) => new($"^{Regex.Escape(stem)}-[a-z2-7]{{8}}\\.png$");
}
