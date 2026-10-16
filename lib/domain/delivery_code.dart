import 'time_utils.dart';

/// AU-039: delivery-code handoff model (BUYER_FLOW_SPEC §9/§10 + sandbox-proven
/// contract in e2e/API_MAP.md: verify-delivery body key is `code`, wrong-code
/// responses carry `attemptsRemaining`).
class DeliveryHandoff {
  final String? code; // exposed to the BUYER only while IN_TRANSIT
  final int attemptsRemaining;
  final bool locked;

  const DeliveryHandoff({
    this.code,
    this.attemptsRemaining = 3,
    this.locked = false,
  });

  factory DeliveryHandoff.fromOrder(Map<String, dynamic> order) =>
      DeliveryHandoff(
        code: order['deliveryCode']?.toString(),
      );

  /// The code card shows only while the order is IN_TRANSIT (after DELIVERED
  /// the backend nulls it — sandbox-proven).
  bool get shouldShowCode => code != null && code!.isNotEmpty && !locked;

  /// Parse a verify-delivery response. `{"success":false,"message":
  /// "INVALID_DELIVERY_CODE","attemptsRemaining":2}` or success payload.
  factory DeliveryHandoff.verifyResponse(Map<String, dynamic> resp) {
    final ok = resp['success'] == true || resp['status'] == 'DELIVERED';
    if (ok) return const DeliveryHandoff(attemptsRemaining: 0);
    final attempts = (resp['attemptsRemaining'] as num?)?.toInt() ?? 3;
    return DeliveryHandoff(attemptsRemaining: attempts, locked: attempts <= 0);
  }

  /// Confirmation deadline = fulfilledAt + 48h (T19). Returns null when the
  /// backend did not stamp fulfilledAt.
  static DateTime? confirmationDeadline(dynamic deliveredAt) {
    final t = TimeUtils.tryParseBackendTimestamp(deliveredAt);
    return t?.add(const Duration(hours: 48));
  }
}
