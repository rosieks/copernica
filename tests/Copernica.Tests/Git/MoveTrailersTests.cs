using Copernica.Git;

namespace Copernica.Tests.Git;

public sealed class MoveTrailersTests
{
    [Fact]
    public void Page_move_round_trips()
    {
        var move = new MoveRecord("guides/setup.md", "howto/install.md", Folder: false);

        var line = MoveTrailers.Format(move);

        Assert.Equal("Copernica-Moved: guides/setup.md -> howto/install.md", line);
        Assert.Equal([move], MoveTrailers.Parse("Move it\n\n" + line));
    }

    [Fact]
    public void Folder_move_ends_with_a_slash_and_maps_its_prefix()
    {
        var move = new MoveRecord("guides/old", "archive/old", Folder: true);

        Assert.Equal("Copernica-Moved: guides/old/ -> archive/old/", MoveTrailers.Format(move));
        var parsed = Assert.Single(MoveTrailers.Parse(MoveTrailers.Format(move)));
        Assert.True(parsed.Folder);
        Assert.Equal("archive/old/a/b.md", parsed.Map("guides/old/a/b.md"));
        Assert.Null(parsed.Map("guides/older/x.md"));
        Assert.Equal("guides/old/x.md", parsed.Unmap("archive/old/x.md"));
    }

    [Fact]
    public void Paths_with_spaces_are_encoded_per_segment()
    {
        var move = new MoveRecord("my guides/getting started.md", "how to/start -> here.md", Folder: false);

        var line = MoveTrailers.Format(move);

        Assert.Equal("Copernica-Moved: my%20guides/getting%20started.md -> how%20to/start%20-%3E%20here.md", line);
        Assert.Equal([move], MoveTrailers.Parse(line));
    }

    [Fact]
    public void Append_adds_trailers_after_a_blank_line()
    {
        var message = MoveTrailers.Append("  Reorganize guides \r\n\r\n", [
            new MoveRecord("a.md", "b.md", false),
            new MoveRecord("x", "y/x", true),
        ]);

        Assert.Equal("Reorganize guides\n\nCopernica-Moved: a.md -> b.md\nCopernica-Moved: x/ -> y/x/", message);
        Assert.Equal(2, MoveTrailers.Parse(message).Count);
    }

    [Theory]
    [InlineData("Just a message mentioning a.md -> b.md")]
    [InlineData("Copernica-Moved: a.md")]
    [InlineData("Copernica-Moved:  -> b.md")]
    [InlineData("Copernica-Moved: a.md -> ")]
    [InlineData("Copernica-Moved: folder/ -> page.md")]
    public void Malformed_or_other_lines_are_ignored(string message)
    {
        Assert.Empty(MoveTrailers.Parse(message));
    }
}
