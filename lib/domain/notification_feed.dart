import 'time_utils.dart';

/// Notification feed model — port of web `lib/notification-feed.ts` +
/// `lib/notification-utils.ts`.
///
/// The backend sends a flat row; everything the feed shows (which tab it
/// belongs to, what kind of action it represents, where tapping it goes) is
/// derived here from the type plus the title/message text, exactly as web
/// does. Keeping that derivation in one pure place is what lets the tabs,
/// filters and deep links agree with each other.
enum NotificationTab { all, buying, selling, requests }

enum NotificationActionFilter { all, payment, fulfillment, receipt, rating }

/// Which side of the marketplace a notification concerns. `both` rows show
/// under buying AND selling — a generic order update must not vanish from a
/// role tab.
enum _NotificationScope { buying, selling, requests, both }

enum NotificationVisualKind { rating, logistics, normal }

class UserNotificationRow {
  final int id;
  final String title;
  final String message;
  final String notificationType;
  final String? referenceId;
  final String? actionUrl;
  final bool isRead;
  final DateTime? createdAt;

  const UserNotificationRow({
    required this.id,
    required this.title,
    required this.message,
    required this.notificationType,
    this.referenceId,
    this.actionUrl,
    this.isRead = false,
    this.createdAt,
  });

  /// Web parity `normalizeUserNotification`: the backend has used several
  /// spellings for the same row over time, so every field falls through its
  /// known aliases. Returns null when there is no usable id.
  static UserNotificationRow? fromJson(Map<String, dynamic> v) {
    final rawId = v['id'] ?? v['notificationId'];
    final id = rawId is num ? rawId.toInt() : int.tryParse('${rawId ?? ''}');
    if (id == null) return null;

    final title = (v['title'] ?? 'Notification').toString();
    final message = (v['message'] ?? '').toString();
    return UserNotificationRow(
      id: id,
      title: title,
      message: _normalizeMessage(title, message),
      notificationType: (v['notificationType'] ?? v['type'] ?? 'SYSTEM')
          .toString()
          .toUpperCase(),
      referenceId: (v['referenceId'] == null || '${v['referenceId']}'.isEmpty)
          ? null
          : '${v['referenceId']}',
      actionUrl: safeNotificationActionUrl(v['actionUrl']),
      isRead: (v['isRead'] ?? v['read']) == true,
      createdAt: _parseTimestamp(v['createdAt'] ??
          v['createdDate'] ??
          v['created_at'] ??
          v['timestamp']),
    );
  }

  String get _searchableText =>
      '$notificationType $title $message'.toLowerCase();
}

/// TimeUtils.parseBackendTimestamp THROWS on a missing or unparseable value,
/// so it can never be called straight from a row parser — one notification
/// with no timestamp would take down the whole feed. Web's equivalent simply
/// yields undefined, and a row with no date is still worth showing.
DateTime? _parseTimestamp(Object? raw) {
  if (raw == null || '$raw'.isEmpty) return null;
  try {
    return TimeUtils.parseBackendTimestamp(raw);
  } on FormatException {
    return null;
  }
}

/// One backend message promises something the app cannot yet deliver; web
/// rewrites it rather than let the buyer expect a code that is not coming.
String _normalizeMessage(String title, String message) {
  if (title.trim().toLowerCase() == 'seller confirmed your delivery' &&
      message.toLowerCase().contains('assigning a driver')) {
    return "The seller confirmed your order and is assigning a driver. We'll send "
        "your delivery code when the driver is dispatched.";
  }
  return message;
}

/// Only same-origin absolute paths are ever followed — a value that is not a
/// rooted path (or is protocol-relative, `//evil.com`) is dropped.
String? safeNotificationActionUrl(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  return trimmed;
}

