namespace Copernica.Hosting;

/// <summary>
/// The user's delegated access to the hosting platform expired or was revoked; they must sign in
/// again. Mapped to <c>401</c> with problem type <c>reauthentication-required</c>.
/// </summary>
public sealed class ReauthenticationRequiredException(string message, Exception? inner = null) : Exception(message, inner);
