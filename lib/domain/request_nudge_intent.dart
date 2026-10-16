/// Pending request-nudge intent — web parity `lib/request-nudge-intent.ts`.
///
/// The web persists a "respond to this request" intent under
/// `pending_request_nudge_intent` in sessionStorage when a seller starts a
/// listing from a request board. The sell wizard reads it on mount to prefill
/// title/description/street and, once the listing is live, POSTs it back to
/// `/request-board/{id}/nudge` with the new `productId` before redirecting to
/// the request.
library;

/// Same JSON shape the web stores (see request-nudge-intent.ts).
class PendingRequestNudgeIntent {
  final int requestId;
  final String requestTitle;
  final String message;
  final String? nudgeType;
  final String? category;
  final String? location;
  final String? returnTo;

  const PendingRequestNudgeIntent({
    required this.requestId,
    required this.requestTitle,
    required this.message,
    this.nudgeType,
    this.category,
    this.location,
    this.returnTo,
  });

  static const kvKey = 'pending_request_nudge_intent';

  /// Web parity `getPendingRequestNudgeIntent`: an entry with no requestId or
  /// no message is ignored.
  static PendingRequestNudgeIntent? fromJson(Map<String, dynamic>? j) {
    if (j == null) return null;
    final requestId = (j['requestId'] as num?)?.toInt();
    final message = (j['message'] as String? ?? '').trim();
    final requestTitle = (j['requestTitle'] as String? ?? '').trim();
    if (requestId == null || requestId <= 0 || message.isEmpty) return null;
    return PendingRequestNudgeIntent(
      requestId: requestId,
      requestTitle: requestTitle,
      message: message,
      nudgeType: j['nudgeType'] as String?,
      category: j['category'] as String?,
      location: j['location'] as String?,
      returnTo: j['returnTo'] as String?,
    );
  }
}

/// Web parity `titleFromRequestTitle` (app/sell/page.tsx): a request titled
/// `"Looking for a pressure washer"` becomes the listing title `A pressure
/// washer` — quotes are stripped and a leading "looking for" is removed.
String titleFromRequestTitle(String title) {
  final trimmed = title
      .replaceAll(RegExp('^["“”\']+|["“”\']+\$'), '')
      .replaceFirst(RegExp(r'^looking\s+for\s+', caseSensitive: false), '')
      .trim();
  return trimmed.isEmpty ? title.trim() : trimmed;
}
