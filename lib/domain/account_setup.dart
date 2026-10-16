import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import 'international_phone.dart';

/// What a new account still has to add before buying and selling run
/// smoothly — the mobile form of the web's setup popups
/// (`AccountSetupPrompts`: profile completion → working hours → payout
/// method). Instead of modals that block every page, the app keeps one
/// checklist that the Account tab, a one-off welcome sheet and the sell
/// wizard all read from.
enum SetupStep { whatsapp, location, workingHours, payout }

class AccountSetupStatus {
  const AccountSetupStatus({
    this.whatsapp = '',
    this.hasPinnedAddress = false,
    this.unpinnedAddress,
    this.showHours = false,
    this.hoursConfigured = false,
    this.showPayout = false,
    this.payoutConfigured = false,
  });

  /// The profile's WhatsApp number, '' when there is none.
  final String whatsapp;

  /// A complete saved address with a map pin: what delivery quotes and a
  /// listing's pickup point need.
  final bool hasPinnedAddress;

  /// A saved address that only lacks its pin — finishing it is one tap on the
  /// map rather than a whole new address.
  final Map<String, dynamic>? unpinnedAddress;

  /// Working hours only concern sellers (web `SellerScheduleSetupPrompt`).
  final bool showHours;
  final bool hoursConfigured;

  /// Payout only concerns sellers (web `SellerPayoutSetupPrompt`).
  final bool showPayout;
  final bool payoutConfigured;

  bool get hasWhatsApp => hasStoredPhone(whatsapp);

  List<SetupStep> get steps => [
        SetupStep.whatsapp,
        SetupStep.location,
        if (showHours) SetupStep.workingHours,
        if (showPayout) SetupStep.payout,
      ];

  bool isDone(SetupStep step) => switch (step) {
        SetupStep.whatsapp => hasWhatsApp,
        SetupStep.location => hasPinnedAddress,
        SetupStep.workingHours => hoursConfigured,
        SetupStep.payout => payoutConfigured,
      };

  List<SetupStep> get missing => [for (final s in steps) if (!isDone(s)) s];
  int get doneCount => steps.length - missing.length;
  bool get complete => missing.isEmpty;

  AccountSetupStatus copyWith({
    String? whatsapp,
    bool? hasPinnedAddress,
    bool clearUnpinned = false,
    bool? hoursConfigured,
    bool? payoutConfigured,
  }) =>
      AccountSetupStatus(
        whatsapp: whatsapp ?? this.whatsapp,
        hasPinnedAddress: hasPinnedAddress ?? this.hasPinnedAddress,
        unpinnedAddress: clearUnpinned ? null : unpinnedAddress,
        showHours: showHours,
        hoursConfigured: hoursConfigured ?? this.hoursConfigured,
        showPayout: showPayout,
        payoutConfigured: payoutConfigured ?? this.payoutConfigured,
      );
}

String _text(Object? v) => (v ?? '').toString().trim();

bool _complete(Map<String, dynamic> a) =>
    _text(a['street']).isNotEmpty &&
    _text(a['region']).isNotEmpty &&
    _text(a['country']).isNotEmpty;

bool _pinned(Map<String, dynamic> a) {
  final lat = a['latitude'], lng = a['longitude'];
  if (lat is! num || lng is! num) return false;
  // 0,0 is the "null island" a broken client once saved, never a real pin.
  return lat.abs() <= 90 && lng.abs() <= 180 && (lat != 0 || lng != 0);
}

bool _isSeller(Map<String, dynamic> me) {
  final roles = me['roles'];
  return roles is List &&
      roles.any((r) =>
          (r is Map && r['roleName'] == 'SELLER') || r == 'SELLER');
}

Future<Map<String, dynamic>?> _optional(Future<Map<String, dynamic>> read) =>
    read.then<Map<String, dynamic>?>((v) => v).catchError((Object _) => null);