/// The feed endpoint has returned a bare array, `{content}`, `{data}` and
/// `{data:{content}}` at different times — web tolerates all four.
List<Map<String, dynamic>> extractNotificationContent(Object? payload) {
  if (payload is List)
    return payload.whereType<Map<String, dynamic>>().toList();
  if (payload is! Map) return const [];
  final root = payload;
  if (root['content'] is List) {
    return (root['content'] as List).whereType<Map<String, dynamic>>().toList();
  }
  if (root['data'] is List) {
    return (root['data'] as List).whereType<Map<String, dynamic>>().toList();
  }
  final data = root['data'];
  if (data is Map && data['content'] is List) {
    return (data['content'] as List).whereType<Map<String, dynamic>>().toList();
  }
  return const [];
}

_NotificationScope _scopeOf(UserNotificationRow n) {
  final type = n.notificationType;
  final text = n._searchableText;

  if (type == 'NEW_REQUEST' ||
      type == 'REQUEST_NUDGE' ||
      type == 'REQUEST_SERVICE_OFFER' ||
      type == 'REQUEST_UPDATE') {
    return _NotificationScope.requests;
  }
  if (type.endsWith('_SELLING')) return _NotificationScope.selling;
  if (type.endsWith('_BUYING')) return _NotificationScope.buying;

  if (type == 'PRODUCT_LOGISTICS_UPDATE_REQUIRED' ||
      type == 'NEW_ORDER' ||
      RegExp(r'\b(new order|buyer confirmed|rate buyer|payment released|payout)\b')
          .hasMatch(text)) {
    return _NotificationScope.selling;
  }
  if (RegExp(r'\b(payment verified|payment details|payment receipt|refund|'
          r'seller confirmed|rate seller|your purchase)\b')
      .hasMatch(text)) {
    return _NotificationScope.buying;
  }
  if (type == 'ORDER_UPDATE' ||
      type == 'ORDER_PROCESSING' ||
      type == 'RATING_REQUIRED' ||
      type == 'ORDER') {
    return _NotificationScope.both;
  }
  return (type.contains('PAYMENT') || type == 'PAYMENT')
      ? _NotificationScope.buying
      : _NotificationScope.both;
}

bool notificationMatchesTab(UserNotificationRow n, NotificationTab tab) {
  if (tab == NotificationTab.all) return true;
  final scope = _scopeOf(n);
  if (tab == NotificationTab.requests) {
    return scope == _NotificationScope.requests;
  }
  if (scope == _NotificationScope.both) return true;
  return (tab == NotificationTab.buying &&
          scope == _NotificationScope.buying) ||
      (tab == NotificationTab.selling && scope == _NotificationScope.selling);
}

/// Which action this row is really asking for. Order matters: confirming
/// receipt is the CURRENT step even when the message previews the rating
/// that only becomes due afterwards.
NotificationActionFilter notificationActionFilter(UserNotificationRow n) {
  final text = n._searchableText;
  if (RegExp(r'confirm (?:receipt|received)|receipt confirmation')
      .hasMatch(text)) {
    return NotificationActionFilter.receipt;
  }
  if (RegExp(r'rating|required.*rate|rate buyer|rate seller').hasMatch(text)) {
    return NotificationActionFilter.rating;
  }
  if (RegExp(r'receipt|picked up|delivered').hasMatch(text)) {
    return NotificationActionFilter.receipt;
  }
  if (RegExp(r'payment|refund|payout|proforma').hasMatch(text)) {
    return NotificationActionFilter.payment;
  }
  if (RegExp(r'order|delivery|logistics|transport|availability|pickup')
      .hasMatch(text)) {
    return NotificationActionFilter.fulfillment;
  }
  return NotificationActionFilter.all;
}

bool notificationMatchesActionFilter(
    UserNotificationRow n, NotificationActionFilter filter) {
  if (filter == NotificationActionFilter.all) return true;
  return notificationActionFilter(n) == filter;
}

/// Payment rows that merely report progress. Once read they drop out of the
/// active feed so they cannot be mistaken for something still to do.
bool _isInformationalPayment(UserNotificationRow n) {
  const types = [
    'PAYMENT_VERIFIED',
    'PAYMENT_SUBMITTED',
    'PAYMENT_DETAILS_RECEIVED'
  ];
  return types.contains(n.notificationType) ||
      RegExp(r'\b(payment verified|received your payment details|'
              r'payment details (?:were )?received)\b')
          .hasMatch(n._searchableText);
}

