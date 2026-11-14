using System.Text.Json;

namespace Copernica.Tests.Rendering;

/// <summary>The front matter corpus and hostile samples in tests/fixtures/front-matter (010 research R10).</summary>
internal static class FrontMatterFixtures
{
    public static readonly string Folder = Path.Combine(FindRoot(), "tests", "fixtures", "front-matter");

    public static IEnumerable<string> Files(string set) =>
        Directory.GetFiles(Path.Combine(Folder, set), "*.md").Select(Path.GetFileName).Order(StringComparer.Ordinal)!;

    public static string Read(string set, string name) => File.ReadAllText(Path.Combine(Folder, set, name));

    /// <summary>The expected <c>{ title, frontMatter }</c> of one file, from <c>{set}/expected.json</c>.</summary>
    public static JsonElement Expected(string set, string name)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(Folder, set, "expected.json")));
        return document.RootElement.GetProperty(name).Clone();
    }

    public static TheoryData<string> Names(string set)
    {
        var data = new TheoryData<string>();
        foreach (var name in Files(set))
        {
            data.Add(name);
        }

        return data;
    }

    private static string FindRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Copernica.slnx")))
        {
            dir = dir.Parent;
        }

        return dir?.FullName ?? throw new InvalidOperationException("Repository root not found.");
    }
}
