using Copernica.Discussions;

namespace Copernica.Tests.Discussions;

public sealed class ReanchorTests
{
    private static TextAnchor AnchorFor(string text, string exact, int occurrence = 0)
    {
        var start = -1;
        for (var i = 0; i <= occurrence; i++)
        {
            start = text.IndexOf(exact, start + 1, StringComparison.Ordinal);
        }

        var position = Reanchorer.At(text, start, start + exact.Length);
        return new TextAnchor
        {
            Exact = position.Exact,
            Prefix = position.Prefix,
            Suffix = position.Suffix,
            Start = position.Start,
            End = position.End,
            CommitId = "c1",
            OriginalExact = position.Exact,
        };
    }

    [Fact]
    public void Unique_exact_match_is_found_after_edits_elsewhere()
    {
        const string before = "Intro.\nThe release process starts on Monday.\nOutro.";
        const string after = "A brand new introduction paragraph.\nIntro.\nThe release process starts on Monday.\nOutro changed.";
        var anchor = AnchorFor(before, "release process");

        var position = Reanchorer.Locate(after, anchor);

        Assert.NotNull(position);
        Assert.Equal("release process", after[position.Start..position.End]);
    }

    [Fact]
    public void Repeated_quote_is_disambiguated_by_context()
    {
        const string before = "Alpha: deploy now. Beta: deploy now. Gamma: deploy now.";
        const string after = "New first line. Alpha: deploy now. Beta: deploy now. Gamma: deploy now.";
        var anchor = AnchorFor(before, "deploy now", occurrence: 1);

        var position = Reanchorer.Locate(after, anchor)!;

        Assert.Equal("Beta: ", after[(position.Start - 6)..position.Start]);
    }

    [Fact]
    public void Ties_are_broken_by_distance_to_the_old_offset()
    {
        const string text = "x deploy x deploy x deploy x";
        var anchor = new TextAnchor { Exact = "deploy", Prefix = "", Suffix = "", Start = 19, End = 25, CommitId = "c", OriginalExact = "deploy" };

        var position = Reanchorer.Locate(text, anchor)!;

        Assert.Equal(20, position.Start);
    }

    [Fact]
    public void Slightly_edited_fragment_is_found_by_fuzzy_match()
    {
        const string before = "Our onboarding checklist covers laptops and accounts.";
        const string after = "Our onboarding check-list covers laptops and accounts.";
        var anchor = AnchorFor(before, "onboarding checklist covers laptops");

        var position = Reanchorer.Locate(after, anchor);

        Assert.NotNull(position);
        Assert.StartsWith("onboarding check-list", after[position.Start..]);
    }

    [Fact]
    public void Long_fragment_is_found_by_fuzzy_match()
    {
        var sentence = "This is a long sentence about how the team handles incidents during weekends and holidays, including escalation.";
        var before = "Header.\n" + sentence + "\nFooter.";
        var after = "Header with more words.\n" + sentence.Replace("weekends", "week-ends") + "\nFooter.";
        var anchor = AnchorFor(before, sentence);

        var position = Reanchorer.Locate(after, anchor);

        Assert.NotNull(position);
        Assert.True(Reanchorer.Similarity(after[position.Start..position.End], sentence) >= Reanchorer.MinimumSimilarity);
    }

    [Fact]
    public void Deleted_fragment_is_not_found()
    {
        const string before = "Keep this. Remove the secret plan entirely. Keep that.";
        const string after = "Keep this. Keep that.";
        var anchor = AnchorFor(before, "secret plan entirely");

        Assert.Null(Reanchorer.Locate(after, anchor));
    }

    [Fact]
    public void Heavily_rewritten_fragment_is_not_matched()
    {
        const string before = "We deploy on Mondays after the stand-up.";
        const string after = "Releases happen whenever the pipeline is green.";
        var anchor = AnchorFor(before, "deploy on Mondays");

        Assert.Null(Reanchorer.Locate(after, anchor));
    }

    [Fact]
    public void At_least_95_percent_survive_edits_elsewhere_on_the_page()
    {
        // SC-006 corpus: anchor every sentence, then edit other paragraphs and re-locate.
        var random = new Random(42);
        var paragraphs = Enumerable.Range(0, 40)
            .Select(i => $"Paragraph {i} explains topic {i * 7 % 13} with detail {random.Next(1000)} and a note about step {i}.")
            .ToList();
        var original = string.Join("\n", paragraphs);
        var anchors = paragraphs.Select(p => AnchorFor(original, p[..Math.Min(p.Length, 45)])).ToList();

        var located = 0;
        for (var target = 0; target < paragraphs.Count; target++)
        {
            var edited = paragraphs.ToList();
            for (var k = 0; k < edited.Count; k++)
            {
                if (k != target && k % 3 == 0)
                {
                    edited[k] = edited[k].Replace("explains", "describes in more depth") + " Added sentence.";
                }
            }

            edited.Insert(random.Next(edited.Count), "A completely new paragraph inserted somewhere.");
            var text = string.Join("\n", edited);
            var position = Reanchorer.Locate(text, anchors[target]);
            if (position is not null && text[position.Start..position.End] == anchors[target].Exact)
            {
                located++;
            }
        }

        Assert.True(located >= 0.95 * paragraphs.Count, $"Only {located}/{paragraphs.Count} anchors survived.");
    }
}