bool shouldShowNotificationInActiveFeed(UserNotificationRow n) =>
    !n.isRead || !_isInformationalPayment(n);

// NOTE: there is deliberately no `shouldShowInPendingActionBanner` here.
// The web's below-the-topbar strip is NOT a view over notification rows — it
// is a projection of live order/payment state (see `domain/pending_actions.dart`
// and `lib/pending-action-alerts.ts` on the web). Keeping a second, row-based
// answer to "what is pending?" is what let the strip disagree with the badges
// and outlive the work it described.

NotificationVisualKind notificationVisualKind(UserNotificationRow n) {
  if (n.notificationType == 'PRODUCT_LOGISTICS_UPDATE_REQUIRED') {
    return NotificationVisualKind.logistics;
  }
  if (notificationActionFilter(n) == NotificationActionFilter.rating) {
    return NotificationVisualKind.rating;
  }
  return NotificationVisualKind.normal;
}

/// Where tapping a notification should go.
///
/// Web routes everything through `/expat/dashboard?tab=…&sub=…&id=…`, but
/// mobile's dashboard takes no query parameters and mobile HAS a real
/// `/orders/{id}` detail route — so the same intent is mapped onto mobile's
/// own routes instead of copying a URL shape that would land on an
/// unfiltered dashboard.
/// A request-board notification (nudge / service offer / update / new request)
/// should take the owner or nudger to the request detail — web
/// components/request-nudge-notifications.tsx "View Nudges" Link. The backend
/// usually stores the request id in `referenceId`; when it does not, a
/// `/request/<id>` actionUrl is honoured so the tap still lands somewhere.
bool isRequestNotification(UserNotificationRow n) {
  const types = {
    'NEW_REQUEST',
    'REQUEST_NUDGE',
    'REQUEST_SERVICE_OFFER',
    'REQUEST_UPDATE',
  };
  return types.contains(n.notificationType);
}

String? requestNotificationActionUrl(UserNotificationRow n) {
  if (!isRequestNotification(n)) return null;
  if (n.referenceId != null && n.referenceId!.isNotEmpty) {
    final id = n.referenceId!.split('/').last;
    if (id.isNotEmpty) return '/request/$id';
  }
  final raw = n.actionUrl;
  if (raw != null && raw.startsWith('/request/')) return raw;
  return null;
}

String? notificationActionUrl(UserNotificationRow n) {
  // Nothing to do: these only report progress, or the order is already gone.
  if (_isInformationalPayment(n)) return null;
  if (RegExp(r'\b(cancelled|canceled)\b').hasMatch(n._searchableText))
    return null;

  final requestUrl = requestNotificationActionUrl(n);
  if (requestUrl != null) return requestUrl;

  // Some older backend rows used a generic dashboard actionUrl even though
  // referenceId held the exact order. Prefer that precise destination.
  if (n.referenceId != null &&
      RegExp(r'ORDER|DELIVERY|FULFILL|RATING').hasMatch(n.notificationType)) {
    return '/orders/${Uri.encodeComponent(n.referenceId!.split('/').last)}';
  }

  if (n.notificationType == 'PRODUCT_LOGISTICS_UPDATE_REQUIRED' &&
      n.referenceId != null) {
    return '/edit-listing/${Uri.encodeComponent(n.referenceId!)}';
  }

  final filter = notificationActionFilter(n);
  final isSelling = _scopeOf(n) == _NotificationScope.selling;

  if (filter == NotificationActionFilter.payment) {
    // Selling payouts live on the dashboard; buying payments have their own
    // screen on mobile.
    return isSelling
        ? '/expat/dashboard?tab=selling&sub=payments'
        : '/expat/dashboard?tab=buying&sub=payments';
  }

  if (n.referenceId != null &&
      RegExp(r'ORDER|RATING').hasMatch(n.notificationType)) {
    return '/orders/${Uri.encodeComponent(n.referenceId!)}';
  }

  return n.actionUrl;
}
