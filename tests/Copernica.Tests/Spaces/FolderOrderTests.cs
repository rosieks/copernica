using System.Text;
using Copernica.Spaces;

namespace Copernica.Tests.Spaces;

public sealed class FolderOrderTests
{
    private static FolderOrder Parse(string text) => FolderOrder.Parse(Encoding.UTF8.GetBytes(text))!;

    private static string Text(FolderOrder order) => Encoding.UTF8.GetString(order.ToBytes());

    private sealed record Item(string Name, bool Page)
    {
        public override string ToString() => Page ? Name + ".md" : Name + "/";
    }

    private static IReadOnlyList<string> Sort(FolderOrder order, params Item[] children) =>
        order.Sort(children, c => c.Name, c => c.Page).Select(c => c.ToString()).ToList();

    [Fact]
    public void Entries_are_trimmed_and_blank_lines_ignored()
    {
        Assert.Equal(["Overview", "Getting-started", "api"], Parse("Overview\r\n  Getting-started  \r\n\r\napi\r\n").Entries);
        Assert.Equal(["a"], FolderOrder.Parse([.. Encoding.UTF8.GetPreamble(), .. "a\n"u8.ToArray()])!.Entries);
    }

    [Fact]
    public void Listed_children_come_first_then_the_rest_in_default_order()
    {
        var order = Parse("Reference\nOverview\nGhost\n");

        var sorted = Sort(order, new Item("api", false), new Item("Getting-started", true), new Item("Overview", true), new Item("Reference", true));

        Assert.Equal(["Reference.md", "Overview.md", "api/", "Getting-started.md"], sorted);
    }

    [Fact]
    public void Exact_matches_win_over_case_insensitive_ones_and_the_first_duplicate_wins()
    {
        Assert.Equal(["Setup.md", "setup/"], Sort(Parse("Setup\n"), new Item("setup", false), new Item("Setup", true)));
        Assert.Equal(["b.md", "a.md"], Sort(Parse("B\nA\nb\n"), new Item("a", true), new Item("b", true)));
    }

    [Fact]
    public void A_page_and_a_folder_with_the_same_name_stay_together_page_first()
    {
        var sorted = Sort(Parse("guide\nindex\n"), new Item("guide", false), new Item("index", true), new Item("guide", true));

        Assert.Equal(["guide.md", "guide/", "index.md"], sorted);
    }

    [Fact]
    public void Too_large_or_invalid_files_are_ignored()
    {
        Assert.Null(FolderOrder.Parse(new byte[FolderOrder.MaxBytes + 1]));
        Assert.Null(FolderOrder.Parse([0xff, 0xfe, 0x00]));
        Assert.Null(FolderOrder.Parse("a\0b"u8.ToArray()));
    }

    [Fact]
    public void Insert_remove_and_replace_keep_other_lines_byte_for_byte()
    {
        var order = Parse("  Overview \r\n# not ours\r\nSetup\r\n");

        Assert.Equal("  Overview \r\n# not ours\r\nSetup\r\nNew\r\n", Text(order.Insert("New")));
        Assert.Equal("  Overview \r\nNew\r\n# not ours\r\nSetup\r\n", Text(order.Insert("New", before: "# not ours")));
        Assert.Equal("  Overview \r\n# not ours\r\n", Text(order.Remove("setup")));
        Assert.Equal("  Overview \r\n# not ours\r\nInstall\r\n", Text(order.Replace("Setup", "Install")));
        Assert.Equal("  Overview \r\n# not ours\r\nSetup\r\n", Text(order.Remove("Missing")));
    }

    [Fact]
    public void Byte_order_mark_is_kept()
    {
        var order = FolderOrder.Parse([.. Encoding.UTF8.GetPreamble(), .. "a\n"u8.ToArray()])!;

        Assert.Equal([.. Encoding.UTF8.GetPreamble(), .. "a\nb\n"u8.ToArray()], order.Insert("b").ToBytes());
    }

    [Fact]
    public void Create_lists_entries_and_ends_with_a_newline()
    {
        Assert.Equal("api\nOverview\n", Text(FolderOrder.Create(["api", "Overview"])));
    }

    [Fact]
    public void Rewrite_lists_current_children_and_keeps_unknown_entries_after_their_neighbour()
    {
        var order = Parse("Overview\nGhost\nSetup\n");

        var rewritten = order.Rewrite(["Setup", "Overview", "api"]);

        Assert.Equal("Setup\nOverview\nGhost\napi\n", Text(rewritten));
    }
}
