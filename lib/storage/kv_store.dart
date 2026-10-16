import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Key/value persistence for the app (JWT, cart, drafts).
///
/// Mirrors the web reference's `localStorage` usage: the token survives
/// reloads (`lib/api.ts` bearer), the cart is keyed per user
/// (`expatCartItems_{userId}` in `providers/cart-provider.tsx`), and sell /
/// checkout drafts live across restarts.
///
/// On web this backs onto localStorage; on IO it backs onto
/// SharedPreferences. All methods are no-op safe before [load] completes —
/// writes are replayed from memory once the platform store is ready, so a
/// caller that saves during startup never loses data (the value is kept in
/// [_mem] and flushed on init).
class KvStore {
  KvStore._();
  static final KvStore instance = KvStore._();

  SharedPreferences? _prefs;
  final Map<String, String> _mem = {};
  bool _ready = false;

  /// Keys written before init completed, flushed once ready.
  final List<String> _pendingFlush = [];

  /// Must be awaited before the first read that must observe persisted data
  /// (called once from main() before runApp).
  Future<void> load() async {
    if (_ready) return;
    _prefs = await SharedPreferences.getInstance();
    _ready = true;
    // Replay any pre-init writes so nothing saved during startup is lost.
    for (final key in _pendingFlush.toSet()) {
      final v = _mem[key];
      if (v != null) {
        await _prefs!.setString(key, v);
      }
    }
    _pendingFlush.clear();
  }

  String? getString(String key) {
    if (!_ready) return _mem[key];
    return _prefs?.getString(key) ?? _mem[key];
  }

  Future<void> setString(String key, String value) async {
    _mem[key] = value;
    if (_ready) {
      await _prefs?.setString(key, value);
    } else {
      _pendingFlush.add(key);
    }
  }

  Future<void> remove(String key) async {
    _mem.remove(key);
    if (_ready) await _prefs?.remove(key);
  }

  Map<String, dynamic>? getJson(String key) {
    final raw = getString(key);
    if (raw == null || raw.isEmpty) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      debugPrint('KvStore: corrupt JSON under $key — ignoring');
      return null;
    }
  }

  List<dynamic>? getJsonList(String key) {
    final raw = getString(key);
    if (raw == null || raw.isEmpty) return null;
    try {
      return jsonDecode(raw) as List<dynamic>;
    } catch (_) {
      debugPrint('KvStore: corrupt JSON list under $key — ignoring');
      return null;
    }
  }

  Future<void> setJson(String key, Object? value) =>
      setString(key, jsonEncode(value));

  // ---- canonical keys -----------------------------------------------------

  /// JWT + email of the signed-in user (web parity: `localStorage` token).
  static const kAuthToken = 'auth_token';
  static const kAuthEmail = 'auth_email';

  /// Per-user cart payload (web parity: `expatCartItems_{userId}`).
  static String cartKey(String userId) => 'expatCartItems_$userId';

  /// Cart snapshot taken when a proforma is created, so a killed app can
  /// resume payment without re-building the cart (BUYER_FLOW_SPEC §5.5).
  static const kProformaCartSnapshot = 'proforma_cart_snapshot';

  /// Last placed order reference (web parity: `localStorage.lastOrderId`).
  static const kLastOrderId = 'lastOrderId';

  /// Per-order completion snapshot (web parity: the checkout page's
  /// `localStorage.setItem('order_$id', …)`, read back by /checkout/success).
  static String orderKey(String orderId) => 'order_$orderId';
}
