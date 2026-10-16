import 'delivery_windows.dart';

/// GloboExpats Delivery (the rider app), as the seller and buyer apps see it.
///
/// Nothing here is behind a client flag: the backend only sends these fields
/// (`appStatus`, `assignedInWindow`, trip events) while its own
/// `app.driver-app.enabled` is on, so with the flag off every function returns
/// null/empty and no widget draws anything.

/// The order's first accepted delivery window as the backend spells it in
/// `GET /transporters?windowDate=&windowSlot=`, or null when it has none.
({String date, String slot})? primaryWindowKey(Map<String, dynamic> windowFields) {
  final windows = readOrderDeliveryWindows(windowFields);
  final w = windows.isNotEmpty ? windows.first : legacyDeliveryWindow(windowFields);
  return w == null ? null : (date: w.dateYmd, slot: w.slot.name);
}

/// Driver-app state of a transporter row: MANUAL, INVITED or ACTIVE, or null
/// when the backend does not send it.
enum RiderAppStatus { manual, invited, active }

RiderAppStatus? riderAppStatus(Map<String, dynamic> transporter) =>
    switch (transporter['appStatus']?.toString()) {
      'MANUAL' => RiderAppStatus.manual,
      'INVITED' => RiderAppStatus.invited,
      'ACTIVE' => RiderAppStatus.active,
      _ => null,
    };

String? riderAppStatusLabel(RiderAppStatus? status) => switch (status) {
      RiderAppStatus.active => 'Uses the app',
      RiderAppStatus.invited => 'Invited',
      RiderAppStatus.manual => 'No app',
      null => null,
    };

/// "Uses the app · 3 already in this window", shown in the assign picker.
String? riderLoadLabel(Map<String, dynamic> transporter) {
  final parts = <String>[];
  if (riderAppStatus(transporter) == RiderAppStatus.active) parts.add('Uses the app');
  final load = transporter['assignedInWindow'];
  if (load is num) {
    parts.add(load == 0 ? 'Free in this window' : '${load.toInt()} already in this window');
  }
  return parts.isEmpty ? null : parts.join(' · ');
}

/// Owners (and managers) may invite; only the owner may end app access.
bool canInviteRider(Map<String, dynamic> transporter) {
  final status = riderAppStatus(transporter);
  final role = transporter['relationshipRole']?.toString();
  if (status == null || transporter['active'] == false) return false;
  if (status == RiderAppStatus.active) return role == 'OWNER';
  return role == 'OWNER' || role == 'MANAGER';
}

/// The wording of each step the rider reported, for a buyer or seller.
const _eventLabels = <String, String>{
  'ASSIGNED': 'A rider was assigned',
  'ACKED': 'The rider saw the assignment',
  'ARRIVED_PICKUP': 'The rider arrived to collect it',
  'LEFT_OUT': 'Not collected yet',
  'DISPATCHED': 'On the way to you',
  'ARRIVED_DROPOFF': 'The rider is at the delivery address',
  'DELIVERED': 'Delivered',
  'FAILED': 'Could not be delivered',
  'RETURNED': 'Taken back to the seller',
};

const _failureReasons = <String, String>{
  'BUYER_NOT_AVAILABLE': 'nobody was available',
  'WRONG_ADDRESS': 'the address could not be found',
  'BUYER_REFUSED': 'it was refused',
  'UNREACHABLE': 'the buyer could not be reached',
  'OTHER': 'another reason',
};

String describeTripEvent(Map<String, dynamic> event) {
  final type = event['type']?.toString() ?? '';
  final base = _eventLabels[type] ?? type;
  final reason = event['reason']?.toString();
  if (reason == null || reason.isEmpty) return base;
  if (type == 'FAILED') return '$base: ${_failureReasons[reason] ?? _plain(reason)}';
  if (type == 'LEFT_OUT') return '$base (${_plain(reason)})';
  return base;
}

String _plain(String code) => code.toLowerCase().replaceAll('_', ' ');
