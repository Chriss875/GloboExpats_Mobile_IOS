import 'package:intl/intl.dart';

import 'seller_display.dart' show publicSellerName;

/// Request-board domain helpers — web parity for the pure logic in
/// `lib/request-board-types.ts`, `lib/request-budget.ts` and
/// `components/request-board/request-card.tsx` (relative time).
///
/// Keeping these free of Flutter widgets is what lets the parity tests pin
/// exact web copy ("from …", "up to …", "just now") without a host.

/// Web `SERVICE_REQUEST_CATEGORIES` (request-board-types.ts:6-17). The service
/// taxonomy is a *platform constant*, not free text — service posts carry one
/// of these values so matching/filtering stays consistent with web-created
/// requests.
const List<String> serviceRequestCategories = [
  'Tailor',
  'Hair & Beauty',
  'House Help',
  'IT Support',
  'Repairs',
  'Transport',
  'Tutoring',
  'Cleaning',
  'Health & Wellness',
  'Other',
];

/// Human list of the statuses a requester may filter by — web feed uses
/// PENDING / FULFILLED / CLOSED, and the data model & gating code against the
/// same set (there is no "OPEN" in the backend vocabulary).
const List<String> requestStatusOptions = ['PENDING', 'FULFILLED', 'CLOSED'];

String _currencyLabel(num value) =>
    NumberFormat('#,##0', 'en_US').format(value.toDouble());

/// Web `request-budget.ts` phrasing: both ends "min – max TZS", min only
/// "from …", max only "up to …"; null hides the badge. The legacy mobile
/// accessor only formatted the both-ends case, so single-end budgets rendered
/// as a bare number.
String? requestBudgetSummary(num? min, num? max) {
  if (min == null && max == null) return null;
  final minL = min == null ? null : '${_currencyLabel(min)} TZS';
  final maxL = max == null ? null : '${_currencyLabel(max)} TZS';
  if (minL != null && maxL != null) return '$minL – $maxL';
  return minL != null ? 'from $minL' : 'up to $maxL';
}

/// Web `request-card.tsx:54-66` relative formatter — 'just now', '{n}m ago',
/// '{n}h ago', '{n}d ago', else a short local date. [then] is the UTC instant
/// of the backend timestamp; [now] is injected for deterministic tests.
String relativeRequestTime(DateTime? then, {DateTime? now}) {
  if (then == null) return '';
  final nowUtc = (now ?? DateTime.now()).toUtc();
  final t = then.toUtc();
  final diff = nowUtc.difference(t);
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  final local = t.toLocal();
  final months = const [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return '${local.day} ${months[local.month - 1]} ${local.year}';
}

/// Poster identity gate — web `request-card.tsx:151`
/// `showRequesterIdentity ? publicUserName : 'Community member'`, where
/// `showFullIdentity = isOwner || canViewRequesterIdentity`. Mobile has no
/// app-wide viewer-verification context, so the *screen* resolves whether the
/// current user may see names (owner or a verified seller) and passes the
/// answer in; this stays a pure decision so the caller keeps control.
///
/// Web renders the *masked* public name (first name + last initial) even for
/// gated viewers — never the raw full name a requester typed. `publicSellerName`
/// is the same helper web uses (`getPublicName`, seller-display.ts:2-16).
String requestPosterName({String? userName, required bool showIdentity}) {
  if (!showIdentity) return 'Community member';
  return publicSellerName(userName, fallback: 'Community member');
}

/// Robust request id extraction: the feed/detail payloads have used
/// `requestPostId`, `id` and `requestId` at different times, and deep links /
/// notification reference ids arrive as strings. Web `Number(id)` tolerance.
int requestPostId(Map<String, dynamic> m) {
  final raw = m['requestPostId'] ?? m['id'] ?? m['requestId'] ?? 0;
  if (raw is num) return raw.toInt();
  final parsed = int.tryParse('$raw');
  return (parsed == null || parsed <= 0) ? 0 : parsed;
}

/// Image URLs, tolerating `imageUrls: null | [] | [ ... ]`.
List<String> requestImageUrls(Map<String, dynamic> m) {
  final raw = m['imageUrls'];
  if (raw is! List) return const [];
  return raw.whereType<String>().where((u) => u.isNotEmpty).toList();
}
