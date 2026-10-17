using System.Text.Json;
using Copernica.Rendering;

namespace Copernica.Tests.Rendering;

/// <summary>
/// Server plain text must equal the browser's <c>textContent</c> so anchor offsets agree.
/// The same fixtures are checked against a DOM in src/web/src/discussions/textAnchor.test.ts.
/// </summary>
public sealed class PlainTextExtractorTests
{
    private static readonly string Fixtures = Path.Combine(FindRoot(), "tests", "fixtures", "anchoring");

    public static TheoryData<string> Cases()
    {
        var data = new TheoryData<string>();
        foreach (var c in Load<List<Case>>("cases.json"))
        {
            data.Add(c.Name);
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public void Plain_text_matches_dom_text_content(string name)
    {
        var html = Load<List<Case>>("cases.json").Single(c => c.Name == name).Html;
        var expected = Load<Dictionary<string, string>>("expected.json")[name];

        Assert.Equal(expected, PlainTextExtractor.Extract(html));
    }

    [Fact]
    public void Rendered_page_text_contains_no_markup()
    {
        var html = new MarkdownRenderer().Render("# Title\n\nSome *emphasis* and `code`.");

        Assert.Equal("Title\nSome emphasis and code.\n", PlainTextExtractor.Extract(html));
    }

    private static T Load<T>(string file) =>
        JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(Fixtures, file)), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

    private static string FindRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Copernica.slnx")))
        {
            dir = dir.Parent;
        }

        return dir?.FullName ?? throw new InvalidOperationException("Repository root not found.");
    }

    private sealed record Case(string Name, string Html);
}
