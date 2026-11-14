using System.Diagnostics;
using System.Text.Json;
using Copernica.Rendering;

namespace Copernica.Tests.Rendering;

/// <summary>Reading front matter: value tree, limits and known fields (010 data-model.md, research R3–R4).</summary>
public sealed class FrontMatterParserTests
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    [Fact]
    public void Scalars_stay_as_written()
    {
        var fm = FrontMatterParser.Parse("date: 2026-09-01\nn: 007\nb: yes\nf: 1.50\n");

        Assert.Equal(["2026-09-01", "007", "yes", "1.50"], fm.Properties.Select(p => ((FrontMatterText)p.Value).Text));
    }

    [Fact]
    public void Block_and_quoted_scalars_are_decoded()
    {
        var fm = FrontMatterParser.Parse("title: >\n  Folded\n  title\ndescription: \"Tab\\there \\\"q\\\"\"\nnote: |\n  a\n  b\n");

        Assert.Equal("Folded title", fm.Title);
        Assert.Equal("Tab\there \"q\"", fm.Description);
        Assert.Equal("a\nb\n", ((FrontMatterText)fm.Properties.Single().Value).Text);
    }

    [Theory]
    [InlineData("x:")]
    [InlineData("x: ~")]
    [InlineData("x: null")]
    [InlineData("x: Null")]
    [InlineData("x: NULL")]
    public void Null_values_of_unknown_fields_are_listed_empty(string yaml)
    {
        var property = Assert.Single(FrontMatterParser.Parse(yaml).Properties);

        Assert.Equal(new FrontMatterText(""), property.Value);
    }

    [Theory]
    [InlineData("https://example.invalid/a b", null)]
    [InlineData("https://example.invalid/repo", "https://example.invalid/repo")]
    [InlineData(" http://example.invalid ", "http://example.invalid/")]
    [InlineData("mailto:team@example.invalid", "mailto:team@example.invalid")]
    [InlineData("javascript:alert(1)", null)]
    [InlineData("data:text/html,<b>x</b>", null)]
    [InlineData("file:///etc/passwd", null)]
    [InlineData("ftp://example.invalid", null)]
    [InlineData("See https://example.invalid", null)]
    [InlineData("example.invalid/page", null)]
    [InlineData("/relative/page.md", null)]
    public void Whole_value_web_addresses_become_links(string value, string? href)
    {
        var text = Assert.IsType<FrontMatterText>(Assert.Single(FrontMatterParser.Parse($"link: \"{value}\"").Properties).Value);

        Assert.Equal(href, text.Href);
        Assert.Equal(value, text.Text);
    }

    [Fact]
    public void Links_are_serialized_only_when_present()
    {
        var json = JsonSerializer.Serialize<FrontMatterValue>(new FrontMatterText("plain"), Web);

        Assert.Equal("{\"kind\":\"text\",\"text\":\"plain\"}", json);
        Assert.Contains("\"href\":\"https://example.invalid/\"", JsonSerializer.Serialize<FrontMatterValue>(new FrontMatterText("https://example.invalid"), Web));
    }

    [Fact]
    public void Quoted_null_is_text()
    {
        Assert.Equal("null", FrontMatterParser.Parse("title: \"null\"").Title);
    }

    [Fact]
    public void Null_known_fields_are_absent()
    {
        var fm = FrontMatterParser.Parse("title:\nowner: ~\ntags: null\n");

        Assert.Null(fm.Title);
        Assert.Empty(fm.Owners);
        Assert.Empty(fm.Tags);
        Assert.Empty(fm.Properties);
    }

    [Fact]
    public void Maps_and_lists_keep_written_order()
    {
        var fm = FrontMatterParser.Parse("z: 1\na:\n  y: [c, b]\n  x: 2\n");

        Assert.Equal(["z", "a"], fm.Properties.Select(p => p.Name));
        var map = Assert.IsType<FrontMatterMap>(fm.Properties[1].Value);
        Assert.Equal(["y", "x"], map.Entries.Select(e => e.Name));
        Assert.Equal(new FrontMatterText("c"), Assert.IsType<FrontMatterList>(map.Entries[0].Value).Items[0]);
    }

    [Theory]
    [InlineData("title: A\ntitle: B\n")]
    [InlineData("? [a, b]\n: x\n")]
    [InlineData("- a\n- b\n")]
    [InlineData("just text")]
    [InlineData("title: [unclosed\n")]
    [InlineData("list:\n\t- a\n")]
    [InlineData("a: 1\n--- \nb: 2\n")]
    [InlineData("a: *missing\n")]
    public void Invalid_blocks_are_unreadable(string yaml)
    {
        var fm = FrontMatterParser.Parse(yaml);

        Assert.False(fm.Readable);
        Assert.Equal(yaml, fm.Raw);
        Assert.Null(fm.Title);
        Assert.Empty(fm.Properties);
    }

    [Fact]
    public void Limits_make_blocks_unreadable()
    {
        Assert.False(FrontMatterParser.Parse("a: " + new string('x', FrontMatterParser.MaxBodyLength)).Readable);
        Assert.False(FrontMatterParser.Parse("a: " + new string('x', FrontMatterParser.MaxScalarLength + 1)).Readable);
        Assert.False(FrontMatterParser.Parse("a: " + new string('[', 17) + new string(']', 17)).Readable);
        Assert.True(FrontMatterParser.Parse("a: " + new string('[', 14) + new string(']', 14)).Readable);

        var aliases = "a: &a [x, x, x, x, x, x, x, x, x, x]\n" + string.Join("", Enumerable.Range(0, 300).Select(i => $"k{i}: *a\n"));
        Assert.False(FrontMatterParser.Parse(aliases).Readable);
        Assert.True(FrontMatterParser.Parse("a: &a [x, y]\nb: *a\n").Readable);
    }

    [Fact]
    public void Tags_never_construct_objects()
    {
        var fm = FrontMatterParser.Parse("run: !!python/object/apply:os.system [\"echo\"]\nfn: !<tag:yaml.org,2002:js/function> \"f()\"\n");

        Assert.True(fm.Readable);
        Assert.Equal(new FrontMatterText("f()"), fm.Properties[1].Value);
    }

    [Fact]
    public void Aliases_lose_to_canonical_names_and_are_listed()
    {
        var fm = FrontMatterParser.Parse("summary: S\ndescription: D\nkeywords: [k]\nauthor: A\nauthors: [B, C]\n");

        Assert.Equal("D", fm.Description);
        Assert.Equal(["B", "C"], fm.Authors);
        Assert.Equal(["k"], fm.Tags);
        Assert.Equal(["summary", "author"], fm.Properties.Select(p => p.Name));
    }

    [Fact]
    public void Aliases_are_used_alone()
    {
        var fm = FrontMatterParser.Parse("summary: S\nkeywords: k1, k2\nauthor: A\n");

        Assert.Equal("S", fm.Description);
        Assert.Equal(["k1", "k2"], fm.Tags);
        Assert.Equal(["A"], fm.Authors);
        Assert.Empty(fm.Properties);
    }

    [Fact]
    public void Names_match_ignoring_case_and_the_first_variant_wins()
    {
        var fm = FrontMatterParser.Parse("TITLE: First\nTitle: Second\n");

        Assert.Equal("First", fm.Title);
        Assert.Equal("Title", Assert.Single(fm.Properties).Name);
    }

    [Fact]
    public void Tags_are_trimmed_and_deduplicated()
    {
        Assert.Equal(["a", "b"], FrontMatterParser.Parse("tags: \"a, b, , A\"").Tags);
        Assert.Equal(["x y", "z"], FrontMatterParser.Parse("tags: [' x y ', z, Z, '']").Tags);
    }

    [Theory]
    [InlineData("Deprecated", "deprecated")]
    [InlineData("draft", "draft")]
    [InlineData(" ARCHIVED ", "archived")]
    public void Banner_statuses_are_recognized(string value, string status)
    {
        Assert.Equal(status, FrontMatterParser.Parse($"status: \"{value}\"").Status);
    }

    [Fact]
    public void Other_statuses_are_properties()
    {
        var fm = FrontMatterParser.Parse("status: review\n");

        Assert.Null(fm.Status);
        Assert.Equal(new FrontMatterProperty("status", new FrontMatterText("review")), Assert.Single(fm.Properties));
    }

    [Fact]
    public void Wrong_shapes_are_properties()
    {
        var fm = FrontMatterParser.Parse("title: [a, b]\nauthors:\n  - name: Ana\nowner: {team: x}\ntags: [[nested]]\n");

        Assert.Null(fm.Title);
        Assert.Empty(fm.Authors);
        Assert.Empty(fm.Owners);
        Assert.Empty(fm.Tags);
        Assert.Equal(["title", "authors", "owner", "tags"], fm.Properties.Select(p => p.Name));
    }

    [Fact]
    public void Owner_accepts_text_or_a_list()
    {
        Assert.Equal(["Platform"], FrontMatterParser.Parse("owner: Platform").Owners);
        Assert.Equal(["A", "B"], FrontMatterParser.Parse("owner: [A, B]").Owners);
        Assert.Equal(["/a", "/b"], FrontMatterParser.Parse("aliases: [/a, /b]").Aliases);
    }

    [Theory]
    [InlineData("order")]
    [InlineData("weight")]
    [InlineData("sidebar_position")]
    public void Position_fields_are_plain_properties(string name)
    {
        Assert.Equal(name, Assert.Single(FrontMatterParser.Parse($"{name}: 3").Properties).Name);
    }

    [Fact]
    public void Empty_body_is_readable_and_empty()
    {
        var fm = FrontMatterParser.Parse("# only a comment\n");

        Assert.True(fm.Readable);
        Assert.Empty(fm.Properties);
    }

    public static TheoryData<string> Corpus() => FrontMatterFixtures.Names("corpus");

    public static TheoryData<string> Hostile() => FrontMatterFixtures.Names("hostile");

    [Theory]
    [MemberData(nameof(Corpus))]
    public void Corpus_files_give_the_expected_front_matter(string name) => AssertExpected("corpus", name);

    [Theory]
    [MemberData(nameof(Hostile))]
    public void Hostile_files_give_the_expected_front_matter(string name) => AssertExpected("hostile", name);

    [Theory]
    [MemberData(nameof(Hostile))]
    public void Hostile_files_are_cheap(string name)
    {
        var block = FrontMatter.Locate(FrontMatterFixtures.Read("hostile", name));
        if (block is null)
        {
            return;
        }

        FrontMatterParser.Parse(block.Body);
        var watch = Stopwatch.StartNew();
        FrontMatterParser.Parse(block.Body);

        Assert.True(watch.ElapsedMilliseconds < 50, $"{name} took {watch.ElapsedMilliseconds} ms");
    }

    private static void AssertExpected(string set, string name)
    {
        var block = FrontMatter.Locate(FrontMatterFixtures.Read(set, name));
        var actual = block is null ? "null" : JsonSerializer.Serialize(FrontMatterParser.Parse(block.Body), Web);
        var expected = FrontMatterFixtures.Expected(set, name).GetProperty("frontMatter");

        Assert.Equal(Normalize(expected.GetRawText()), Normalize(actual));
    }

    private static string Normalize(string json) =>
        JsonSerializer.Serialize(JsonDocument.Parse(json).RootElement, new JsonSerializerOptions { WriteIndented = false });
}
