import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../storage/kv_store.dart';

/// AU-050: saved/wishlist products, persisted per user (web parity key
/// `expatSavedProducts_{email}`), backed by the real `/api/saved-products`
/// endpoints (NO `/v1` — sandbox-proven contract). The local set is the
/// source of truth for heart states; the API is hit on toggle and on load.
class SavedProductsStore extends ChangeNotifier {
  /// App-wide instance so a heart toggled on a product card, the detail
  /// screen, or the saved-items list all agree on the same state instead of
  /// each screen tracking its own disconnected copy.
  static final SavedProductsStore instance = SavedProductsStore();

  final KvStore _kv;
  final ApiClient _api;
  final Set<int> _ids = {};
  String? _userKey;
  bool _loaded = false;

  SavedProductsStore({KvStore? kv, ApiClient? api})
      : _kv = kv ?? KvStore.instance,
        _api = api ?? ApiClient();

  Set<int> get ids => Set.unmodifiable(_ids);
  bool isSaved(int productId) => _ids.contains(productId);
  bool get loaded => _loaded;

  /// True when [email]'s saved-products set is the one currently loaded.
  bool isLoadedFor(String email) => _loaded && _userKey == _keyFor(email);

  String _keyFor(String email) => 'expatSavedProducts_$email';

  /// Load from disk first (instant hearts), then reconcile with the server.
  Future<void> load(String email, String token) async {
    _userKey = _keyFor(email);
    final cached = _kv.getJson(_userKey!);
    if (cached != null) {
      _ids
        ..clear()
        ..addAll((cached['productIds'] as List?)?.whereType<num>().map((e) => e.toInt()) ?? const []);
    }
    _loaded = true;
    notifyListeners();
    try {
      // ignore: discarded_futures
      await refreshFromServer(token);
    } catch (_) {
      // Offline, a dropped connection, a timeout or an auth hiccup: keep the
      // cached set. Catching only ApiException was not enough — a phone with
      // no signal throws SocketException/ClientException, and that escaped
      // all the way out of app startup.
    }
  }

  Future<void> refreshFromServer(String token) async {
    final remote = await _api.fetchSavedProductIds(token);
    _ids..clear()..addAll(remote);
    _persist();
    notifyListeners();
  }

  /// Toggle; hits the REAL API and only then flips local state. Returns the
  /// new state. On API failure nothing changes and the error rethrows.
  Future<bool> toggle(int productId, String token) async {
    if (_ids.contains(productId)) {
      await _api.unsaveProduct(token, productId);
      _ids.remove(productId);
    } else {
      await _api.saveProduct(token, productId);
      _ids.add(productId);
    }
    _persist();
    notifyListeners();
    return _ids.contains(productId);
  }

  void _persist() {
    if (_userKey == null) return;
    // ignore: discarded_futures
    _kv.setString(_userKey!, '{"productIds":${_ids.toList()}}');
  }

  /// Logout hygiene: clear in-memory state (disk stays scoped per user).
  void reset() {
    _ids.clear();
    _userKey = null;
    _loaded = false;
    notifyListeners();
  }
}
