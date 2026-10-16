/// When the app asks Google Play whether a newer version is out.
///
/// "Every time they enter the app" — so on every cold start, and every time
/// the app comes back to the foreground after being away a while. Not on
/// EVERY resume, though: a resume also happens when the buyer returns from
/// the camera, the photo picker, or the Selcom Wallet app in the middle of a
/// payment, and an update prompt dropped on top of checkout at that moment
/// would be the wrong kind of nag. Being gone at least this long is what
/// separates re-entering the app from a round trip within a task.
const Duration kUpdateCheckAfterBackground = Duration(minutes: 5);

/// Whether this entry into the app should check for an update.
///
/// [backgroundFor] is how long the app was in the background before this
/// resume; null means a cold start.
bool shouldCheckForUpdate({Duration? backgroundFor}) =>
    backgroundFor == null || backgroundFor >= kUpdateCheckAfterBackground;
