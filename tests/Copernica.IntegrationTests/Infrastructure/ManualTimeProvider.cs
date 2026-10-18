namespace Copernica.IntegrationTests.Infrastructure;

/// <summary>A clock the test moves by hand (e.g. to expire pending images).</summary>
public sealed class ManualTimeProvider(DateTimeOffset start) : TimeProvider
{
    private DateTimeOffset _now = start;

    public ManualTimeProvider()
        : this(DateTimeOffset.UtcNow)
    {
    }

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now += by;
}