/// Reads the checklist from the places it lives, all at once.
Future<AccountSetupStatus> loadAccountSetup(ApiClient api, String token) async {
  // Optional: a buyer (the schedule endpoint is seller-only), or a backend
  // without the endpoint, simply has no row rather than a broken checklist.
  final payout = _optional(api.getSellerPayoutPromptStatus(token));
  final hours = _optional(api.getSellerSchedule(token));
  // Together, so one failing read never leaves another's error unhandled.
  final results = await Future.wait<Object?>(
      [api.getUserDetails(token), api.getAddresses(token), payout, hours]);
  final profile = results[0] as Map<String, dynamic>;
  final rows = results[1] as List<Map<String, dynamic>>;
  final payoutStatus = results[2] as Map<String, dynamic>?;
  final hoursStatus = results[3] as Map<String, dynamic>?;

  final complete = rows.where(_complete).toList();
  final pinned = complete.any(_pinned);
  Map<String, dynamic>? unpinned;
  if (!pinned && complete.isNotEmpty) {
    unpinned = complete.firstWhere(
        (a) => a['default'] == true || a['isDefault'] == true,
        orElse: () => complete.first);
  }
  final seller = _isSeller(profile) || payoutStatus?['hasListings'] == true;
  return AccountSetupStatus(
    whatsapp: _text(profile['whatsAppPhoneNumber']),
    hasPinnedAddress: pinned,
    unpinnedAddress: unpinned,
    // Answering at all means the account is a seller.
    showHours: hoursStatus != null,
    hoursConfigured: hoursStatus?['configured'] == true,
    showPayout: seller && payoutStatus != null,
    payoutConfigured: payoutStatus?['configured'] == true,
  );
}

/// The one shared checklist. Every surface listens to it, so finishing a
/// step anywhere ticks it everywhere at once.
class AccountSetup extends ChangeNotifier {
  AccountSetup._();
  static final AccountSetup instance = AccountSetup._();

  AccountSetupStatus? _status;
  String? _token;
  DateTime? _loadedAt;
  Future<AccountSetupStatus?>? _inFlight;

  /// Null until the first read for the signed-in account lands.
  AccountSetupStatus? get status => _status;

  /// Re-reads unless the last answer for this account is under [maxAge] old.
  Future<AccountSetupStatus?> refresh(ApiClient api, String token,
      {Duration maxAge = Duration.zero}) {
    if (token != _token) {
      _token = token;
      _status = null;
      _loadedAt = null;
      _inFlight = null;
    }
    final at = _loadedAt;
    if (_status != null &&
        at != null &&
        DateTime.now().difference(at) < maxAge) {
      return Future.value(_status);
    }
    return _inFlight ??= _load(api, token);
  }

  Future<AccountSetupStatus?> _load(ApiClient api, String token) async {
    try {
      final s = await loadAccountSetup(api, token);
      if (token != _token) return null; // signed out or switched meanwhile
      _status = s;
      _loadedAt = DateTime.now();
      notifyListeners();
      return s;
    } catch (_) {
      // The checklist is guidance; a failed read keeps whatever was known.
      return _status;
    } finally {
      if (token == _token) _inFlight = null;
    }
  }

  /// Ticks a step the moment it is saved, before any re-read confirms it.
  void markWhatsApp(String number) => _update(_status?.copyWith(whatsapp: number));
  void markLocation() =>
      _update(_status?.copyWith(hasPinnedAddress: true, clearUnpinned: true));
  void markWorkingHours() => _update(_status?.copyWith(hoursConfigured: true));

  void _update(AccountSetupStatus? next) {
    if (next == null) return;
    _status = next;
    notifyListeners();
  }

  /// Signed out: forget the previous account's checklist.
  void clear() {
    _token = null;
    _status = null;
    _loadedAt = null;
    _inFlight = null;
    notifyListeners();
  }

  @visibleForTesting
  void debugSet(AccountSetupStatus? s, {String? token}) {
    _status = s;
    _token = token;
    _loadedAt = s == null ? null : DateTime.now();
    notifyListeners();
  }
}
