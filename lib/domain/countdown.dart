import 'time_utils.dart';

/// AU-031: proforma / payment countdown model.
///
/// Port of the web's `components/payment-countdown.tsx` + `proforma-countdown.tsx`
/// semantics (BUYER_FLOW_SPEC §7):
/// - ticks until `expiresAt` (= createdAt + 60 min for proformas);
/// - HIDDEN once status != PENDING_PAYMENT (review pauses expiry);
/// - urgent styling when remaining < 3 h.
class Countdown {
  Countdown._();

  /// Remaining time until [expiresAtUtc] from [nowUtc]; negative when past.
  static Duration remaining(DateTime expiresAtUtc, DateTime nowUtc) =>
      expiresAtUtc.toUtc().difference(nowUtc.toUtc());

  /// Urgent variant threshold (< 3 h remaining) per BUYER_FLOW_SPEC §7.
  static const Duration urgentThreshold = Duration(hours: 3);

  static bool isUrgent(Duration remaining) =>
      remaining > Duration.zero && remaining < urgentThreshold;

  /// `HH:MM:SS` ticking label; clamps at zero.
  static String format(Duration d) {
    if (d.isNegative) return '00:00:00';
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    final s = d.inSeconds.remainder(60);
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(h)}:${two(m)}:${two(s)}';
  }

  /// Whether the countdown is VISIBLE at all: only while the proforma is
  /// still awaiting payment. PAYMENT_SUBMITTED hides it (expiry paused under
  /// review); CONFIRMED/EXPIRED/CANCELLED hide it too.
  static bool visibleForStatus(String? proformaStatus) =>
      proformaStatus == 'PENDING_PAYMENT';

  /// Full label for a proforma payment step, e.g. "Complete payment within
  /// 00:42:13". Returns null when the countdown must not render.
  static String? proformaLabel({
    required String? proformaStatus,
    required dynamic expiresAt,
    required DateTime nowUtc,
  }) {
    final s = proformaState(
        proformaStatus: proformaStatus, expiresAt: expiresAt, nowUtc: nowUtc);
    return s?.label;
  }

  /// Web parity `PaymentCountdown`: an invoice past its deadline gets its own
  /// state rather than the timer silently disappearing — the buyer needs to
  /// be told the reservation is gone and that re-ordering is the way out.
  /// Under three hours it also turns urgent, as web does.
  static ProformaCountdownState? proformaState({
    required String? proformaStatus,
    required dynamic expiresAt,
    required DateTime nowUtc,
  }) {
    if (!visibleForStatus(proformaStatus)) return null;
    final exp = TimeUtils.tryParseBackendTimestamp(expiresAt);
    if (exp == null) return null;
    final rem = remaining(exp, nowUtc);
    if (rem.isNegative || rem == Duration.zero) {
      return const ProformaCountdownState(
        tone: CountdownTone.expired,
        title: 'Proforma invoice has expired',
        label: 'This proforma invoice has expired and the reserved items were '
            'released. Please re-order.',
      );
    }
    final urgent = rem < const Duration(hours: 3);
    return ProformaCountdownState(
      tone: urgent ? CountdownTone.urgent : CountdownTone.normal,
      title: urgent ? 'Proforma invoice expiring soon' : 'Proforma invoice expires',
      label: 'Complete payment within ${format(rem)}',
    );
  }
}

enum CountdownTone { normal, urgent, expired }

class ProformaCountdownState {
  final CountdownTone tone;
  final String title;
  final String label;
  const ProformaCountdownState(
      {required this.tone, required this.title, required this.label});
}
