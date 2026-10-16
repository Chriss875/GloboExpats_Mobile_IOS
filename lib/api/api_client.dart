import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'package:http_parser/http_parser.dart';

import 'timeout_client.dart';
import '../config.dart';
import '../storage/kv_store.dart';
import '../models/category.dart';
import '../models/order.dart';
import '../domain/seller_wallet.dart' show SellerWallet;
import '../domain/product_source.dart';
import '../models/product.dart';
import '../models/product_detail.dart';
import '../models/sell_form_state.dart' show PendingImage;
import '../domain/rentals.dart';
import '../domain/product_choices.dart' show AttributeDefinition;
import '../domain/pending_actions.dart' show requestPendingActionsRefresh;
import '../domain/notification_feed.dart' show extractNotificationContent;
import '../domain/commission_calculator.dart' show setLiveCommissionRates;
import '../domain/image_upload.dart'
    show imageUploadContentType, safeUploadFilename;

/// Thin HTTP client for the GloboExpats public API.
///
/// Only public (`permitAll`) endpoints are used here — product categories,
/// featured/newest listings, and product search. Authenticated calls (JWT)
/// are handled separately once auth is in scope.
/// A pending upload image carried as bytes + filename (web-safe; AU-040 D1).
class PendingImageRef {
  final Uint8List bytes;
  final String filename;
  const PendingImageRef({required this.bytes, required this.filename});
}

/// One image file part, with the Content-Type the backend validates on.
///
/// `MultipartFile.fromBytes` labels a part `application/octet-stream` unless
/// it is told otherwise, and `ImageStorageService.validateFile` rejects on
/// exactly that string before it looks at a single byte — which is why an
/// upload came back "Invalid file format: application/octet-stream. Allowed:
/// [image/webp, image/jpeg, image/png, image/jpg]". The type is read from the
/// bytes, not the filename, because the wizard re-encodes to WebP while the
/// picker's name still ends in `.jpg`.
http.MultipartFile _imagePart(String field, List<int> bytes, String filename) {
  final data = bytes is Uint8List ? bytes : Uint8List.fromList(bytes);
  final mime = imageUploadContentType(data, filename);
  final slash = mime.indexOf('/');
  return http.MultipartFile.fromBytes(field, data,
      filename: safeUploadFilename(filename),
      contentType:
          MediaType(mime.substring(0, slash), mime.substring(slash + 1)));
}

/// One entry in [ApiClient]'s read cache: the request itself, so concurrent
/// callers share it rather than each issuing their own, plus when the answer
/// stops being fresh enough to hand out.
class _CachedRead {
  _CachedRead(this.future, this.expiresAt);
  final Future<Object?> future;
  final DateTime expiresAt;
  bool get isExpired => DateTime.now().isAfter(expiresAt);
}

class ApiClient {
  /// One connection pool for the whole app.
  ///
  /// 56 places construct an `ApiClient()` of their own, and each used to get
  /// its own `http.Client` — so every screen opened a fresh TCP+TLS
  /// connection to the same host rather than reusing the warm one the last
  /// screen had just finished with. On mobile data that handshake is most of
  /// the delay before a screen can show anything. Tests still inject their
  /// own client and are unaffected.
  /// Wrapped so no request can hang forever on a weak signal — see
  /// [TimeoutClient].
  static final http.Client _sharedClient = TimeoutClient(http.Client());

  ApiClient({http.Client? client, String? baseUrl})
      : _client = client ?? _sharedClient,
        baseUrl = baseUrl ?? AppConfig.apiBaseUrl;

  final http.Client _client;
  final String baseUrl;

  // ---------------------------------------------------------------- reads
  /// In-flight and recently-finished GETs, so the same read issued from two
  /// widgets in the same breath costs one request.
  ///
  /// Keyed by the client identity as well as the URL: the shared client gives
  /// the whole app one bucket, while each test's MockClient gets its own and
  /// cannot be polluted by another test's fixtures.
  static final Map<String, _CachedRead> _reads = {};

  /// Drops cached reads whose key contains [match] (all of them when null).
  /// Called after any mutation that would make one stale.
  static void invalidateReads([String? match]) {
    if (match == null) {
      _reads.clear();
      return;
    }
    _reads.removeWhere((key, _) => key.contains(match));
  }

  /// Runs [read], or returns the in-flight/recent result for [key].
  ///
  /// A failure is never cached — it is evicted as soon as it lands, so a
  /// screen that retries after an outage actually retries.
  /// [scope] separates entries that belong to different sessions. Without
  /// it, a read cached for one signed-in user was handed to the next one:
  /// log out, sign in as someone else within the TTL, and the app showed the
  /// previous account's profile everywhere it reads this. The token is
  /// reduced to its hash — a cache key is not a place to keep one.
  /// [forceRefresh] is for a caller whose whole job is to be current — the
  /// pending-work strip re-reading because something just changed. It skips
  /// the entry and REPLACES it, so everyone else gets the fresh answer too.
  Future<T> _cachedRead<T>(String key, Duration ttl, Future<T> Function() read,
      {String? scope, bool forceRefresh = false}) {
    final full = '${identityHashCode(_client)}|$baseUrl|$key'
        '${scope == null ? '' : '|${scope.hashCode}'}';
    final existing = _reads[full];
    if (!forceRefresh && existing != null && !existing.isExpired) {
      return existing.future as Future<T>;
    }
    final future = read();
    _reads[full] = _CachedRead(future, DateTime.now().add(ttl));
    // Bookkeeping only. It must HANDLE the error rather than rethrow it:
    // rethrowing completes this derived future with an error nobody awaits,
    // which the test zone reports as an unhandled exception even though the
    // real caller is handling the original future perfectly well.
    future.then<void>((_) {}, onError: (Object _) => _reads.remove(full));
    return future;
  }

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$baseUrl$path').replace(queryParameters: query);

  /// Fetch raw bytes for an asset URL (used by AppImage to bypass a malformed
  /// upload Content-Type that Flutter web's canvas rejects).
  Future<Uint8List> getBytes(String url) async {
    final u = url.startsWith('http') ? url : '$baseUrl/$url';
    final resp = await _client.get(Uri.parse(u));
    if (resp.statusCode != 200) throw ApiException('image ${resp.statusCode}');
    return resp.bodyBytes;
  }

  Map<String, String> get _headers => {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };

  /// The taxonomy: read by Home, Browse, Search, the filter sheet, Sell, Edit
  /// listing and the request composer. It changes when an admin edits it, so
  /// a minute of staleness is invisible and saves seven requests.
  Future<List<Category>> fetchCategories() =>
      _cachedRead('categories', const Duration(minutes: 5), _fetchCategories);

  Future<List<Category>> _fetchCategories() async {
    final resp = await _client.get(_uri('/api/v1/products/categories'),
        headers: _headers);
    if (resp.statusCode != 200) {
      throw ApiException('categories failed: HTTP ${resp.statusCode}');
    }
    final data = jsonDecode(resp.body) as List;
    return data
        .whereType<Map<String, dynamic>>()
        .map((e) => Category.fromJson(e))
        .toList();
  }

  Future<List<Map<String, dynamic>>> fetchHomePreferences() async {
    final response = await _client
        .get(_uri('/api/v1/home/preference-collections'), headers: _headers);
    if (response.statusCode != 200)
      throw ApiException('Could not load collections');
    final decoded = jsonDecode(response.body);
    final data = decoded is Map ? decoded['data'] : decoded;
    return (data as List).whereType<Map<String, dynamic>>().toList();
  }

  /// Recommended product-choice attribute definitions for a subcategory
  /// (Color, Size, Condition, ...): `GET
  /// /api/v1/product-attributes/subcategories/{subcategoryId}` — confirmed
  /// against `ProductAttributeDefinitionController.recommendedForSubcategory`,
  /// a bare JSON array (no `{data: [...]}` wrapper).
  Future<List<AttributeDefinition>> getRecommendedProductAttributes(
      int subcategoryId) async {
    final resp = await _client.get(
        _uri('/api/v1/product-attributes/subcategories/$subcategoryId'),
        headers: _headers);
    if (resp.statusCode != 200) {
      throw ApiException('product-attributes failed: HTTP ${resp.statusCode}');
    }
    final data = jsonDecode(resp.body) as List;
    return data
        .whereType<Map<String, dynamic>>()
        .map((e) => AttributeDefinition.fromJson(e))
        .toList();
  }

  /// Fetch a paginated listing (featured / newest / within a category).
  /// Mirrors `/api/v1/displayItem/{kind}` response: `{ content: [...], ... }`.
  Future<List<Product>> fetchDisplay(
    String kind, {
    int page = 0,
    int size = 12,
    int? categoryId,
    bool newest = false,
    String? productSource,
  }) async {
    final query = {
      'page': '$page',
      'size': '$size',
      if (categoryId != null) 'categoryId': '$categoryId',
      if (newest) 'sort': 'createdAt,desc',
      if (apiProductSource(productSource) != null)
        'productSource': apiProductSource(productSource)!,
    };
    final path = categoryId != null
        ? '/api/v1/displayItem/filter'
        : '/api/v1/displayItem/$kind';
    final resp = await _client.get(_uri(path, query), headers: _headers);
    if (resp.statusCode != 200) {
      throw ApiException('$kind failed: HTTP ${resp.statusCode}');
    }
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : data is List
            ? data
            : const <dynamic>[];
    return content
        .whereType<Map<String, dynamic>>()
        .map((e) => Product.fromJson(e))
        .toList();
  }

  /// AU-045: featured with a per-load SHUFFLE seed — web parity for
  /// `getFeaturedListings({seed})` (POST /displayItem/filter, priceSort
  /// SHUFFLE, maxPrice = web FEATURED_MAX_PRICE 200000, lib/api.ts:82).
  Future<List<Product>> fetchDisplayShuffle(String seed,
      {int page = 0, int size = 12, String? productSource}) async {
    final source = apiProductSource(productSource);
    // AU-047: backend binds @RequestBody — criteria must ride the body too
    // (same fix as fetchFiltered).
    final resp = await _client.post(
      _uri('/api/v1/displayItem/filter', {
        'priceSort': 'SHUFFLE',
        'seed': seed,
        'maxPrice': '200000',
        'page': '$page',
        'size': '$size',
        if (source != null) 'productSource': source,
      }),
      headers: _headers,
      body: jsonEncode({
        'priceSort': 'SHUFFLE',
        'seed': seed,
        'maxPrice': 200000,
        'page': page,
        'size': size,
        if (source != null) 'productSource': source,
      }),
    );
    if (resp.statusCode != 200) {
      throw ApiException('featured shuffle failed: HTTP ${resp.statusCode}');
    }
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : const <dynamic>[];
    return content
        .whereType<Map<String, dynamic>>()
        .map((e) => Product.fromJson(e))
        .toList();
  }

  /// Product search: `/api/v1/products/search?q=...`
  Future<List<Product>> search(String query) async {
    final resp = await _client.get(
      _uri('/api/v1/products/search', {'q': query, 'size': '24'}),
      headers: _headers,
    );
    if (resp.statusCode != 200) {
      throw ApiException('search failed: HTTP ${resp.statusCode}');
    }
    final data = jsonDecode(resp.body);
    // /products/search returns { products: [...], totalPages, ... } — NOT 'content'.
    final content = data is Map && data['products'] is List
        ? data['products'] as List
        : data is Map && data['content'] is List
            ? data['content'] as List
            : data is List
                ? data
                : const <dynamic>[];
    return content
        .whereType<Map<String, dynamic>>()
        .map((e) => Product.fromJson(e))
        .toList();
  }

  /// Login: POST `/api/v1/auth/login` `{email,password}` -> `{token,email,role}`.
  Future<String> login(String email, String password) async {
    final resp = await _client.post(
      _uri('/api/v1/auth/login'),
      headers: _headers,
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (resp.statusCode != 200) {
      throw ApiException(_authError(resp));
    }
    final data = (jsonDecode(resp.body) as Map).cast<String, dynamic>();
    final token = data['token'] as String?;
    if (token == null || token.isEmpty) {
      throw ApiException('Login failed: no token returned');
    }
    return token;
  }

  /// Logout: POST `/api/v1/auth/logout` (best-effort; web parity
  /// `apiClient.logout()` in `lib/api.ts:3133`). Authenticated call.
  Future<void> logout(String token) async {
    try {
      await _client.post(
        _uri('/api/v1/auth/logout'),
        headers: {..._headers, 'Authorization': 'Bearer $token'},
      );
    } catch (_) {
      rethrow; // caller decides (AuthStore swallows it)
    }
  }

  /// Register: POST `/api/v1/auth/register`.
  Future<void> register({
    required String firstName,
    required String lastName,
    required String email,
    required String password,
  }) async {
    final resp = await _client.post(
      _uri('/api/v1/auth/register'),
      headers: _headers,
      body: jsonEncode({
        'firstName': firstName,
        'lastName': lastName,
        'emailAddress': email,
        'password': password,
      }),
    );
    if (resp.statusCode != 201 && resp.statusCode != 200) {
      throw ApiException(_authError(resp));
    }
  }

  String _authError(http.Response resp) {
    String msg = 'Request failed (HTTP ${resp.statusCode})';
    final unauthorized = resp.statusCode == 401;
    try {
      final data = jsonDecode(resp.body);
      if (data is Map) {
        // extract a terse message if present
        final m2 = data['message'] ?? data['error'] ?? data;
        if (m2 is String) msg = m2;
      } else if (data is List && data.isNotEmpty) {
        msg = data
            .map(
                (e) => e is Map ? (e['message'] ?? e).toString() : e.toString())
            .join(', ');
      }
    } catch (_) {}
    if (unauthorized) {
      throw ApiException(msg, unauthorized: true);
    }
    return msg;
  }

  /// All products: `/api/v1/products/get-all-products` (public, paginated).
  /// Optional `categoryId` filters to one category (the `displayItem/filter`
  /// endpoint 500s on the sandbox, so category browsing uses this).
  Future<List<Product>> fetchAllProducts(
      {int page = 0, int size = 24, int? categoryId}) async {
    final resp = await _client.get(
      _uri('/api/v1/products/get-all-products', {
        'page': '$page',
        'size': '$size',
        if (categoryId != null) 'categoryId': '$categoryId',
      }),
      headers: _headers,
    );
    if (resp.statusCode != 200) {
      throw ApiException('get-all-products failed: HTTP ${resp.statusCode}');
    }
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : data is List
            ? data
            : const <dynamic>[];
    return content
        .whereType<Map<String, dynamic>>()
        .map(Product.fromJson)
        .toList();
  }

  /// Filtered + paginated catalog: `POST /api/v1/displayItem/filter`.
  /// This is the endpoint that actually applies `categoryIds` on the backend
  /// (`get-all-products` ignores the filter), so both the "All categories" feed
  /// and per-category browsing go through it. Returns the page's products plus
  /// the server's `totalElements` so callers can drive infinite scroll and stop
  /// cleanly at the last page.
  /// Filtered marketplace feed: POST `/api/v1/displayItem/filter`.
  ///
  /// Criteria travel as query params (web-parity contract, see `filterProducts`
  /// in the reference `lib/api.ts`); the body stays empty. SHUFFLE + seed apply
  /// to unsearched browsing only — a searchTerm keeps backend relevance order.
  Future<({List<Product> products, int totalElements})> fetchFiltered({
    List<int>? categoryIds,
    List<int>? subcategoryIds,
    String? searchTerm,
    String? neighbourhood,
    double? minPrice,
    double? maxPrice,
    String? conditionFilter,
    String? productSource,
    String? priceSort,
    String? seed,
    int? sellerId,
    bool trackSearch = false,
    int page = 0,
    int size = 24,
    // Short Stays: only listings free for the whole half-open range
    // (web 2026-10, `rentalStartDate` / `rentalEndDate` as yyyy-MM-dd).
    String? rentalStartDate,
    String? rentalEndDate,
  }) async {
    // Lists as lists: a map entry per id kept only the LAST one, so a
    // "Shop by Preference" tile's several subcategories reached the query
    // string as one (the JSON body below always carried them all).
    final q = <String, dynamic>{
      if (categoryIds != null && categoryIds.isNotEmpty)
        'categoryIds': [for (final id in categoryIds) '$id'],
      if (subcategoryIds != null && subcategoryIds.isNotEmpty)
        'subcategoryIds': [for (final id in subcategoryIds) '$id'],
      if (minPrice != null) 'minPrice': '${minPrice.round()}',
      if (maxPrice != null) 'maxPrice': '${maxPrice.round()}',
      if (conditionFilter != null && conditionFilter.isNotEmpty)
        'conditionFilter': conditionFilter,
      if (priceSort != null && priceSort.isNotEmpty) 'priceSort': priceSort,
      if (seed != null && seed.isNotEmpty) 'seed': seed,
      if (sellerId != null) 'sellerId': '$sellerId',
      if (searchTerm != null && searchTerm.trim().isNotEmpty)
        'searchTerm': searchTerm.trim(),
      if (neighbourhood != null && neighbourhood.trim().isNotEmpty)
        'neighbourhood': neighbourhood.trim(),
      if (productSource != null && productSource.isNotEmpty)
        'productSource': productSource,
      if (trackSearch) 'trackSearch': 'true',
      if (rentalStartDate != null && rentalEndDate != null) ...{
        'rentalStartDate': rentalStartDate,
        'rentalEndDate': rentalEndDate,
      },
      'page': '$page',
      'size': '$size',
    };
    // AU-047 verifier blocker: the backend's DisplayItemsController binds a
    // @RequestBody HomePageFilterDTO — query params alone never reach the
    // filter logic (every response came back unfiltered). The reference
    // `filterProducts` sends the criteria BOTH as query params AND in the
    // JSON body; mirror that key-for-key.
    final body = <String, dynamic>{
      if (categoryIds != null && categoryIds.isNotEmpty)
        'categoryIds': categoryIds,
      if (subcategoryIds != null && subcategoryIds.isNotEmpty)
        'subcategoryIds': subcategoryIds,
      if (minPrice != null) 'minPrice': minPrice.round(),
      if (maxPrice != null) 'maxPrice': maxPrice.round(),
      if (conditionFilter != null && conditionFilter.isNotEmpty)
        'conditionFilter': conditionFilter,
      if (priceSort != null && priceSort.isNotEmpty) 'priceSort': priceSort,
      if (seed != null && seed.isNotEmpty) 'seed': seed,
      if (sellerId != null) 'sellerId': sellerId,
      if (searchTerm != null && searchTerm.trim().isNotEmpty)
        'searchTerm': searchTerm.trim(),
      if (neighbourhood != null && neighbourhood.trim().isNotEmpty)
        'neighbourhood': neighbourhood.trim(),
      if (productSource != null && productSource.isNotEmpty)
        'productSource': productSource,
      if (trackSearch) 'trackSearch': true,
      if (rentalStartDate != null && rentalEndDate != null) ...{
        'rentalStartDate': rentalStartDate,
        'rentalEndDate': rentalEndDate,
      },
      'page': page,
      'size': size,
    };
    final resp = await _client.post(
      Uri.parse('$baseUrl/api/v1/displayItem/filter')
          .replace(queryParameters: q),
      headers: _headers,
      body: jsonEncode(body),
    );
    if (resp.statusCode != 200) {
      throw ApiException('displayItem/filter failed: HTTP ${resp.statusCode}');
    }
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : data is List
            ? data
            : const <dynamic>[];
    final total = data is Map
        ? (data['totalElements'] as num?)?.toInt() ?? content.length
        : content.length;
    return (
      products: content
          .whereType<Map<String, dynamic>>()
          .map(Product.fromJson)
          .toList(),
      totalElements: total,
    );
  }

  /// Neighbourhood options for the browse filter sheet (public):
  /// GET `/api/v1/displayItem/neighbourhoods` -> `[{name, itemCount}]`
  /// (reference getAvailableNeighbourhoods shape; bare strings accepted
  /// defensively). Names only — itemCount is display metadata on web.
  Future<List<String>> fetchNeighbourhoods() async {
    final resp = await _client.get(_uri('/api/v1/displayItem/neighbourhoods'),
        headers: _headers);
    if (resp.statusCode != 200) {
      throw ApiException('neighbourhoods failed: HTTP ${resp.statusCode}');
    }
    final data = jsonDecode(resp.body);
    final list = data is List
        ? data
        : data is Map<String, dynamic> && data['data'] is List
            ? data['data'] as List
            : const <dynamic>[];
    return list
        .map((e) => e is String
            ? e
            : e is Map<String, dynamic>
                ? '${e['name'] ?? ''}'
                : '')
        .where((n) => n.trim().isNotEmpty)
        .toList();
  }

  /// Delivery quote for checkout (authenticated):
  /// POST `/api/v1/checkout/delivery-quote`. `latitude`/`longitude` are the
  /// buyer's map pin from the chosen saved address (AU-023 lockstep) — they
  /// drive Google routing and are REQUIRED for a real route.
  Future<Map<String, dynamic>> deliveryQuote(
    String token, {
    required String city,
    required String country,
    double? latitude,
    double? longitude,
    required List<Map<String, dynamic>> items,
  }) async {
    final resp = await _client.post(
      _uri('/api/v1/checkout/delivery-quote'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'destination': {
          'city': city,
          'country': country,
          if (latitude != null) 'latitude': latitude,
          if (longitude != null) 'longitude': longitude,
        },
        'items': items,
      }),
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return (jsonDecode(resp.body) as Map).cast<String, dynamic>();
  }

  /// Seller availability windows for checkout (web `getAvailabilityWindows`,
  /// lib/api.ts:2809): POST `/api/v1/checkout/availability-windows` body
  /// `{items:[{productId, quantity: 1}]}`. Returns the raw `AvailabilityWindow[]`
  /// rows — parse with `parseSellerAvailabilityWindows` (delivery_windows.dart).
  /// Empty list when the seller offers none; the checkout step machine then
  /// falls back to the six Today/Tomorrow composites.
  Future<List<dynamic>> fetchSellerAvailabilityWindows(
    String token,
    List<int> productIds,
  ) async {
    if (productIds.isEmpty) return const [];
    final resp = await _client.post(
      _uri('/api/v1/checkout/availability-windows'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'items': [
          for (final productId in productIds)
            {'productId': productId, 'quantity': 1},
        ],
      }),
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    if (data is List) return data;
    if (data is Map && data['windows'] is List) return data['windows'] as List;
    return const [];
  }

  /// Full checkout availability response used by the web checkout. Besides
  /// dated seller windows it includes the seller working-hours notices shown
  /// beside each seller group.
  Future<Map<String, dynamic>> fetchCheckoutAvailabilitySummary(
    String token,
    List<int> productIds,
  ) async {
    if (productIds.isEmpty) {
      return const {'windows': <dynamic>[], 'sellerNotices': <dynamic>[]};
    }
    final resp = await _client.post(
      _uri('/api/v1/checkout/availability-windows/summary'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'items': [
          for (final productId in productIds)
            {'productId': productId, 'quantity': 1},
        ],
      }),
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    if (data is! Map) return const {};
    return data.cast<String, dynamic>();
  }

  /// Submit payment for a proforma — explicit AU-030 alias of [submitPayment]
  /// (BUYER_FLOW_SPEC §6): body `{transactionReferences, paymentMethodType}`,
  /// response = updated ProformaInvoiceDTO. Success is decided by the CALLER
  /// branching on `status == PAYMENT_SUBMITTED`, never on body-emptiness.
  Future<Map<String, dynamic>> submitProformaPayment(
    String token,
    String proformaId, {
    List<String>? transactionReferences,
    String paymentMethodType = 'MOBILE_MONEY',
  }) =>
      submitPayment(
        token,
        proformaId,
        transactionReferences: transactionReferences,
        paymentMethodType: paymentMethodType,
      );

  /// Upload proof-of-payment receipts for a proforma:
  /// POST `/api/v1/proformas/{id}/receipts` multipart — files field
  /// `receipts` (JPEG/PNG/WEBP/PDF ≤5 MB each) + text part `details`
  /// carrying `{transactionReferences?, note?}` as PLAIN TEXT (the backend's
  /// `details` field is a raw String it parses itself). Returns the created
  /// PaymentReceiptDTO rows (`receiptId`, `status:'SUBMITTED'`, …).
  Future<List<Map<String, dynamic>>> uploadProformaReceipts(
    String token,
    String proformaId, {
    required List<({Uint8List bytes, String filename, String contentType})>
        files,
    List<String>? transactionReferences,
    String? note,
  }) async {
    final req = http.MultipartRequest(
      'POST',
      _uri('/api/v1/proformas/$proformaId/receipts'),
    )..headers.addAll({
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
      });
    for (final f in files) {
      final parts = f.contentType.split('/');
      req.files.add(http.MultipartFile.fromBytes('receipts', f.bytes,
          filename: f.filename,
          contentType: MediaType(parts.first, parts.last)));
    }
    if ((transactionReferences != null && transactionReferences.isNotEmpty) ||
        (note != null && note.isNotEmpty)) {
      req.fields['details'] = jsonEncode({
        if (transactionReferences != null && transactionReferences.isNotEmpty)
          'transactionReferences': transactionReferences,
        if (note != null && note.isNotEmpty) 'note': note,
      });
    }
    final streamed = await _client.send(req);
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      throw ApiException(_authError(resp));
    }
    final data = jsonDecode(resp.body);
    final list = data is List
        ? data
        : (data is Map ? data['data'] ?? const [] : const []);
    return list.whereType<Map<String, dynamic>>().toList();
  }

  /// Proforma status/expiry polling (authenticated):
  /// GET `/api/v1/proformas/{proformaId}` -> the proforma map.
  Future<Map<String, dynamic>> getProforma(
      String token, String proformaId) async {
    final resp = await _client.get(
      _uri('/api/v1/proformas/$proformaId'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return (jsonDecode(resp.body) as Map).cast<String, dynamic>();
  }

  // ---- Selcom mobile wallet (USSD push) ------------------------------------
  // Web parity `lib/api.ts:3544` + `hooks/use-selcom-wallet-payment.ts`:
  // createSelcomOrder -> pushSelcomWallet -> poll getSelcomPaymentStatus.
  // The client only says WHICH proforma; amount, vendor and callback are all
  // decided server-side, so nothing here can change what is charged.

  /// Registers a Selcom order for the proforma. One per payment attempt —
  /// Selcom requires a unique order_id, so a retry after a terminal outcome
  /// has to create a new one.
  Future<Map<String, dynamic>> createSelcomOrder(
      String token, String proformaId) async {
    final resp = await _client.post(
      _uri('/api/v1/proformas/$proformaId/pay/selcom'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    return _asMap(resp.body);
  }

  /// Sends the USSD PIN prompt to the buyer's wallet. `msisdn` is optional —
  /// the backend falls back to the phone captured at checkout. A PENDING
  /// result means "prompt delivered, waiting for the PIN", not a failure.
  Future<Map<String, dynamic>> pushSelcomWallet(String token, String proformaId,
      {String? msisdn}) async {
    final resp = await _client.post(
      _uri('/api/v1/proformas/$proformaId/pay/selcom/wallet-push',
          msisdn == null || msisdn.isEmpty ? null : {'msisdn': msisdn}),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    return _asMap(resp.body);
  }

  /// Sends an in-app payment request to a number registered with Selcom
  /// Wallet (Selcom Pesa) — web `pushSelcomPesa`, lib/api.ts. Same order,
  /// same status poll as [pushSelcomWallet]; only the channel differs, and
  /// the approval happens inside the Selcom Wallet app rather than on a USSD
  /// prompt.
  Future<Map<String, dynamic>> pushSelcomPesa(String token, String proformaId,
      {String? msisdn}) async {
    final resp = await _client.post(
      _uri('/api/v1/proformas/$proformaId/pay/selcom/selcom-pesa-push',
          msisdn == null || msisdn.isEmpty ? null : {'msisdn': msisdn}),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    return _asMap(resp.body);
  }

  /// Current Selcom status of the latest order — polled every few seconds.
  /// Selcom's webhook only fires on success and lands on the backend, so this
  /// is the only way the app learns about a rejection quickly.
  Future<Map<String, dynamic>> getSelcomPaymentStatus(
      String token, String proformaId) async {
    final resp = await _client.get(
      _uri('/api/v1/proformas/$proformaId/pay/selcom/status'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return _asMap(resp.body);
  }

  /// Cancels any pending Selcom order (buyer backed out or switched method).
  Future<Map<String, dynamic>> cancelSelcomOrder(
      String token, String proformaId) async {
    final resp = await _client.post(
      _uri('/api/v1/proformas/$proformaId/pay/selcom/cancel'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    return _asMap(resp.body);
  }

  Map<String, dynamic> _asMap(String body) {
    if (body.isEmpty) return const {};
    final data = jsonDecode(body);
    return data is Map ? data.cast<String, dynamic>() : const {};
  }

  /// Cancel a pending proforma invoice (authenticated):
  /// POST `/api/v1/proformas/{proformaId}/cancel` — releases the reserved
  /// stock and flips status to CANCELLED. Idempotent server-side while
  /// PENDING_PAYMENT; refused after payment submission.
  Future<Map<String, dynamic>> cancelProforma(
      String token, String proformaId) async {
    final resp = await _client.post(
      _uri('/api/v1/proformas/$proformaId/cancel'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    final body = resp.body;
    if (body.isEmpty) return const {};
    return (jsonDecode(body) as Map).cast<String, dynamic>();
  }

  /// Create a proforma / start checkout (authenticated):
  /// POST `/api/v1/checkout/proforma`. Returns the proforma map (proformaId,
  /// proformaNumber, status, totals, sellerGroups).
  Future<Map<String, dynamic>> createProforma(
    String token, {
    required Map<String, dynamic> buyDetails,
    required List<Map<String, dynamic>> items,
  }) async {
    final resp = await _client.post(
      _uri('/api/v1/checkout/proforma'),
      headers: _authHeaders(token),
      body: jsonEncode({'buyDetails': buyDetails, 'items': items}),
    );
    if (resp.statusCode != 201 && resp.statusCode != 200) {
      throw ApiException(_authError(resp));
    }
    return (jsonDecode(resp.body) as Map).cast<String, dynamic>();
  }

  Map<String, String> _authHeaders(String token) => {
        ..._headers,
        'Authorization': 'Bearer $token',
      };

  /// Orders list: GET `/api/v1/orders` (authenticated).
  /// The signed-in user's orders, both sides of the marketplace.
  ///
  /// Cached like the profile, and for the same reason: opening My Space asks
  /// for this list from three places at once — the pending-work banner in the
  /// shell, the Overview stats and the Orders tab — and each was its own
  /// round trip. The cache collapses concurrent callers onto ONE request
  /// (the entry holds the in-flight future), which is most of what made the
  /// screen slow to appear on a weak connection. Any write that moves an
  /// order calls [invalidateReads].
  Future<List<Order>> fetchOrders(String token, {bool forceRefresh = false}) =>
      _cachedRead(
          'orders', const Duration(seconds: 30), () => _fetchOrders(token),
          scope: token, forceRefresh: forceRefresh);

  Future<List<Order>> _fetchOrders(String token) async {
    final resp = await _client.get(
      _uri('/api/v1/orders'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    final list = data is List ? data : const <dynamic>[];
    return list.whereType<Map<String, dynamic>>().map(Order.fromJson).toList();
  }

  /// Buyer payment/proforma rows used by the shared pending-work indicator.
  /// Kept raw because this state is also consumed outside the payments screen.
  Future<List<Map<String, dynamic>>> fetchMyPaymentsRaw(String token) async {
    final resp = await _client.get(
      _uri('/api/v1/payments/my'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final decoded = jsonDecode(resp.body);
    final dynamic rows = decoded is List
        ? decoded
        : decoded is Map
            ? (decoded['content'] ?? decoded['items'] ?? const [])
            : const [];
    return rows is List
        ? rows
            .whereType<Map>()
            .map((row) => row.cast<String, dynamic>())
            .toList()
        : const [];
  }

  /// Order detail: GET `/api/v1/orders/{id}` (authenticated).
  Future<Order> fetchOrderDetail(String token, String orderId) async {
    final resp = await _client.get(
      _uri('/api/v1/orders/$orderId'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return Order.fromJson(
        (jsonDecode(resp.body) as Map).cast<String, dynamic>());
  }

  /// Submit payment for a proforma (honest — returns the backend's real
  /// response; we never fabricate a success).
  Future<Map<String, dynamic>> submitPayment(
    String token,
    String proformaId, {
    List<String>? transactionReferences,
    // AU-029: backend PaymentMethodType accepts MOBILE_MONEY | BANK_TRANSFER
    // only ('CARD' is invalid); MOBILE_MONEY ('Lipa Namba') is the web default.
    String paymentMethodType = 'MOBILE_MONEY',
  }) async {
    final resp = await _client.post(
      _uri('/api/v1/proformas/$proformaId/submit-payment'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'transactionReferences': transactionReferences ?? const [],
        'paymentMethodType': paymentMethodType,
      }),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    final body = resp.body;
    if (body.isEmpty) return const {};
    return (jsonDecode(body) as Map).cast<String, dynamic>();
  }

  /// Admin stats: GET `/api/v1/admin/stats` (ADMIN role).
  Future<Map<String, dynamic>> adminStats(String token) async {
    final resp = await _client.get(_uri('/api/v1/admin/stats'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return (jsonDecode(resp.body) as Map).cast<String, dynamic>();
  }

  /// Admin trend series (orders or proformas): GET `/api/v1/admin/{kind}/trend`.
  /// [interval] ∈ day|week|month|year (backend @RequestParam, sandbox-proven:
  /// the series length changes per bucket). AU-063 interval select.
  Future<List<Map<String, dynamic>>> adminTrend(String token, String kind,
      {String interval = 'day'}) async {
    final resp = await _client.get(
        _uri('/api/v1/admin/$kind/trend', {'interval': interval}),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final d = (jsonDecode(resp.body) as Map).cast<String, dynamic>();
    final series = d['series'];
    if (series is! List) return const [];
    return series.whereType<Map<String, dynamic>>().toList();
  }

  /// Admin orders list: GET `/api/v1/admin/orders`.
  /// [group] ∈ all|ongoing|overdue|cancelled|completed — the backend's
  /// follow-up grouping (sandbox-proven: group=ongoing filters server-side).
  /// AU-065 admin orders console follow-up cards.
  Future<List<Order>> adminOrders(String token, {String? group}) async {
    final query = <String, String>{
      if (group != null && group != 'all') 'group': group,
      'page': '0',
      'size': '100',
    };
    final resp = await _client.get(_uri('/api/v1/admin/orders', query),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : data is List
            ? data
            : const <dynamic>[];
    return content
        .whereType<Map<String, dynamic>>()
        .map(Order.fromJson)
        .toList();
  }

  /// Admin users list: GET `/api/v1/admin/users` (ADMIN role).
  Future<List<Map<String, dynamic>>> adminUsers(String token) async {
    final resp = await _client.get(_uri('/api/v1/admin/users'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : data is List
            ? data
            : const <dynamic>[];
    return content.whereType<Map<String, dynamic>>().toList();
  }

  /// Admin products list: GET `/api/v1/admin/products` (ADMIN role).
  Future<List<Map<String, dynamic>>> adminProducts(String token) async {
    final resp = await _client.get(_uri('/api/v1/admin/products'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : data is List
            ? data
            : const <dynamic>[];
    return content.whereType<Map<String, dynamic>>().toList();
  }

  /// Admin notifications (messages): GET `/api/v1/admin/notifications`.
  Future<List<Map<String, dynamic>>> adminNotifications(String token) async {
    final resp = await _client.get(_uri('/api/v1/admin/notifications'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : data is List
            ? data
            : const <dynamic>[];
    return content.whereType<Map<String, dynamic>>().toList();
  }

  // ---- AU-065: admin contact-message inbox (real source /contact/all) ------

  /// GET `/api/v1/contact/all` → rows `{id, name, email, reason, subject,
  /// message, whatsAppPhoneNumber, userId, isRead, createdAt}`. The old
  /// Messages screen wrongly read /admin/notifications (matrix fix).
  Future<List<Map<String, dynamic>>> fetchContactMessages(String token) async {
    final resp = await _client.get(_uri('/api/v1/contact/all'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    final content = data is List
        ? data
        : (data is Map && data['content'] is List
            ? data['content'] as List
            : const <dynamic>[]);
    return content.whereType<Map<String, dynamic>>().toList();
  }

  /// PATCH `/api/v1/contact/{id}/read` — expanding a message marks it read
  /// like the web inbox. Best-effort: failures don't block rendering.
  Future<void> markContactRead(String token, int id) async {
    final resp = await _client.patch(_uri('/api/v1/contact/$id/read'),
        headers: _authHeaders(token), body: jsonEncode(const {}));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// DELETE `/api/v1/contact/{id}`.
  Future<void> deleteContactMessage(String token, int id) async {
    final resp = await _client.delete(_uri('/api/v1/contact/$id'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// AU-059 profile update: PATCH `/api/v1/userManagement/editProfile`
  /// multipart with the JSON-string part `profileInformationDTO` (backend
  /// `UserManagementController.editProfile` is `@PatchMapping` ONLY —
  /// confirmed by reading the controller source, not assumed; a POST here
  /// gets a plain 405 from Spring, which is very likely why a profile save
  /// could look like it silently "didn't save" at all). Optional
  /// `profileImage` file part. 200 on success with ProfileUpdateResponseDTO.
  ///
  /// Prefer [profileImageBytes]: `MultipartFile.fromPath` has no filesystem to
  /// read on web, where the verification harness runs (same lesson as AU-040's
  /// bytes-end-to-end listing images). The path form is kept for callers on a
  /// real device.
  Future<Map<String, dynamic>> editProfile(
    String token,
    Map<String, dynamic> profile, {
    String? profileImagePath,
    List<int>? profileImageBytes,
    String? profileImageName,
  }) async {
    final req = http.MultipartRequest(
        'PATCH', _uri('/api/v1/userManagement/editProfile'))
      ..headers.addAll(_authHeaders(token))
      ..fields['profileInformationDTO'] = jsonEncode(profile);
    if (profileImageBytes != null && profileImageBytes.isNotEmpty) {
      req.files.add(_imagePart('profileImage', profileImageBytes,
          profileImageName ?? 'profile.jpg'));
    } else if (profileImagePath != null) {
      req.files.add(
          await http.MultipartFile.fromPath('profileImage', profileImagePath));
    }
    final streamed = await _client.send(req);
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode != 200 && resp.statusCode != 201)
      throw ApiException(_authError(resp));
    // The cached profile is now wrong; the next read must hit the network.
    invalidateReads('user-details');
    final b = resp.body;
    if (b.isEmpty) return const {};
    return decodeBodyAsJson(resp);
  }

  /// Web parity `deleteProfileImage`: DELETE
  /// `/api/v1/userManagement/deleteProfileImage`. The web's Profile
  /// Information card offers this next to "Change photo"; mobile had no way
  /// to remove a picture once one was set.
  Future<void> deleteProfileImage(String token) async {
    final resp = await _client.delete(
      _uri('/api/v1/userManagement/deleteProfileImage'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
    invalidateReads('user-details');
  }

  /// AU-056: create a request-board post — GOODS or SERVICE alike posts as
  /// multipart to `/api/v1/request-board` (JSON-string part `request` +
  /// optional `images` file parts). The web UI always posts to `/request-board`
  /// whatever the requestType (`createRequest`, request-board-api.ts:164-169);
  /// the backend routes SERVICE internally from the payload's `requestType`
  /// field. The legacy `/request-board/service` endpoint (`createServiceRequest`)
  /// is never called by any UI (REQUES-14). Auth required.
  /// Prefer [images] over [imagePaths]: `MultipartFile.fromPath` has no
  /// filesystem on web builds, which is why every other upload in this client
  /// carries bytes. Paths stay accepted for callers that already have one.
  Future<Map<String, dynamic>> createRequestPost(
    String token,
    Map<String, dynamic> payload, {
    List<String> imagePaths = const [],
    List<PendingImage> images = const [],
  }) async {
    final req = http.MultipartRequest('POST', _uri('/api/v1/request-board'))
      ..headers.addAll(_authHeaders(token))
      ..fields['request'] = jsonEncode(payload);
    for (final image in images) {
      req.files.add(_imagePart('images', image.bytes, image.name));
    }
    for (final p in imagePaths) {
      req.files.add(await http.MultipartFile.fromPath('images', p));
    }
    final streamed = await _client.send(req);
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      throw ApiException(_authError(resp));
    }
    if (resp.body.isEmpty) return const {};
    return decodeBodyAsJson(resp);
  }

  /// AU-056 owner management: PATCH `/api/v1/request-board/{id}/close`.
  Future<void> closeRequestPost(String token, int id) async {
    final resp = await _client.patch(_uri('/api/v1/request-board/$id/close'),
        headers: _authHeaders(token), body: jsonEncode(const {}));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// AU-056 request detail refetch by id (web `fetchRequestById`).
  /// Public endpoint — auth header attached when a token is provided.
  Future<Map<String, dynamic>> fetchRequestById(int id, {String? token}) async {
    final resp = await _client.get(_uri('/api/v1/request-board/$id'),
        headers: token == null ? _headers : _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return decodeBodyAsJson(resp);
  }

  /// AU-056 owner edit: PUT `/api/v1/request-board/{id}` multipart
  /// (`request` JSON-string part + optional `images`), web `updateRequest`.
  Future<Map<String, dynamic>> updateRequestPost(
    String token,
    int id,
    Map<String, dynamic> payload, {
    List<String> imagePaths = const [],
  }) async {
    final req = http.MultipartRequest('PUT', _uri('/api/v1/request-board/$id'))
      ..headers.addAll(_authHeaders(token))
      ..fields['request'] = jsonEncode(payload);
    for (final p in imagePaths) {
      req.files.add(await http.MultipartFile.fromPath('images', p));
    }
    final streamed = await _client.send(req);
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      throw ApiException(_authError(resp));
    }
    if (resp.body.isEmpty) return const {};
    return decodeBodyAsJson(resp);
  }

  /// AU-065 expiring-soon card: GET `/admin/products/expiring-soon` —
  /// approved listings whose 90-day auto-archival deadline is within two
  /// weeks (soonest first).
  Future<List<Map<String, dynamic>>> adminProductsExpiringSoon(
      String token) async {
    final resp = await _client.get(_uri('/api/v1/admin/products/expiring-soon'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) return const [];
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : data is List
            ? data
            : const <dynamic>[];
    return content.whereType<Map<String, dynamic>>().toList();
  }

  /// AU-065 ratings tab: GET `/admin/ratings?page&size` (paged rows) and
  /// DELETE `/admin/ratings/{ratingId}` (AdminController contract).
  Future<List<Map<String, dynamic>>> adminRatings(String token,
      {int page = 0, int size = 20}) async {
    final resp = await _client.get(
        _uri('/api/v1/admin/ratings', {'page': '$page', 'size': '$size'}),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : data is List
            ? data
            : const <dynamic>[];
    return content.whereType<Map<String, dynamic>>().toList();
  }

  Future<void> adminDeleteRating(String token, int ratingId) async {
    final resp = await _client.delete(_uri('/api/v1/admin/ratings/$ratingId'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// AU-065 admin listing moderation: PATCH `/admin/products/{id}/status`
  /// {status} — approve/reject/archive pending listings from the queue
  /// (AdminController contract, same shape as the user-status patch).
  Future<void> adminUpdateProductStatus(
      String token, int productId, String status) async {
    final resp = await _client.patch(
        _uri('/api/v1/admin/products/$productId/status'),
        headers: _authHeaders(token),
        body: jsonEncode({'status': status}));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// AU-065 admin user actions (AdminController):
  /// PATCH `/users/{id}/status` {status} — VERIFIED/NATURAL_VERIFIED also
  /// approve the latest seller-verification request backend-side;
  /// PATCH `/users/{id}/roles` {roles:[...]}.
  Future<void> adminUpdateUserStatus(
      String token, int userId, String status) async {
    final resp = await _client.patch(_uri('/api/v1/admin/users/$userId/status'),
        headers: _authHeaders(token), body: jsonEncode({'status': status}));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  Future<void> adminUpdateUserRoles(
      String token, int userId, List<String> roles) async {
    final resp = await _client.patch(_uri('/api/v1/admin/users/$userId/roles'),
        headers: _authHeaders(token), body: jsonEncode({'roles': roles}));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  // ---- AU-061: seller verification hub (seller-verification controller) ----

  /// GET `/api/v1/seller-verification/current` → `{application: <map|null>}`.
  /// Application fields: requestId, reviewStatus (PENDING/VERIFIED/...),
  /// referralSource, sellerType, businessName/fullName, productTypes.
  Future<Map<String, dynamic>> fetchSellerVerification(String token) async {
    final resp = await _client.get(_uri('/api/v1/seller-verification/current'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return decodeBodyAsJson(resp);
  }

  /// POST `/api/v1/seller-verification` with the submission
  /// {referralSource, referralOther?, sellerType, businessName?|fullName?,
  /// productTypes} → the created application.
  Future<Map<String, dynamic>> submitSellerVerification(
      String token, Map<String, dynamic> submission) async {
    final resp = await _client.post(_uri('/api/v1/seller-verification'),
        headers: _authHeaders(token), body: jsonEncode(submission));
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    return decodeBodyAsJson(resp);
  }

  /// POST `/api/v1/seller-verification/{requestId}/response` — seller reply to
  /// an admin REJECTED / BLOCKED follow-up question (web `respondToReview`).
  /// Payload: {response} → the updated application.
  Future<Map<String, dynamic>> respondToSellerVerification(
      String token, int requestId, String response) async {
    final resp = await _client.post(
      _uri('/api/v1/seller-verification/$requestId/response'),
      headers: _authHeaders(token),
      body: jsonEncode({'response': response}),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    return decodeBodyAsJson(resp);
  }

  // ---- seller working hours (userManagement/working-schedule) -------------

  /// GET `/api/v1/userManagement/working-schedule` (web `getSellerSchedule`):
  /// `{configured, shouldPrompt, schedule}`. Seller-only — anyone else gets a
  /// 403, which callers read as "not a seller yet".
  Future<Map<String, dynamic>> getSellerSchedule(String token) async {
    final resp = await _client.get(
        _uri('/api/v1/userManagement/working-schedule'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final b = resp.body;
    return b.isEmpty
        ? const {}
        : (jsonDecode(b) as Map).cast<String, dynamic>();
  }

  /// PUT the whole weekly schedule (web `saveSellerSchedule`). The backend
  /// validates it and answers the saved status.
  Future<Map<String, dynamic>> saveSellerSchedule(
      String token, Map<String, dynamic> schedule) async {
    final resp = await _client.put(
        _uri('/api/v1/userManagement/working-schedule'),
        headers: _authHeaders(token),
        body: jsonEncode(schedule));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final b = resp.body;
    return b.isEmpty
        ? const {}
        : (jsonDecode(b) as Map).cast<String, dynamic>();
  }

  /// GET the IANA timezones the backend accepts (web `getSellerTimezones`).
  Future<List<String>> getSellerTimezones(String token) async {
    final resp = await _client.get(
        _uri('/api/v1/userManagement/working-schedule/timezones'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    return (data is List ? data : const <dynamic>[])
        .map((z) => z.toString())
        .toList();
  }

  // ---- AU-060: seller payout details (userManagement/payout-details) ------

  /// GET `/api/v1/userManagement/payout-details` → rows
  /// `{id, configured, primary, payoutMethod, providerName, accountName,
  /// accountNumber, updatedAt}`.
  Future<List<Map<String, dynamic>>> fetchPayoutDetails(String token) async {
    final resp = await _client.get(
        _uri('/api/v1/userManagement/payout-details'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    return (data is List ? data : const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  /// PUT create/update (`detailsId` null => POST-style create via PUT to the
  /// collection path, web saveSellerPayoutDetails parity).
  Future<void> savePayoutDetails(String token, Map<String, dynamic> details,
      {int? detailsId}) async {
    final path = detailsId != null
        ? '/api/v1/userManagement/payout-details/$detailsId'
        : '/api/v1/userManagement/payout-details';
    final resp = await _client.put(_uri(path),
        headers: _authHeaders(token), body: jsonEncode(details));
    if (resp.statusCode != 200 &&
        resp.statusCode != 201 &&
        resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// DELETE `/api/v1/userManagement/payout-details/{id}` (web
  /// `deleteSellerPayoutDetails`). Removes one saved method.
  Future<void> deletePayoutDetails(String token, int detailsId) async {
    final resp = await _client.delete(
      _uri('/api/v1/userManagement/payout-details/$detailsId'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// PUT `/api/v1/userManagement/payout-details/{id}/primary` (web
  /// `setPrimaryPayoutDetails`). Makes the row the default payout method.
  Future<void> setPrimaryPayoutDetails(String token, int detailsId) async {
    final resp = await _client.put(
      _uri('/api/v1/userManagement/payout-details/$detailsId/primary'),
      headers: _authHeaders(token),
      body: jsonEncode(const {}),
    );
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// GET `/api/v1/userManagement/payout-details/prompt-status` (web
  /// `getSellerPayoutPromptStatus`). The backend's compact
  /// "should this seller be nagged to configure payouts" answer.
  Future<Map<String, dynamic>> getSellerPayoutPromptStatus(String token) async {
    final resp = await _client.get(
      _uri('/api/v1/userManagement/payout-details/prompt-status'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final b = resp.body;
    return b.isEmpty
        ? const {}
        : (jsonDecode(b) as Map).cast<String, dynamic>();
  }

  // ---- Phase 4B seller-finance / commission (web platform-settings + ----
  // ---- payments controller parity) ------------------------------------

  /// GET `/api/v1/platform-settings/commission` (web
  /// `fetchPlatformCommissionSettings`). Records the live VAT / Selcom rates
  /// into the [currentCommissionRates] cache so every pricing calc picks them
  /// up. Returns true when a live payload was cached.
  ///
  /// Network/5xx failures are deliberately swallowed here (best-effort warm
  /// call): callers fall back to the documented defaults, exactly like the web
  /// hook returns defaults on error. Only a malformed 200 would be surprising,
  /// and even then the cache keeps its previous value.
  Future<bool> fetchPlatformCommissionSettings({String? token}) async {
    try {
      final resp = await _client.get(
        _uri('/api/v1/platform-settings/commission'),
        headers:
            token == null || token.isEmpty ? _headers : _authHeaders(token),
      );
      if (resp.statusCode != 200) return false;
      final b = resp.body;
      if (b.isEmpty) return false;
      setLiveCommissionRates((jsonDecode(b) as Map).cast<String, dynamic>());
      return true;
    } catch (_) {
      return false;
    }
  }

  /// GET `/api/v1/payments/received` → seller payments-received rows (web
  /// `fetchReceivedPayments`). Each row:
  /// `{orderId, proformaNumber, amount, totalAmountPaid, sellerPayable,
  /// deliveryFee, crossRegionDelivery, orderStatus, currency, receiptStatus,
  /// verifiedAt, buyerName, receipts[], sellerDocuments[]}`.
  Future<List<Map<String, dynamic>>> fetchReceivedPayments(String token) async {
    final resp = await _client.get(
      _uri('/api/v1/payments/received'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    return (data is List ? data : const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  /// GET `/api/v1/seller/wallet` — the seller's payouts with the money
  /// breakdown, reasons, receipts and transfer proofs (web `getSellerWallet`).
  Future<SellerWallet> getSellerWallet(String token) async {
    final resp = await _client.get(_uri('/api/v1/seller/wallet'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    return SellerWallet.fromJson(
        data is Map ? data.cast<String, dynamic>() : const {});
  }

  /// POST `/api/v1/payments/received/{orderId}/seller-document` (multipart
  /// field `document`) — seller uploads a handover/fulfilment document to a
  /// paid order (web `uploadSellerDocument`). Returns the created document row.
  Future<Map<String, dynamic>> uploadSellerPaymentDocument(
    String token,
    String orderId, {
    required Uint8List bytes,
    required String filename,
    String contentType = 'application/pdf',
  }) async {
    final req = http.MultipartRequest(
      'POST',
      _uri('/api/v1/payments/received/$orderId/seller-document'),
    )..headers.addAll({
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
      });
    final parts = contentType.split('/');
    req.files.add(http.MultipartFile.fromBytes('document', bytes,
        filename: filename, contentType: MediaType(parts.first, parts.last)));
    final streamed = await _client.send(req);
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      throw ApiException(_authError(resp));
    }
    final b = resp.body;
    return b.isEmpty
        ? const {}
        : (jsonDecode(b) as Map).cast<String, dynamic>();
  }

  /// Fetch the raw bytes of a seller finance receipt/document whose `fileUrl`
  /// is an origin-relative authed path (e.g. `/api/v1/admin/receipts/…/file`).
  /// Mirrors [adminReceiptFile] but keeps the caller's relative path intact —
  /// receipts and seller documents are private; never render from a public URL.
  Future<Uint8List> fetchAuthedFileBytes(
      String token, String relativePath) async {
    final clean =
        relativePath.startsWith('/') ? relativePath : '/$relativePath';
    final resp = await _client.get(
      _uri(clean),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200) {
      throw ApiException('file ${resp.statusCode}');
    }
    return resp.bodyBytes;
  }

  /// POST `/api/v1/products/sync-location` — web parity for the address
  /// default-action that re-pins the seller's live products to the default
  /// address location. Best-effort: failures are swallowed so a 404/5xx from
  /// the sandbox never breaks the set-default flow.
  Future<void> syncSellerProductLocation(String token) async {
    try {
      final resp = await _client.post(
        _uri('/api/v1/products/sync-location'),
        headers: _authHeaders(token),
        body: jsonEncode(const {}),
      );
      if (resp.statusCode != 200 &&
          resp.statusCode != 201 &&
          resp.statusCode != 204) {
        throw ApiException(_authError(resp));
      }
    } catch (_) {
      // Best-effort sync (see doc comment).
    }
  }

  // ---- AU-057: transporter registry + assignment (TransporterController) ----

  /// GET `/api/v1/transporters` (seller/admin) → registry rows
  /// `{transporterId, fullName, vehicleType, plateNumber, phoneNumber,
  /// whatsAppPhoneNumber, photoUrl, tripCount, active, ...}`. Optional
  /// `search` / `active` / `vehicleType` filters (backend @RequestParam).
  ///
  /// With [windowDate] (yyyy-MM-dd) and [windowSlot] each row also carries
  /// `assignedInWindow`, the orders that rider already has in that window.
  /// `appStatus` (MANUAL / INVITED / ACTIVE) is sent only while the backend's
  /// driver app is on.
  Future<List<Map<String, dynamic>>> fetchTransporterRegistry(String token,
      {bool? activeOnly, String? windowDate, String? windowSlot}) async {
    final query = <String, String>{
      if (activeOnly == true) 'active': 'true',
      if (windowDate != null && windowSlot != null) ...{
        'windowDate': windowDate,
        'windowSlot': windowSlot,
      },
    };
    final resp = await _client.get(_uri('/api/v1/transporters', query),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    final rows = data is List ? data : const <dynamic>[];
    return rows.whereType<Map<String, dynamic>>().toList();
  }

  /// POST `/api/v1/transporters/{id}/invite` (driver app): a single-use code
  /// for a rider the seller registered, valid 7 days →
  /// `{transporterId, code, expiresAt, shareText}`. A new code replaces the
  /// open one.
  Future<Map<String, dynamic>> createDriverInvite(
      String token, int transporterId) async {
    final resp = await _client.post(
        _uri('/api/v1/transporters/$transporterId/invite'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    return decodeBodyAsJson(resp);
  }

  /// DELETE `/api/v1/transporters/{id}/app-link` (owner): ends the rider's
  /// driver-app access. Their past trips stay.
  Future<void> removeDriverAppAccess(String token, int transporterId) async {
    final resp = await _client.delete(
        _uri('/api/v1/transporters/$transporterId/app-link'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// GET `/api/v1/orders/{orderId}/trip-events`: what the rider reported for an
  /// order (assigned, arrived, on the way, could not deliver ...), oldest first.
  Future<List<Map<String, dynamic>>> fetchOrderTripEvents(
      String token, String orderId) async {
    final resp = await _client.get(_uri('/api/v1/orders/$orderId/trip-events'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    return (data is List ? data : const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  /// POST `/api/v1/transporters` (seller inline-add) → TransporterDTO.
  /// Payload: {fullName, phoneNumber, whatsAppPhoneNumber, vehicleType,
  /// plateNumber, notes?, active?}.
  Future<Map<String, dynamic>> createTransporter(
      String token, Map<String, dynamic> payload) async {
    final resp = await _client.post(_uri('/api/v1/transporters'),
        headers: _authHeaders(token), body: jsonEncode(payload));
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    return decodeBodyAsJson(resp);
  }

  /// POST `/api/v1/orders/{orderId}/transporter` with AssignTransporterDTO
  /// {transporterId, proposedDeliveryTime?, note?} → TripAssignmentDTO; the
  /// order moves to AWAITING_BUYER_CONFIRMATION.
  Future<Map<String, dynamic>> assignTransporter(
      String token, String orderId, int transporterId,
      {String? proposedDeliveryTime, String? note}) async {
    final resp = await _client.post(
      _uri('/api/v1/orders/$orderId/transporter'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'transporterId': transporterId,
        if (proposedDeliveryTime != null)
          'proposedDeliveryTime': proposedDeliveryTime,
        if (note != null) 'note': note,
      }),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    // This write moved an order, so the cached list is stale.
    invalidateReads('orders');
    requestPendingActionsRefresh();
    return decodeBodyAsJson(resp);
  }

  /// GET `/api/v1/contact/unread-count` (admin) — drives the messages badge
  /// in the admin nav (web 30s poll parity).
  Future<int> fetchContactUnreadCount(String token) async {
    final resp = await _client.get(_uri('/api/v1/contact/unread-count'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) return 0;
    final b = jsonDecode(resp.body);
    if (b is num) return b.toInt();
    if (b is Map && (b['count'] ?? b['unreadCount']) is num) {
      return ((b['count'] ?? b['unreadCount']) as num).toInt();
    }
    return 0;
  }

  /// AU-062 public contact form: POST `/api/v1/contact/submit` with
  /// `{name, email, reason, subject, message}` → **201 Created**
  /// (`{success:true, message, id}` per ContactController). No auth required.
  Future<void> submitContactMessage({
    required String name,
    required String email,
    required String reason,
    required String subject,
    required String message,
  }) async {
    final resp = await _client.post(
      _uri('/api/v1/contact/submit'),
      headers: _headers,
      body: jsonEncode({
        'name': name,
        'email': email,
        'reason': reason,
        'subject': subject,
        'message': message,
      }),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
  }

  // ---- AU-058: user notification feed (NotificationController) ---------------

  /// Associate this Firebase installation with the authenticated account.
  Future<void> registerPushDevice(
    String token,
    String registrationToken, {
    String platform = 'ANDROID',
    String? deviceName,
  }) async {
    final resp = await _client.put(
      _uri('/api/v1/push/devices'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'token': registrationToken,
        'platform': platform,
        if (deviceName != null && deviceName.isNotEmpty)
          'deviceName': deviceName,
      }),
    );
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// Remove this installation from the account during logout.
  Future<void> unregisterPushDevice(
      String token, String registrationToken) async {
    final resp = await _client.delete(
      _uri('/api/v1/push/devices'),
      headers: _authHeaders(token),
      body: jsonEncode({'token': registrationToken}),
    );
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// GET `/api/v1/notifications?page=&size=` → Page rows
  /// {notificationId, title, message, notificationType, referenceId,
  ///  actionUrl, isRead, createdAt}.
  Future<List<Map<String, dynamic>>> fetchNotifications(String token,
      {int page = 0, int size = 20}) async {
    final resp = await _client.get(
      _uri('/api/v1/notifications', {'page': '$page', 'size': '$size'}),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    // The feed has come back as a bare array, {content}, {data} and
    // {data:{content}} at different times; web tolerates all four and so
    // must this, or a shape change silently empties the screen.
    return extractNotificationContent(jsonDecode(resp.body));
  }

  /// GET `/api/v1/notifications/unread-count` → num (30s badge poll on web).
  Future<int> fetchUnreadNotificationCount(String token) async {
    final resp = await _client.get(_uri('/api/v1/notifications/unread-count'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) return 0;
    final d = jsonDecode(resp.body);
    if (d is num) return d.toInt();
    if (d is Map && d['count'] is num) return (d['count'] as num).toInt();
    return 0;
  }

  /// PATCH `/api/v1/notifications/{id}/read`.
  Future<void> markNotificationRead(String token, int id) async {
    final resp = await _client.patch(_uri('/api/v1/notifications/$id/read'),
        headers: _authHeaders(token), body: jsonEncode(const {}));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// PATCH `/api/v1/notifications/read-all`.
  Future<void> markAllNotificationsRead(String token) async {
    final resp = await _client.patch(_uri('/api/v1/notifications/read-all'),
        headers: _authHeaders(token), body: jsonEncode(const {}));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// DELETE `/api/v1/notifications/{id}` — clear a single notification (web
  /// `deleteNotification`, lib/api.ts:3942).
  Future<void> deleteNotification(String token, int id) async {
    final resp = await _client.delete(_uri('/api/v1/notifications/$id'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// DELETE `/api/v1/notifications/bulk` body `{ids: [...]}` — clear selected
  /// notifications (web `deleteNotifications`, lib/api.ts:3948).
  Future<void> deleteNotificationsBulk(String token, List<int> ids) async {
    if (ids.isEmpty) return;
    final resp = await _client.delete(_uri('/api/v1/notifications/bulk'),
        headers: _authHeaders(token), body: jsonEncode({'ids': ids}));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// DELETE `/api/v1/notifications/delete-all`.
  Future<void> deleteAllNotifications(String token) async {
    final resp = await _client.delete(_uri('/api/v1/notifications/delete-all'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// Admin seller-verifications queue: GET `/api/v1/admin/seller-verifications`.
  Future<List<Map<String, dynamic>>> adminSellerVerifications(
      String token) async {
    final resp = await _client.get(_uri('/api/v1/admin/seller-verifications'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : data is List
            ? data
            : const <dynamic>[];
    return content.whereType<Map<String, dynamic>>().toList();
  }

  // ---- AU-063: Matomo analytics client (read-only; same upstream the web
  // /api/matomo proxy uses). Analytics failures are swallowed by callers and
  // rendered as blank cards — the documented exception to empty-state rules.

  /// GET one Matomo API method. Returns the decoded JSON body (Map or List),
  /// or null on any failure/permission error — never throws into UI paths.
  Future<dynamic> matomoQuery(
    String method, {
    String period = 'day',
    String date = 'today',
    Map<String, String>? extra,
  }) async {
    if (AppConfig.matomoToken.isEmpty) return null;
    try {
      final params = {
        'module': 'API',
        'method': method,
        'format': 'json',
        'period': period,
        'date': date,
        'idSite': AppConfig.matomoSiteId,
        'token_auth': AppConfig.matomoToken,
        ...?extra,
      };
      final uri =
          Uri.parse(AppConfig.matomoUrl).replace(queryParameters: params);
      final resp = await _client.get(uri, headers: _headers);
      if (resp.statusCode != 200) return null;
      final decoded = jsonDecode(resp.body);
      // Matomo error shape: {"result":"error","message":...}
      if (decoded is Map && decoded['result'] == 'error') return null;
      return decoded;
    } catch (_) {
      return null;
    }
  }

  /// Admin top-buyers-by-clicks (best effort — empty on any failure, per the
  /// app rule that analytics failures are swallowed and rendered empty).
  /// AU-064 CORRECTED endpoint: Top Buyers by Clicks comes from the
  /// analytics service (`/analytics/orders/top-buyers`, proxied on the web
  /// via /api/analytics/* -> :8082). The old implementation read
  /// `/admin/search-analytics/zero-results` — the WRONG data source (matrix
  /// bug). Analytics-failures-optional convention: any failure => empty list,
  /// the card renders blank like the web.
  Future<List<Map<String, dynamic>>> adminTopBuyers(String token) async {
    try {
      const base = AppConfig.analyticsBaseUrl;
      final resp = await _client.get(
        Uri.parse('$base/analytics/orders/top-buyers?limit=8'),
        headers: _authHeaders(token),
      );
      if (resp.statusCode != 200) return const [];
      final data = jsonDecode(resp.body);
      final rows = data is List
          ? data
          : (data is Map && data['content'] is List
              ? data['content'] as List
              : const <dynamic>[]);
      return rows.whereType<Map<String, dynamic>>().toList();
    } catch (_) {
      return const [];
    }
  }

  // ---- AU-064: analytics-service client (web parity api.ts ANALYTICS
  // ENDPOINTS block). Every method swallows failures and returns null/empty —
  // the platform convention that analytics cards render BLANK when the data
  // is unavailable, never an error screen.

  /// Generic analytics GET against [AppConfig.analyticsBaseUrl].
  Future<dynamic> _analyticsGet(String token, String path,
      [Map<String, String>? query]) async {
    final uri = Uri.parse('${AppConfig.analyticsBaseUrl}$path')
        .replace(queryParameters: query);
    final resp = await _client.get(uri, headers: _authHeaders(token));
    if (resp.statusCode != 200)
      throw ApiException('analytics HTTP ${resp.statusCode}');
    final b = resp.body;
    if (b.isEmpty) return null;
    return jsonDecode(b);
  }

  /// GET /analytics/overview/summary -> headline counts card.
  Future<Map<String, dynamic>?> adminAnalyticsSummary(String token) async {
    try {
      final d = await _analyticsGet(token, '/analytics/overview/summary');
      return d is Map ? d.cast<String, dynamic>() : null;
    } catch (_) {
      return null;
    }
  }

  /// GET /analytics/orders/revenue-over-time?interval=…
  Future<List<Map<String, dynamic>>> adminRevenueOverTime(String token,
      {String interval = 'month'}) async {
    try {
      final d = await _analyticsGet(
          token, '/analytics/orders/revenue-over-time', {'interval': interval});
      return d is List
          ? d.whereType<Map<String, dynamic>>().toList()
          : const [];
    } catch (_) {
      return const [];
    }
  }

  /// GET /analytics/users/verification-breakdown
  Future<List<Map<String, dynamic>>> adminVerificationBreakdown(
      String token) async {
    try {
      final d =
          await _analyticsGet(token, '/analytics/users/verification-breakdown');
      return d is List
          ? d.whereType<Map<String, dynamic>>().toList()
          : const [];
    } catch (_) {
      return const [];
    }
  }

  /// Top-clicked products / sellers / categories share one shape.
  Future<List<Map<String, dynamic>>> _adminTopClicked(String token,
      {required String kind, int limit = 10}) async {
    try {
      final d = await _analyticsGet(
          token, '/analytics/$kind/top-clicked', {'limit': '$limit'});
      return d is List
          ? d.whereType<Map<String, dynamic>>().toList()
          : const [];
    } catch (_) {
      return const [];
    }
  }

  Future<List<Map<String, dynamic>>> adminTopClickedProducts(String token,
          {int limit = 10}) =>
      _adminTopClicked(token, kind: 'products', limit: limit);

  Future<List<Map<String, dynamic>>> adminTopClickedSellers(String token,
          {int limit = 10}) =>
      _adminTopClicked(token, kind: 'sellers', limit: limit);

  Future<List<Map<String, dynamic>>> adminTopClickedCategories(String token,
          {int limit = 10}) =>
      _adminTopClicked(token, kind: 'categories', limit: limit);

  /// GET /analytics/users/cumulative-signups-vs-verified?interval=… ->
  /// `{series:[…]}`.
  Future<List<Map<String, dynamic>>> adminCumulativeSignups(String token,
      {String interval = 'day'}) async {
    try {
      final d = await _analyticsGet(
          token,
          '/analytics/users/cumulative-signups-vs-verified',
          {'interval': interval});
      final series = d is Map ? d['series'] : d;
      return series is List
          ? series.whereType<Map<String, dynamic>>().toList()
          : const [];
    } catch (_) {
      return const [];
    }
  }

  /// Zero-result searches table (the endpoint the old top-buyers code read).
  Future<List<Map<String, dynamic>>> adminZeroResultSearches(
      String token) async {
    final resp = await _client.get(
      _uri('/api/v1/admin/search-analytics/zero-results'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200) return const [];
    final data = jsonDecode(resp.body);
    if (data is Map && data['content'] is List)
      return (data['content'] as List)
          .whereType<Map<String, dynamic>>()
          .toList();
    if (data is List) return data.whereType<Map<String, dynamic>>().toList();
    return const [];
  }

  /// Request-board feed (public): GET `/api/v1/request-board/feed`.
  Future<List<Map<String, dynamic>>> fetchRequests(
      {int page = 0, int size = 20}) async {
    final resp = await _client.get(
      _uri('/api/v1/request-board/feed', {'page': '$page', 'size': '$size'}),
      headers: _headers,
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : data is List
            ? data
            : const <dynamic>[];
    return content.whereType<Map<String, dynamic>>().toList();
  }

  // ---- AU-056: request board CRUD / nudge / fulfill (RequestBoardController) -

  /// Filtered feed — status/category/location/search/requestType + paging
  /// (controller L111). Anonymous allowed.
  Future<List<Map<String, dynamic>>> fetchRequestsFiltered({
    String? status,
    String? category,
    String? location,
    String? search,
    String? requestType,
    int page = 0,
    int size = 20,
  }) async {
    final resp = await _client.get(
      _uri('/api/v1/request-board/feed', {
        'page': '$page',
        'size': '$size',
        if (status != null && status.isNotEmpty) 'status': status,
        if (category != null && category.isNotEmpty) 'category': category,
        if (location != null && location.isNotEmpty) 'location': location,
        if (search != null && search.isNotEmpty) 'search': search,
        if (requestType != null && requestType.isNotEmpty)
          'requestType': requestType,
      }),
      headers: _headers,
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : const <dynamic>[];
    return content.whereType<Map<String, dynamic>>().toList();
  }

  /// Detail refetch by id (L134) — the list payload alone is not parity.
  Future<Map<String, dynamic>> fetchRequestDetail(String token, int id) async {
    final headers = token.isEmpty ? {..._headers} : _authHeaders(token);
    final resp =
        await _client.get(_uri('/api/v1/request-board/$id'), headers: headers);
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return (jsonDecode(resp.body) as Map).cast<String, dynamic>();
  }

  /// View tracking (PATCH /{id}/view L143) with the stable anonymous id when
  /// logged out; fire-and-forget on the caller's side. When no auth header is
  /// present the persisted `ge_anon_id` is attached automatically — web parity
  /// request-board-api.ts:258-260, so a caller never has to fetch it itself.
  Future<void> trackRequestView(String token, int id, {String? anonId}) async {
    final headers = token.isEmpty
        ? {..._headers, if (anonId != null) 'X-Anonymous-Id': anonId}
        : _authHeaders(token);
    if (token.isEmpty && !headers.containsKey('X-Anonymous-Id')) {
      final anon = await _anonymousId();
      if (anon.isNotEmpty) headers['X-Anonymous-Id'] = anon;
    }
    final resp = await _client.patch(_uri('/api/v1/request-board/$id/view'),
        headers: headers, body: jsonEncode(const {}));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// REAL nudge (POST /{id}/nudge L213) — replaces the old SnackBar-only stub.
  /// Returns {message}; ALREADY_NUDGED arrives as an ApiException whose message
  /// carries the backend sentinel.
  Future<Map<String, dynamic>> nudgeRequest(String token, int id,
      {String message = 'I can help with this!',
      String nudgeType = 'GENERAL',
      int? productId}) async {
    final resp = await _client.post(
      _uri('/api/v1/request-board/$id/nudge'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'message': message,
        'nudgeType': nudgeType,
        if (productId != null) 'productId': productId,
      }),
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return (jsonDecode(resp.body) as Map).cast<String, dynamic>();
  }

  /// Owner close (PATCH /{id}/close L157).
  Future<void> closeRequest(String token, int id) async {
    final resp = await _client.patch(_uri('/api/v1/request-board/$id/close'),
        headers: _authHeaders(token), body: jsonEncode(const {}));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// Owner delete (DELETE /{id} L273).
  Future<void> deleteRequest(String token, int id) async {
    final resp = await _client.delete(_uri('/api/v1/request-board/$id'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// Fulfill with one of my products (PATCH /{id}/fulfill L167 body {productId})
  /// or outside-the-platform sentinel via fulfillRequestFromNudge path.
  Future<dynamic> fulfillRequest(String token, int id, {int? productId}) async {
    final resp = await _client.patch(_uri('/api/v1/request-board/$id/fulfill'),
        headers: _authHeaders(token),
        body: jsonEncode({if (productId != null) 'productId': productId}));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final b = resp.body;
    return b.isEmpty ? const {} : jsonDecode(b);
  }

  /// My nudges for own request incl. responder contacts (GET /{id}/nudges L226).
  Future<List<Map<String, dynamic>>> fetchRequestNudges(
      String token, int id) async {
    final resp = await _client.get(_uri('/api/v1/request-board/$id/nudges'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final d = jsonDecode(resp.body);
    return (d is List ? d : const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  /// Page-shaped feed result — web parity `RequestBoardPage` (content +
  /// totalElements/totalPages/number/last). The legacy list-only methods above
  /// stay for callers that never paginate.
  Future<RequestBoardPageData> fetchRequestBoardFeed({
    String? status,
    String? category,
    String? location,
    String? search,
    String? requestType,
    int page = 0,
    int size = 20,
  }) async {
    final resp = await _client.get(
      _uri('/api/v1/request-board/feed', {
        'page': '$page',
        'size': '$size',
        if (status != null && status.isNotEmpty) 'status': status,
        if (category != null && category.isNotEmpty) 'category': category,
        if (location != null && location.isNotEmpty) 'location': location,
        if (search != null && search.isNotEmpty) 'search': search,
        if (requestType != null && requestType.isNotEmpty)
          'requestType': requestType,
      }),
      headers: _headers,
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return RequestBoardPageData.fromJson(jsonDecode(resp.body),
        fallbackPage: page);
  }

  /// Owner-scoped list — GET `/api/v1/request-board/my-requests` (web
  /// `fetchMyRequests`, request-board-api.ts:141). Needs auth.
  Future<RequestBoardPageData> fetchMyRequests(
    String token, {
    String? status,
    int page = 0,
    int size = 20,
  }) async {
    final resp = await _client.get(
      _uri('/api/v1/request-board/my-requests', {
        'page': '$page',
        'size': '$size',
        if (status != null && status.isNotEmpty) 'status': status,
      }),
      headers: token.isEmpty ? _headers : _authHeaders(token),
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return RequestBoardPageData.fromJson(jsonDecode(resp.body),
        fallbackPage: page);
  }

  /// Owner marks every nudge on a request read (web `markNudgesRead` L345).
  Future<void> markNudgesRead(String token, int id) async {
    final resp = await _client.patch(
        _uri('/api/v1/request-board/$id/nudges/read'),
        headers: _authHeaders(token),
        body: jsonEncode(const {}));
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// Outstanding nudge count across all my requests (GET .../nudges/unread-count).
  Future<int> fetchUnreadNudgeCount(String token) async {
    final resp = await _client.get(
        _uri('/api/v1/request-board/nudges/unread-count'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final d = jsonDecode(resp.body);
    final count = d is Map ? (d['count'] ?? 0) : 0;
    return count is num ? count.toInt() : int.tryParse('$count') ?? 0;
  }

  /// The caller's own nudge for a request, or null when they have not nudged it
  /// (web `fetchMyNudge` L327 — backend 404 -> null).
  Future<Map<String, dynamic>?> fetchMyNudge(String token, int id) async {
    final resp = await _client.get(_uri('/api/v1/request-board/$id/my-nudge'),
        headers: _authHeaders(token));
    if (resp.statusCode == 404) return null;
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return (jsonDecode(resp.body) as Map).cast<String, dynamic>();
  }

  /// Update my own nudge (web `updateNudgeRequest` L319 — PUT keeps the same
  /// record and re-notifies the owner).
  Future<void> updateNudgeRequest(
      String token, int id, Map<String, dynamic> payload) async {
    final resp = await _client.put(_uri('/api/v1/request-board/$id/nudge'),
        headers: _authHeaders(token), body: jsonEncode(payload));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
  }

  /// Mark a request fulfilled as an outside-GloboExpats completion (web
  /// `fulfillRequestOutside` L231 — body {source:'EXTERNAL'}).
  Future<dynamic> fulfillRequestOutside(String token, int id) async {
    final resp = await _client.patch(_uri('/api/v1/request-board/$id/fulfill'),
        headers: _authHeaders(token), body: jsonEncode({'source': 'EXTERNAL'}));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final b = resp.body;
    return b.isEmpty ? const {} : jsonDecode(b);
  }

  /// Accept a responder's nudge as the fulfillment (web
  /// `fulfillRequestByNudge` L214 — body {nudgeId}). Until the backend ships
  /// the body shape it rejects with 400/404/501; that surfaces as the
  /// FULFILL_BY_NUDGE_UNAVAILABLE sentinel so the UI can show a graceful
  /// "coming soon" rather than a hard error.
  Future<dynamic> fulfillRequestByNudge(
      String token, int id, int nudgeId) async {
    final resp = await _client.patch(_uri('/api/v1/request-board/$id/fulfill'),
        headers: _authHeaders(token), body: jsonEncode({'nudgeId': nudgeId}));
    if (resp.statusCode == 400 ||
        resp.statusCode == 404 ||
        resp.statusCode == 501) {
      throw ApiException('FULFILL_BY_NUDGE_UNAVAILABLE');
    }
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final b = resp.body;
    return b.isEmpty ? const {} : jsonDecode(b);
  }

  /// Fulfilled-request detail (web `fetchFulfilledRequestDetail` L273): who
  /// fulfilled it, the linked product, and the original request snapshot.
  Future<Map<String, dynamic>> fetchFulfilledRequestDetail(
      String token, int id) async {
    final resp = await _client.get(
        _uri('/api/v1/request-board/$id/fulfilled-detail'),
        headers: token.isEmpty ? _headers : _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return (jsonDecode(resp.body) as Map).cast<String, dynamic>();
  }

  /// Owner view analytics for a request (web `fetchRequestViewAnalytics` L388):
  /// total/unique/members/guests plus the per-viewer list.
  Future<Map<String, dynamic>> fetchRequestViewAnalytics(
      String token, int id) async {
    final resp = await _client.get(
        _uri('/api/v1/request-board/$id/views/analytics'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return (jsonDecode(resp.body) as Map).cast<String, dynamic>();
  }

  /// Owner edit that uploads NEW images alongside `removeImageUrls` (web PUT
  /// multipart). The base [updateRequestPost] keeps its narrower signature for
  /// callers that only change text.
  Future<Map<String, dynamic>> updateRequestPostWithImages(
    String token,
    int id,
    Map<String, dynamic> payload, {
    List<PendingImage> images = const [],
  }) async {
    final req = http.MultipartRequest('PUT', _uri('/api/v1/request-board/$id'))
      ..headers.addAll(_authHeaders(token))
      ..fields['request'] = jsonEncode(payload);
    for (final image in images) {
      req.files.add(_imagePart('images', image.bytes, image.name));
    }
    final streamed = await _client.send(req);
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      throw ApiException(_authError(resp));
    }
    if (resp.body.isEmpty) return const {};
    return decodeBodyAsJson(resp);
  }

  /// Create a listing (seller/auth): POST `/api/v1/products/post-product`.
  /// The backend `PostProductController` consumes **multipart/form-data** with a
  /// `product` part = JSON string (ListProductDTO) + optional `images` parts.
  /// (sending application/json is rejected — real verified POST needed multipart)
  Future<Map<String, dynamic>> createListing(
      String token, Map<String, dynamic> body) async {
    final req = http.MultipartRequest(
      'POST',
      _uri('/api/v1/products/post-product'),
    )
      ..headers.addAll(_authHeaders(token))
      ..fields['product'] = jsonEncode(body);
    final streamed = await _client.send(req);
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    invalidateReads('user-details');
    final b = resp.body;
    if (b.isEmpty) return const {};
    return (jsonDecode(b) as Map).cast<String, dynamic>();
  }

  /// Sell-wizard publish step 1 (SELL_FLOW_SPEC §4): post-product with the
  /// `product` JSON string part + the MAIN image file part (`images`).
  /// Images are bytes+filename (AU-040 D1): the web build has no file system
  /// to read a path back from. Returns PostProductResponseDTO.
  Future<Map<String, dynamic>> createListingMultipart(
    String token,
    Map<String, dynamic> body, {
    PendingImageRef? mainImage,
  }) async {
    final req = http.MultipartRequest(
      'POST',
      _uri('/api/v1/products/post-product'),
    )
      ..headers.addAll(_authHeaders(token))
      ..fields['product'] = jsonEncode(body);
    if (mainImage != null) {
      req.files.add(_imagePart('images', mainImage.bytes, mainImage.filename));
    }
    final streamed = await _client.send(req);
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    // The profile carries this seller's `products`, and My Space > Selling
    // lists it. Leaving it cached showed the listings as they were before
    // the publish — for up to 45 seconds, a seller who had just posted saw
    // an empty Selling tab.
    invalidateReads('user-details');
    final b = resp.body;
    if (b.isEmpty) return const {};
    return (jsonDecode(b) as Map).cast<String, dynamic>();
  }

  /// Publish step 2: upload the remaining images in batches of ≤5 file parts
  /// (bytes-based — see createListingMultipart).
  Future<void> addProductImages(
      String token, int productId, List<PendingImageRef> images) async {
    final req = http.MultipartRequest(
      'POST',
      _uri('/api/v1/products/$productId/images'),
    )..headers.addAll(_authHeaders(token));
    for (final im in images) {
      req.files.add(_imagePart('images', im.bytes, im.filename));
    }
    final streamed = await _client.send(req);
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
  }

  /// Property photos' order and groups (web 2026-10 `organizeProductImages`,
  /// backend V152): `PUT /api/v1/products/{id}/images/organize` with every
  /// image id in display order and its group name (null = ungrouped).
  Future<void> organizeProductImages(String token, int productId,
      List<({int imageId, String? groupName})> images) async {
    final resp = await _client.put(
      _uri('/api/v1/products/$productId/images/organize'),
      headers: {..._authHeaders(token), 'Content-Type': 'application/json'},
      body: jsonEncode({
        'images': [
          for (final i in images)
            {'imageId': i.imageId, 'groupName': i.groupName}
        ],
      }),
    );
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      throw ApiException(_authError(resp));
    }
    invalidateReads('user-details');
  }

  /// Publish step 4: quantity follow-up PATCH — multipart `product` part with
  /// only productQuantity (backend workaround the web keeps).
  Future<void> updateListingQuantity(
      String token, int productId, int quantity) async {
    final body = {'productQuantity': quantity};
    final req = http.MultipartRequest(
        'PATCH', _uri('/api/v1/products/update/$productId'))
      ..headers.addAll(_authHeaders(token))
      ..fields['product'] = jsonEncode(body);
    final streamed = await _client.send(req);
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    invalidateReads('user-details');
  }

  /// AU-054 listing status change: PATCH `/api/v1/products/status/{id}` with
  /// `{status}` (sandbox-proven 200; web My Listings dropdown parity).
  /// `status` ∈ AVAILABLE | ARCHIVED (backend echoes `{productId, status}`).
  Future<void> updateProductStatus(
      String token, int productId, String status) async {
    final resp = await _client.patch(
      _uri('/api/v1/products/status/$productId'),
      headers: _authHeaders(token),
      body: jsonEncode({'status': status}),
    );
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
    invalidateReads('user-details');
  }

  /// My-Listings availability write: PATCH `/api/v1/products/{id}/inventory`
  /// with `{quantity}` (web `updateProductInventory`, dashboard saveInventory).
  /// quantity > 0 flips the row to AVAILABLE; 0 marks it OUT_OF_STOCK. The
  /// backend derives `availabilityStatus` from the sign of the quantity, so the
  /// caller never sends a status here.
  Future<void> updateProductInventory(String token, int productId,
      {required int quantity}) async {
    final resp = await _client.patch(
      _uri('/api/v1/products/$productId/inventory'),
      headers: _authHeaders(token),
      body: jsonEncode({'quantity': quantity}),
    );
    if (resp.statusCode != 200 &&
        resp.statusCode != 201 &&
        resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
    invalidateReads('user-details');
  }

  /// AU-054 delete listing: DELETE `/api/v1/products/delete/{id}`
  /// (sandbox-proven 204 on a missing id too).
  Future<void> deleteProduct(String token, int productId) async {
    final resp = await _client.delete(
      _uri('/api/v1/products/delete/$productId'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
    invalidateReads('user-details');
  }

  /// Edit-listing image removal: DELETE
  /// `/api/v1/products/delete-image/{imageId}` (web parity
  /// `deleteProductImage`). The backend treats the FIRST image id as the cover,
  /// so changing the cover means delete-all + re-upload in the new order.
  Future<void> deleteProductImage(String token, int imageId) async {
    final resp = await _client.delete(
      _uri('/api/v1/products/delete-image/$imageId'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// Update a listing (PATCH `/api/v1/products/update/{productId}`, multipart
  /// `product` JSON part — same contract as post-product). Used by edit-listing.
  Future<Map<String, dynamic>> updateListing(
      String token, int productId, Map<String, dynamic> body) async {
    final req = http.MultipartRequest(
        'PATCH', _uri('/api/v1/products/update/$productId'))
      ..headers.addAll(_authHeaders(token))
      ..fields['product'] = jsonEncode(body);
    final streamed = await _client.send(req);
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode != 200 && resp.statusCode != 201)
      throw ApiException(_authError(resp));
    invalidateReads('user-details');
    final b = resp.body;
    if (b.isEmpty) return const {};
    return (jsonDecode(b) as Map).cast<String, dynamic>();
  }

  /// User addresses: GET `/api/v1/get-addresses` (auth).
  Future<List<Map<String, dynamic>>> getAddresses(String token) async {
    final resp = await _client.get(_uri('/api/v1/get-addresses'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    return (data is List ? data : const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  /// Default address: GET `/api/v1/get-default-address` (auth; 404 when none
  /// set). Used by checkout/sell prefill.
  Future<Map<String, dynamic>?> getDefaultAddress(String token) async {
    final resp = await _client.get(_uri('/api/v1/get-default-address'),
        headers: _authHeaders(token));
    if (resp.statusCode == 404) return null;
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return (jsonDecode(resp.body) as Map).cast<String, dynamic>();
  }

  /// AU-060 update address: PUT `/api/v1/update-address/{id}` with the full
  /// AddressDTO body (sandbox-proven 200 on a real id; web `updateAddress`).
  Future<void> updateAddress(
      String token, int addressId, Map<String, dynamic> body) async {
    final resp = await _client.put(
      _uri('/api/v1/update-address/$addressId'),
      headers: _authHeaders(token),
      body: jsonEncode(body),
    );
    if (resp.statusCode != 200 && resp.statusCode != 204)
      throw ApiException(_authError(resp));
  }

  /// AU-060 delete address: DELETE `/api/v1/delete-address/{id}`
  /// (sandbox-proven 204 on a real id).
  Future<void> deleteAddress(String token, int addressId) async {
    final resp = await _client.delete(
      _uri('/api/v1/delete-address/$addressId'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 && resp.statusCode != 204)
      throw ApiException(_authError(resp));
  }

  /// AU-060 set default: POST `/api/v1/set-default-address?addressId={id}`
  /// (query param per the backend @RequestParam — sandbox-proven 200).
  Future<void> setDefaultAddress(String token, int addressId) async {
    final resp = await _client.post(
      _uri('/api/v1/set-default-address', {'addressId': '$addressId'}),
      headers: _authHeaders(token),
      body: jsonEncode(const {}),
    );
    if (resp.statusCode != 200 && resp.statusCode != 204)
      throw ApiException(_authError(resp));
  }

  /// Add an address: POST `/api/v1/add-address` (auth).
  ///
  /// Takes the whole `AddressDTO` rather than a handful of named fields.
  /// The old signature sent `{street, city, country, phoneNumber, label}`, and
  /// `city`/`phoneNumber` are not fields on the DTO at all — so the backend
  /// dropped them and every address added from this app was saved with **no
  /// region and no map pin**, even though the form collected both. Editing it
  /// afterwards worked, because update already sent the full body.
  ///
  /// Coordinates matter beyond display: a listing whose pickup address has no
  /// pin is what the dashboard reports as "delivery setup needs attention".
  Future<Map<String, dynamic>> addAddress(
    String token,
    Map<String, dynamic> body,
  ) async {
    final resp = await _client.post(
      _uri('/api/v1/add-address'),
      headers: _authHeaders(token),
      body: jsonEncode(body),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201)
      throw ApiException(_authError(resp));
    final b = resp.body;
    if (b.isEmpty) return const {};
    return (jsonDecode(b) as Map).cast<String, dynamic>();
  }

  /// Forgot password (public): POST `/api/v1/userManagement/reset-passwordEmail?email=`.
  ///
  /// AU-012 sandbox-proven contract: HTTP 200 with a **plain-text** body
  /// "Password reset email sent successfully" (Content-Type text/plain). The
  /// previous implementation jsonDecode'd the body — FormatException → the
  /// generic catch in the reset screen swallowed it as "Failed to send OTP"
  /// and stage 1 NEVER advanced even though the backend accepted the request.
  /// Unknown emails answer 404 "User not found" (surfaced by the caller).
  Future<Map<String, dynamic>> forgotPassword(String email) async {
    final resp = await _client.post(
      _uri('/api/v1/userManagement/reset-passwordEmail', {'email': email}),
      headers: _headers,
    );
    if (resp.statusCode != 200 && resp.statusCode != 201)
      throw ApiException(_authError(resp));
    return decodeBodyAsJson(resp);
  }

  /// Parse an HTTP body that may be JSON, plain text, or empty into a JSON
  /// map. Non-JSON text is wrapped as `{message: body}` so callers can
  /// branch on backend sentences like "Wrong OTP".
  Map<String, dynamic> decodeBodyAsJson(http.Response resp) {
    final b = resp.body;
    if (b.isEmpty) return const {};
    try {
      final decoded = jsonDecode(b);
      if (decoded is Map) return decoded.cast<String, dynamic>();
      if (decoded is String) return {'message': decoded};
      return {'message': b};
    } on FormatException {
      // Plain-text success/error sentence from the backend.
      return {'message': b.trim()};
    }
  }

  /// Send signup OTP (public): POST `/api/v1/email/send-signup-Otp`.
  ///
  /// Query params mirror the reference `apiClient.sendSignupOtp`:
  /// `signupEmail` (+ optional `firstName`, `lastName`). The backend answers
  /// 202 Accepted with the plain text "Verification code queued for delivery".
  Future<Map<String, dynamic>> sendSignupOtp(
    String email, {
    String? firstName,
    String? lastName,
  }) async {
    final resp = await _client.post(
      _uri('/api/v1/email/send-signup-Otp', {
        'signupEmail': email,
        if (firstName != null && firstName.isNotEmpty) 'firstName': firstName,
        if (lastName != null && lastName.isNotEmpty) 'lastName': lastName,
      }),
      headers: _headers,
    );
    // Backend returns 202 Accepted with a plain-text confirmation body.
    if (resp.statusCode != 200 &&
        resp.statusCode != 201 &&
        resp.statusCode != 202) {
      throw ApiException(_authError(resp));
    }
    final b = resp.body;
    if (b.isEmpty) return const {};
    try {
      final decoded = jsonDecode(b);
      if (decoded is Map) return decoded.cast<String, dynamic>();
    } catch (_) {
      // non-JSON body (e.g. "Verification code queued for delivery")
    }
    return {'message': b.trim()};
  }

  /// Verify the signup OTP (public): POST `/api/v1/email/verify-signup-otp`
  /// with JSON `{email, otp}` (backend `VerifyOTPDTO`).
  ///
  /// Returns an [OtpResult] whose [OtpResult.verified] is true only for
  /// "OTP verified successfully" / "OTP already verified". Any other status or
  /// body ("Wrong OTP", "OTP has expired", "User not found") comes back as
  /// `verified: false` + the server message so callers can show it verbatim.
  Future<OtpResult> verifySignupOtp(String email, String otp) async {
    final resp = await _client.post(
      _uri('/api/v1/email/verify-signup-otp'),
      headers: _headers,
      body: jsonEncode({'email': email, 'otp': otp}),
    );
    return _otpResult(resp);
  }

  /// AU-061 organization-email verification: send (auth) then verify.
  /// Web parity `sendEmailOtp` / `verifyEmailOtp` in lib/api.ts — the same
  /// backend endpoints serve signup and org flows; the org send requires the
  /// Authorization header.
  Future<Map<String, dynamic>> sendOrganizationEmailOtp(
      String token, String organizationalEmail) async {
    final resp = await _client.post(
      _uri('/api/v1/email/sendOTP',
          {'organizationalEmail': organizationalEmail}),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 &&
        resp.statusCode != 201 &&
        resp.statusCode != 202) {
      throw ApiException(_authError(resp));
    }
    final b = resp.body;
    if (b.isEmpty) return const {};
    try {
      final decoded = jsonDecode(b);
      if (decoded is Map) return decoded.cast<String, dynamic>();
    } catch (_) {}
    return {'message': b.trim()};
  }

  Future<OtpResult> verifyOrganizationEmailOtp(
      String organizationalEmail, String otp) async {
    final resp = await _client.post(
      _uri('/api/v1/email/verifyOTP'),
      headers: _headers,
      body: jsonEncode({'email': organizationalEmail, 'otp': otp}),
    );
    return _otpResult(resp);
  }

  /// Step 1 of password reset (public): POST
  /// `/api/v1/userManagement/reset-passwordEmail?email=`.
  Future<Map<String, dynamic>> sendPasswordResetOtp(String email) async =>
      forgotPassword(email);

  /// Step 2 of password reset (public): POST
  /// `/api/v1/userManagement/verify-otp?loggingEmail=&otp=`.
  ///
  /// NOTE (verified against the sandbox): this endpoint answers a WRONG code
  /// with HTTP **200** and the plain-text body "Wrong OTP", so success must be
  /// decided from the body message, never from the status code alone.
  Future<OtpResult> verifyPasswordResetOtp(String email, String otp) async {
    final resp = await _client.post(
      _uri('/api/v1/userManagement/verify-otp', {
        'loggingEmail': email,
        'otp': otp,
      }),
      headers: _headers,
    );
    return _otpResult(resp);
  }

  /// Step 3 of password reset (public): POST `/api/v1/userManagement/new-password`
  /// with JSON `{loggingEmail, newPassword}` (backend `ResetPasswordDTO`).
  Future<void> resetPasswordWithOtp(String email, String newPassword) async {
    final resp = await _client.post(
      _uri('/api/v1/userManagement/new-password'),
      headers: _headers,
      body: jsonEncode({'loggingEmail': email, 'newPassword': newPassword}),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
  }

  /// Signed-in password change: PUT `/api/v1/userManagement/changePassword`
  /// with JSON `{currentPassword, newPassword}` (backend `ChangePasswordDTO`;
  /// the account is taken from the JWT, never from the body). Web parity:
  /// `apiClient.changePassword` behind the Security tab of /account/settings.
  ///
  /// A wrong current password comes back as a non-2xx with the backend's own
  /// message, which the caller surfaces verbatim - never a generic success.
  Future<void> changePassword(
    String token, {
    required String currentPassword,
    required String newPassword,
  }) async {
    final resp = await _client.put(
      _uri('/api/v1/userManagement/changePassword'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      }),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
  }

  /// Delete the signed-in account: DELETE `/api/v1/userManagement/account`.
  ///
  /// The backend anonymizes retained transaction records where full deletion is
  /// not legally safe, removes removable account data, and invalidates future
  /// login by changing the account's login identifier server-side.
  Future<void> deleteAccount(String token) async {
    final resp = await _client.delete(
      _uri('/api/v1/userManagement/account'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  /// Shared OTP-response decoding: plain-text bodies become `{message: …}`;
  /// non-2xx statuses keep their message but never mark the OTP verified.
  OtpResult _otpResult(http.Response resp) {
    String message;
    try {
      final decoded = jsonDecode(resp.body);
      if (decoded is Map) {
        message = (decoded['message'] ?? decoded['error'] ?? '').toString();
      } else {
        message = decoded.toString();
      }
    } catch (_) {
      message = resp.body.trim();
    }
    final ok2xx = resp.statusCode >= 200 && resp.statusCode < 300;
    final m = message.toLowerCase();
    final positive =
        m.contains('verified successfully') || m.contains('already verified');
    final verified = ok2xx &&
        positive &&
        !m.contains('not verified') &&
        !m.contains('failed') &&
        !m.contains('wrong') &&
        !m.contains('expired');
    return OtpResult(
        verified: verified, message: message, statusCode: resp.statusCode);
  }

  /// Result of an OTP verification call: [verified] mirrors web
  /// `isSignupOtpVerified` (body-message based), [message] is the raw backend
  /// text for display ("Wrong OTP", "OTP has expired", …).
  /// Seller summary (public): GET `/api/v1/userManagement/seller-summary/{id}`.
  Future<Map<String, dynamic>> fetchSellerSummary(int sellerId) async {
    final resp = await _client.get(
        _uri('/api/v1/userManagement/seller-summary/$sellerId'),
        headers: _headers);
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return (jsonDecode(resp.body) as Map).cast<String, dynamic>();
  }

  /// Public paged user ratings: GET `/api/v1/user-ratings/{userId}?page&size`
  /// → `content[]` of `{ratingId, authorName, stars, reviewText, ratingType,
  /// createdAt}` (AU-017 Reviews tab; web parity `getUserRatings`).
  Future<List<Map<String, dynamic>>> fetchUserRatings(int userId,
      {int page = 0, int size = 10}) async {
    final resp = await _client.get(
        _uri(
            '/api/v1/user-ratings/$userId', {'page': '$page', 'size': '$size'}),
        headers: _headers);
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : const <dynamic>[];
    return content.whereType<Map<String, dynamic>>().toList();
  }

  /// Order transporter / delivery info: GET `/api/v1/orders/{id}/transporter`.
  Future<Map<String, dynamic>> fetchOrderTransporter(
      String token, String orderId) async {
    final resp = await _client.get(_uri('/api/v1/orders/$orderId/transporter'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final b = resp.body;
    if (b.isEmpty) return const {};
    return (jsonDecode(b) as Map).cast<String, dynamic>();
  }

  /// Saved/wishlist products of the current user: GET `/api/saved-products`.
  Future<List<int>> fetchSavedProductIds(String token) async {
    final resp = await _client.get(_uri('/api/saved-products'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final b = resp.body;
    if (b.isEmpty) return const [];
    final decoded = jsonDecode(b);
    // Backend returns either [{productId: n, ...}] or {productIds: [n]}.
    if (decoded is List) {
      return decoded
          .whereType<Map>()
          .map((e) => (e['productId'] as num?)?.toInt())
          .whereType<int>()
          .toList();
    }
    if (decoded is Map) {
      return ((decoded['productIds'] as List?) ?? const [])
          .whereType<num>()
          .map((e) => e.toInt())
          .toList();
    }
    return const [];
  }

  /// Saved/wishlist products with full rows (AU-050 saved grid): the backend
  /// list endpoint already carries product payloads, so no per-id refetch is
  /// needed. Rows that fail to parse are skipped.
  Future<List<Product>> fetchSavedProducts(String token) async {
    final resp = await _client.get(_uri('/api/saved-products'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final b = resp.body;
    if (b.isEmpty) return const [];
    final decoded = jsonDecode(b);
    if (decoded is! List) return const [];
    return decoded
        .whereType<Map>()
        .map((e) => (e).cast<String, dynamic>())
        .map(Product.fromJson)
        .toList();
  }

  /// Save product to wishlist: POST `/api/saved-products/{id}`.
  Future<void> saveProduct(String token, int productId) async {
    final resp = await _client.post(
      _uri('/api/saved-products/$productId'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201)
      throw ApiException(_authError(resp));
  }

  /// Remove product from wishlist: DELETE `/api/saved-products/{id}`.
  Future<void> unsaveProduct(String token, int productId) async {
    final resp = await _client.delete(
      _uri('/api/saved-products/$productId'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 &&
        resp.statusCode != 204 &&
        resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
  }

  /// Admin order detail: GET `/api/v1/admin/orders/{id}` (ADMIN role). The
  /// admin order screen uses this to re-fetch after an escrow/refund action
  /// (the buyer endpoint /orders/{id} 403s on orders the admin does not own).
  Future<Order> adminFetchOrder(String token, String orderId) async {
    final resp = await _client.get(_uri('/api/v1/admin/orders/$orderId'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return Order.fromJson(
        (jsonDecode(resp.body) as Map).cast<String, dynamic>());
  }

  // ---- AU-042: admin payments review loop (AdminProformaController) ----------

  /// Status-filtered proforma queue: GET `/api/v1/admin/payments`
  /// (`?status=&page=&size=&search=`). Returns the raw Page<Map> rows —
  /// proformaNumber, buyerName, grandTotal, receipts[], transactionReferences,
  /// orderIds, overdue.
  Future<List<Map<String, dynamic>>> adminPaymentsQueue(String token,
      {String status = 'PAYMENT_SUBMITTED',
      int page = 0,
      int size = 20,
      String? search}) async {
    final resp = await _client.get(
      _uri('/api/v1/admin/payments', {
        'status': status,
        'page': '$page',
        'size': '$size',
        if (search != null && search.isNotEmpty) 'search': search,
      }),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    final data = jsonDecode(resp.body);
    final content = data is Map && data['content'] is List
        ? data['content'] as List
        : const <dynamic>[];
    return content.whereType<Map<String, dynamic>>().toList();
  }

  /// Queue KPIs: GET `/api/v1/admin/proformas/stats` →
  /// {pending/verified/rejected/expired counts + amounts} for the tab header.
  Future<Map<String, dynamic>> adminProformaStats(String token) async {
    final resp = await _client.get(_uri('/api/v1/admin/proformas/stats'),
        headers: _authHeaders(token));
    if (resp.statusCode != 200) throw ApiException(_authError(resp));
    return (jsonDecode(resp.body) as Map).cast<String, dynamic>();
  }

  /// VERIFY one SUBMITTED receipt: POST `/api/v1/admin/receipts/{id}/verify`.
  Future<Map<String, dynamic>> adminVerifyReceipt(
          String token, String receiptId) =>
      _adminReceiptAction(token, receiptId, 'verify', null);

  /// REJECT with a reasonCode shown to the buyer:
  /// POST `/api/v1/admin/receipts/{id}/reject` `{reasonCode, note}`.
  Future<Map<String, dynamic>> adminRejectReceipt(
          String token, String receiptId, String reasonCode, String note) =>
      _adminReceiptAction(
          token, receiptId, 'reject', {'reasonCode': reasonCode, 'note': note});

  Future<Map<String, dynamic>> _adminReceiptAction(String token,
      String receiptId, String op, Map<String, dynamic>? body) async {
    final resp = await _client.post(
      _uri('/api/v1/admin/receipts/$receiptId/$op'),
      headers: _authHeaders(token),
      body: jsonEncode(body ?? const {}),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    final b = resp.body;
    return b.isEmpty
        ? const {}
        : (jsonDecode(b) as Map).cast<String, dynamic>();
  }

  /// CONFIRM payment: POST `/api/v1/admin/proformas/{id}/confirm-payment`
  /// → proforma CONFIRMED; orders flip PAID / escrowPending=false / HELD.
  Future<Map<String, dynamic>> adminConfirmPayment(
      String token, String proformaId) async {
    final resp = await _client.post(
      _uri('/api/v1/admin/proformas/$proformaId/confirm-payment'),
      headers: _authHeaders(token),
      body: jsonEncode(const {}),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    final b = resp.body;
    return b.isEmpty
        ? const {}
        : (jsonDecode(b) as Map).cast<String, dynamic>();
  }

  /// BULK approve multi-select: POST `/api/v1/admin/proformas/bulk-approve`
  /// body `{proformaIds:[...]}`.
  Future<dynamic> adminBulkApprove(
      String token, List<String> proformaIds) async {
    final resp = await _client.post(
      _uri('/api/v1/admin/proformas/bulk-approve'),
      headers: _authHeaders(token),
      body: jsonEncode({'proformaIds': proformaIds}),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    return jsonDecode(resp.body);
  }

  /// Cancel-after-rejection once the 48h window closes:
  /// POST `/api/v1/admin/proformas/{id}/cancel-after-rejection`.
  Future<Map<String, dynamic>> adminCancelAfterRejection(
      String token, String proformaId) async {
    final resp = await _client.post(
      _uri('/api/v1/admin/proformas/$proformaId/cancel-after-rejection'),
      headers: _authHeaders(token),
      body: jsonEncode(const {}),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    final b = resp.body;
    return b.isEmpty
        ? const {}
        : (jsonDecode(b) as Map).cast<String, dynamic>();
  }

  /// Authed receipt preview bytes: GET `/api/v1/admin/receipts/{id}/file`.
  /// Receipt files are private — never render from the public URL.
  Future<Uint8List> adminReceiptFile(String token, String receiptId) async {
    final resp = await _client.get(
      _uri('/api/v1/admin/receipts/$receiptId/file'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200)
      throw ApiException('receipt file ${resp.statusCode}');
    return resp.bodyBytes;
  }

  /// Admin order action (escrow/refund lifecycle) — drives the REAL sandbox
  /// admin endpoint and returns the backend's response (never faked). `action`
  /// is the endpoint segment, e.g. mark-paid, release-payment, refund,
  /// confirm-receipt, dispatch.
  ///
  /// The HTTP verb comes from an explicit map proven against the backend
  /// controllers (e2e/API_MAP.md correction #3 + the reference lib/api.ts) —
  /// no guessing: a wrong verb 405s silently into a false "updated" state.
  /// Verb contract AUDITED line-by-line against the backend controllers
  /// (AdminController + AdminOrderEscrowController, 2026-08-24; e2e/API_MAP.md):
  /// PATCH = status setters taking a body · POST = one-shot transitions.
  static const Map<String, String> _orderActionMethods = {
    // PATCH family — @PatchMapping in AdminController
    'mark-paid': 'PATCH', // L188
    'mark-picked-up': 'PATCH', // L195
    'mark-delivered': 'PATCH', // L202
    'cancel': 'PATCH', // L209 {reason}
    'confirm-receipt': 'PATCH', // L217 {rating?, comment?}
    'confirm-availability': 'PATCH', // L224 (NOT POST — would 405)
    'decline-availability': 'PATCH', // L231
    'status': 'PATCH', // L178 {status}
    'delivery-time/confirm': 'PATCH', // L272
    'delivery-time/propose': 'PATCH', // L263
    // POST family — @PostMapping in AdminController/AdminOrderEscrowController
    'release-payment': 'POST', // EscrowController L46
    'refund': 'POST', // EscrowController L29
    'dispatch': 'POST', // L256
    'availability-decision': 'POST', // L239
    'transporter': 'POST', // L248
    'verify-delivery': 'POST', // L279
    'regenerate-delivery-code': 'POST', // L287
    'verify-rental-handoff': 'POST', // L294
    'regenerate-rental-handoff-code': 'POST', // L303
    'rate-buyer': 'POST', // L311 {rating, reviewText}
    'rate-seller': 'POST', // L321
  };

  Future<Map<String, dynamic>> adminOrderAction(
    String token,
    String orderId,
    String action, {
    Map<String, dynamic>? body,
    String? method,
  }) async {
    final m = method ?? _orderActionMethods[action];
    assert(m != null,
        'Unknown order action "$action" — add it to _orderActionMethods');
    final resp = await _client.send(http.Request(
      m ?? 'POST',
      _uri('/api/v1/admin/orders/$orderId/$action'),
    )
      ..headers.addAll(_authHeaders(token))
      ..headers['content-type'] = 'application/json'
      ..body = jsonEncode(body ?? const {}));
    if (resp.statusCode != 200 &&
        resp.statusCode != 201 &&
        resp.statusCode != 204) {
      throw ApiException(_authError(await http.Response.fromStream(resp)));
    }
    // This write moved an order, so the cached list is stale.
    invalidateReads('orders');
    requestPendingActionsRefresh();
    final b = (await http.Response.fromStream(resp)).body;
    if (b.isEmpty) return const {};
    return (jsonDecode(b) as Map).cast<String, dynamic>();
  }

  /// Buyer/seller lifecycle action on the user-facing orders controller
  /// (`OrderLifecycleController`, base `/api/v1/orders`) — AU-037/038.
  /// Sandbox-probed verbs: confirm-receipt = PATCH {rating,comment};
  /// seller-cancel = PATCH {reason}; seller-rate = POST {rating,reviewText}.
  Future<Map<String, dynamic>> orderAction(
    String token,
    String orderId,
    String action, {
    Map<String, dynamic>? body,
  }) async {
    const methods = {
      'confirm-receipt': 'PATCH',
      'seller-cancel': 'PATCH',
      'seller-rate': 'POST',
      'verify-delivery':
          'POST', // body {code}; wrong code → 400 + attemptsRemaining
      'regenerate-delivery-code': 'POST',
      // AU-039: buyer self-confirm without an OTP (TransporterController
      // POST /orders/{id}/confirm-delivery → DELIVERED, method BUYER_BUTTON).
      'confirm-delivery': 'POST',
      'mark-picked-up': 'PATCH',
      'mark-delivered': 'PATCH',
      'availability-decision': 'POST',
      // AU-038 logistics-v2 stock gate (reference confirmOrderAvailability /
      // declineOrderAvailability): POST, decline takes {reason}.
      'confirm-availability': 'POST',
      'decline-availability': 'POST',
      // Logistics-v2 seller dispatch → IN_TRANSIT (web lib/api.ts
      // dispatchOrder, POST /api/v1/orders/{id}/dispatch).
      'dispatch': 'POST',
      // Logistics-v2 buyer delivery-time negotiation (web lib/api.ts
      // confirmDeliveryTime / proposeDeliveryTime — PATCH both).
      'delivery-time/confirm': 'PATCH',
      'delivery-time/propose': 'PATCH', // body {proposedDeliveryTime, note?}
      // Seller/transporter rental start: enter the renter's handoff code
      // (web rental-handoff-code-card verifyRentalHandoff, POST).
      'verify-rental-handoff': 'POST', // body {code}
    };
    final resp = await _client.send(http.Request(
      methods[action] ?? 'POST',
      _uri('/api/v1/orders/$orderId/$action'),
    )
      ..headers.addAll(_authHeaders(token))
      ..headers['content-type'] = 'application/json'
      ..body = jsonEncode(body ?? const {}));
    if (resp.statusCode != 200 &&
        resp.statusCode != 201 &&
        resp.statusCode != 204) {
      throw ApiException(_authError(await http.Response.fromStream(resp)));
    }
    // This write moved an order, so the cached list is stale.
    invalidateReads('orders');
    requestPendingActionsRefresh();
    final b = (await http.Response.fromStream(resp)).body;
    if (b.isEmpty) return const {};
    return (jsonDecode(b) as Map).cast<String, dynamic>();
  }

  /// Full product detail: `/api/v1/displayItem/itemDetails/{id}` (public).
  Future<ProductDetail> fetchProductDetail(int id, {String? token}) async {
    final resp = await _client.get(
      _uri('/api/v1/displayItem/itemDetails/$id'),
      headers:
          token != null && token.isNotEmpty ? _authHeaders(token) : _headers,
    );
    if (resp.statusCode == 404) {
      // Sandbox/prod answer raw HTTP 404 for hidden or deleted listings.
      // Carry BOTH markers: 'Product not found' routes the detail screen to
      // its dedicated not-found branch ("Error: Product not found" + a single
      // Back to Browse action — reference /product/[id] copy), while 'HTTP 404'
      // keeps the owner-fallback trigger and error_text's "We couldn't find
      // that." mapping working for every other caller (AU-013 verifier r2).
      throw ApiException('Product not found (HTTP 404)');
    }
    if (resp.statusCode != 200) {
      throw ApiException('itemDetails failed: HTTP ${resp.statusCode}');
    }
    return ProductDetail.fromJson(
      (jsonDecode(resp.body) as Map).cast<String, dynamic>(),
    );
  }

  // ---- AU-013 click tracking (web parity lib/api.ts trackProductClick etc.)
  //
  // All four calls are fire-and-forget on the detail screen and must never
  // block rendering — the screen wraps them in catch(_){}.

  /// POST `/api/v1/products/{id}/clicks` (public). Sends `Authorization` when
  /// [token] is set, else a stable `X-Anonymous-Id` so repeat views from the
  /// same device de-dup (web parity getAnonymousId in request-board-api.ts).
  /// Returns `productTotalClickCount` from the response body.
  Future<int> trackProductClick(int id, {String? token}) async {
    final resp = await _client.post(_uri('/api/v1/products/$id/clicks'),
        headers: await _clickHeaders(token));
    if (resp.statusCode != 200) {
      throw ApiException('trackClick failed: HTTP ${resp.statusCode}');
    }
    final b = jsonDecode(resp.body);
    return (b is Map && b['productTotalClickCount'] is num)
        ? (b['productTotalClickCount'] as num).toInt()
        : 0;
  }

  /// GET `/api/v1/products/{id}/clicks/total` → totalClickCount.
  Future<int> fetchProductTotalClicks(int id) async {
    final resp = await _client.get(_uri('/api/v1/products/$id/clicks/total'),
        headers: _headers);
    if (resp.statusCode != 200) {
      throw ApiException('clickTotal failed: HTTP ${resp.statusCode}');
    }
    final b = jsonDecode(resp.body);
    return (b is Map && b['totalClickCount'] is num)
        ? (b['totalClickCount'] as num).toInt()
        : 0;
  }

  /// GET `/api/v1/products/{id}/clicks/unique` returns uniqueViewCount.
  Future<int> fetchProductUniqueViews(int id) async {
    final resp = await _client.get(_uri('/api/v1/products/$id/clicks/unique'),
        headers: _headers);
    if (resp.statusCode != 200) {
      throw ApiException('clickUnique failed: HTTP ${resp.statusCode}');
    }
    final b = jsonDecode(resp.body);
    return (b is Map && b['uniqueViewCount'] is num)
        ? (b['uniqueViewCount'] as num).toInt()
        : 0;
  }

  /// AU-046: GET `/api/v1/displayItem/category-availability` (public) →
  /// `[categoryId, ...]` of categories that have public listings. The home
  /// rails skip empty categories like the reference (`category-rails.tsx`).
  Future<List<int>> fetchCategoryAvailability() async {
    final resp = await _client.get(
        _uri('/api/v1/displayItem/category-availability'),
        headers: _headers);
    if (resp.statusCode != 200) {
      throw ApiException(
          'categoryAvailability failed: HTTP ${resp.statusCode}');
    }
    final data = jsonDecode(resp.body);
    return data is List
        ? data.map((e) => (e as num).toInt()).toList()
        : const <int>[];
  }

  /// GET `/api/v1/displayItem/subcategory-availability` (public) →
  /// `[subcategoryId, ...]` of subcategories that currently have public
  /// listings. Web parity `getAvailableSubcategoryIds` (lib/api.ts:1787):
  /// browse's taxonomy rail lists only subcategories a shopper can actually
  /// land results in.
  Future<List<int>> fetchSubcategoryAvailability() async {
    final resp = await _client.get(
        _uri('/api/v1/displayItem/subcategory-availability'),
        headers: _headers);
    if (resp.statusCode != 200) {
      throw ApiException(
          'subcategoryAvailability failed: HTTP ${resp.statusCode}');
    }
    final decoded = jsonDecode(resp.body);
    // The endpoint has answered both as a bare array and wrapped in `data`;
    // web tolerates both (`response.data || response`), so this does too.
    final data = decoded is Map ? decoded['data'] : decoded;
    return data is List
        ? data.whereType<num>().map((e) => e.toInt()).toList()
        : const <int>[];
  }

  /// GET `/api/v1/userManagement/user-details` — the signed-in viewer's
  /// profile incl. `roles` + own `products` (AU-013 hidden-listing guard and
  /// owner fallback both read it; web parity `getUserDetails` in lib/api.ts).
  /// The signed-in user's profile. The top bar and the pending-actions
  /// banner both read it on every tab change, and eight other screens read it
  /// on mount; a short TTL collapses that to one request. Anything that edits
  /// the profile calls [invalidateReads] so the change is visible at once.
  Future<Map<String, dynamic>> getUserDetails(String token) => _cachedRead(
      'user-details', const Duration(seconds: 45), () => _getUserDetails(token),
      scope: token);

  Future<Map<String, dynamic>> _getUserDetails(String token) async {
    final resp = await _client.get(
      _uri('/api/v1/userManagement/user-details'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200) {
      throw ApiException('user-details failed: HTTP ${resp.statusCode}');
    }
    final data = (jsonDecode(resp.body) as Map).cast<String, dynamic>();
    return _normalizeUserDetails(data);
  }

  /// Web parity `normalizeUserDetails` (lib/api.ts): the backend has been
  /// inconsistent across code paths about which exact key/casing carries the
  /// WhatsApp number, so web never trusts `whatsAppPhoneNumber` alone — every
  /// caller (profile prefill, checkout autofill, sell-listing autofill) reads
  /// through this same fallback chain. Mobile read only the one key, so a
  /// number that truly saved could still show up blank everywhere the
  /// backend happened to answer under a different key.
  Map<String, dynamic> _normalizeUserDetails(Map<String, dynamic> data) {
    final whatsapp = data['whatsAppPhoneNumber'] ??
        data['whatsappPhoneNumber'] ??
        data['whatsapp'] ??
        data['phoneNumber'];
    if (whatsapp != null) data['whatsAppPhoneNumber'] = whatsapp;
    return data;
  }

  /// GET `/api/v1/products/{id}/clicks/analytics` — admin-gated by the
  /// backend; a non-admin gets 403 and an empty panel (web parity: the panel
  /// simply stays hidden when the fetch fails).
  Future<ProductClickAnalytics> fetchProductClickAnalytics(
      int id, String token) async {
    final resp = await _client.get(
      _uri('/api/v1/products/$id/clicks/analytics'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode == 403) return const ProductClickAnalytics();
    if (resp.statusCode != 200) {
      throw ApiException('clickAnalytics failed: HTTP ${resp.statusCode}');
    }
    return ProductClickAnalytics.fromJson(
        (jsonDecode(resp.body) as Map).cast<String, dynamic>());
  }

  static const String kAnonIdKey = 'ge_anon_id';

  /// Stable per-device anonymous id (web parity: `anon:<random>` persisted
  /// under localStorage key `ge_anon_id` in request-board-api.ts).
  Future<String> _anonymousId() async {
    var id = KvStore.instance.getString(kAnonIdKey);
    if (id == null || id.isEmpty) {
      final ts = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
      final rand =
          DateTime.now().hashCode.toRadixString(36).replaceAll('-', '');
      id = 'anon:$ts$rand';
      await KvStore.instance.setString(kAnonIdKey, id);
    }
    return id;
  }

  Future<Map<String, String>> _clickHeaders(String? token) async {
    if (token != null && token.isNotEmpty) return _authHeaders(token);
    return {..._headers, 'X-Anonymous-Id': await _anonymousId()};
  }

  void dispose() => _client.close();

  // ---- Rental availability and owner blocks (Phase 1, unit 3) --------------

  /// GET `/api/v1/displayItem/itemDetails/{id}/rental-availability` (public) —
  /// the nights already taken on a rental, so the booking calendar can refuse
  /// them before anything reaches the cart. Web parity: the same endpoint
  /// backs the reference's rental date picker.
  ///
  /// Availability is advisory, not a gate: a failure yields an empty result so
  /// a booking is still possible and the backend stays the authority on
  /// clashes.
  Future<RentalAvailability?> fetchRentalAvailability(int productId) async {
    try {
      final resp = await _client.get(
        _uri('/api/v1/displayItem/itemDetails/$productId/rental-availability'),
        headers: _headers,
      );
      if (resp.statusCode != 200) return null;
      final body = jsonDecode(resp.body);
      if (body is! Map) return null;
      // Web `unwrapAvailability`: accept a `{data: {...}}` envelope too.
      final data = body['data'] is Map ? body['data'] as Map : body;
      return RentalAvailability.fromJson(data.cast<String, dynamic>());
    } catch (_) {
      return null;
    }
  }

  /// GET `/api/v1/products/{id}/rental-blocks` — the owner's own closed dates.
  Future<List<RentalCalendarBlock>> listRentalBlocks(
      int productId, String token) async {
    final resp = await _client.get(
      _uri('/api/v1/products/$productId/rental-blocks'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200) {
      throw ApiException('rental blocks failed: HTTP ${resp.statusCode}');
    }
    final data = jsonDecode(resp.body);
    if (data is! List) return const <RentalCalendarBlock>[];
    return data
        .whereType<Map>()
        .map((e) => RentalCalendarBlock.fromJson(e.cast<String, dynamic>()))
        .whereType<RentalCalendarBlock>()
        .toList();
  }

  /// POST `/api/v1/products/{id}/rental-blocks` — close a date range.
  ///
  /// [endDate] is the checkout day and is not itself closed, matching how the
  /// backend stores booked ranges.
  Future<RentalCalendarBlock> createRentalBlock(
    int productId,
    String token, {
    required DateTime startDate,
    required DateTime endDate,
  }) async {
    final resp = await _client.post(
      _uri('/api/v1/products/$productId/rental-blocks'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'startDate': rentalDateToJson(startDate),
        'endDate': rentalDateToJson(endDate),
      }),
    );
    if (resp.statusCode != 200 && resp.statusCode != 201) {
      throw ApiException(_authError(resp));
    }
    final block = RentalCalendarBlock.fromJson(
        (jsonDecode(resp.body) as Map).cast<String, dynamic>());
    if (block == null) {
      throw ApiException('Could not block those dates.');
    }
    return block;
  }

  /// DELETE `/api/v1/products/{id}/rental-blocks/{blockId}` — reopen a range.
  Future<void> deleteRentalBlock(
      int productId, int blockId, String token) async {
    final resp = await _client.delete(
      _uri('/api/v1/products/$productId/rental-blocks/$blockId'),
      headers: _authHeaders(token),
    );
    if (resp.statusCode != 200 && resp.statusCode != 204) {
      throw ApiException(_authError(resp));
    }
  }

  // ---- Google OAuth (web parity: app/api/oauth/google + lib/auth-service) ---
  //
  // No Google credentials live in this app, and none live in the web frontend
  // either — the backend holds the client id and secret and builds the consent
  // URL itself. The client's whole job is: ask for the URL, get the user
  // through it, hand the resulting code back.

  /// GET `/api/v1/oauth2/login/google?nextPath=…` → the Google consent URL.
  ///
  /// The redirect target is fixed server-side (`GOOGLE_REDIRECT_URL`), so the
  /// caller cannot choose where Google lands; [nextPath] only rides along in
  /// `state` for the post-login hop.
  Future<String> getGoogleAuthUrl({String nextPath = '/'}) async {
    final resp = await _client.get(
      _uri(
          '/api/v1/oauth2/login/google?nextPath=${Uri.encodeQueryComponent(nextPath)}'),
      headers: _headers,
    );
    if (resp.statusCode != 200) {
      throw ApiException(
          'Could not start Google sign-in (HTTP ${resp.statusCode}).');
    }
    final data = jsonDecode(resp.body);
    final url = data is Map ? data['authUrl']?.toString() : null;
    if (url == null || url.isEmpty) {
      throw ApiException('Google sign-in is unavailable right now.');
    }
    return url;
  }

  /// GET `/api/v1/oauth2/exchange?code=…` → the platform session.
  ///
  /// One-shot: the code is spent by the first caller, so whoever receives the
  /// redirect must be the one to exchange it.
  Future<GoogleSignInResult> exchangeOAuthCode(String code) async {
    final resp = await _client.get(
      _uri('/api/v1/oauth2/exchange?code=${Uri.encodeQueryComponent(code)}'),
      headers: _headers,
    );
    final body =
        resp.body.isEmpty ? const <String, dynamic>{} : jsonDecode(resp.body);
    final map =
        body is Map ? body.cast<String, dynamic>() : const <String, dynamic>{};
    if (resp.statusCode == 403 && map['errorCode'] == 'ACCOUNT_BLOCKED') {
      throw ApiException(
          map['message']?.toString() ?? 'This account has been blocked.');
    }
    if (resp.statusCode != 200) {
      throw ApiException(map['error']?.toString() ??
          map['message']?.toString() ??
          'Google sign-in could not be completed.');
    }
    final token = map['token']?.toString();
    if (token == null || token.isEmpty) {
      throw ApiException('Google sign-in returned no session.');
    }
    return GoogleSignInResult(
      token: token,
      email: map['email']?.toString() ?? '',
      firstName: map['firstName']?.toString() ?? '',
      lastName: map['lastName']?.toString() ?? '',
      profileImageUrl: map['profileImageUrl']?.toString() ?? '',
    );
  }

  /// POST `/api/v1/oauth2/google/mobile` — swaps a Google ID token for a
  /// platform session. The backend verifies the token's signature, issuer and
  /// audience before trusting it.
  Future<GoogleSignInResult> signInWithGoogleIdToken(String idToken) async {
    final resp = await _client.post(
      _uri('/api/v1/oauth2/google/mobile'),
      headers: {..._headers, 'Content-Type': 'application/json'},
      body: jsonEncode({'idToken': idToken}),
    );
    final body =
        resp.body.isEmpty ? const <String, dynamic>{} : jsonDecode(resp.body);
    final map =
        body is Map ? body.cast<String, dynamic>() : const <String, dynamic>{};
    if (resp.statusCode != 200) {
      throw ApiException(map['message']?.toString() ??
          map['error']?.toString() ??
          'Google sign-in could not be completed.');
    }
    final token = map['token']?.toString();
    if (token == null || token.isEmpty) {
      throw ApiException('Google sign-in returned no session.');
    }
    return GoogleSignInResult(
      token: token,
      email: map['email']?.toString() ?? '',
      firstName: map['firstName']?.toString() ?? '',
      lastName: map['lastName']?.toString() ?? '',
      profileImageUrl: map['profileImageUrl']?.toString() ?? '',
    );
  }

  /// POST `/api/v1/oauth2/apple/mobile` — exchanges Apple's signed identity
  /// token for the same GloboExpats session used by every other login path.
  Future<AppleSignInResult> signInWithApple({
    required String identityToken,
    required String authorizationCode,
    required String rawNonce,
    String? email,
    String? firstName,
    String? lastName,
  }) async {
    final resp = await _client.post(
      _uri('/api/v1/oauth2/apple/mobile'),
      headers: {..._headers, 'Content-Type': 'application/json'},
      body: jsonEncode({
        'identityToken': identityToken,
        'authorizationCode': authorizationCode,
        'rawNonce': rawNonce,
        if (email != null && email.isNotEmpty) 'email': email,
        if (firstName != null && firstName.isNotEmpty) 'firstName': firstName,
        if (lastName != null && lastName.isNotEmpty) 'lastName': lastName,
      }),
    );
    final body =
        resp.body.isEmpty ? const <String, dynamic>{} : jsonDecode(resp.body);
    final map =
        body is Map ? body.cast<String, dynamic>() : const <String, dynamic>{};
    if (resp.statusCode != 200) {
      throw ApiException(map['message']?.toString() ??
          map['error']?.toString() ??
          'Sign in with Apple could not be completed.');
    }
    final token = map['token']?.toString();
    final resultEmail = map['email']?.toString();
    if (token == null ||
        token.isEmpty ||
        resultEmail == null ||
        resultEmail.isEmpty) {
      throw ApiException('Apple sign-in returned an incomplete session.');
    }
    return AppleSignInResult(token: token, email: resultEmail);
  }
}

class ApiException implements Exception {
  final String message;

  /// True when the failure was an HTTP 401 from an authenticated endpoint —
  /// the session token is dead and the app must drop it (AuthStore
  /// .handleUnauthorized) instead of silently acting authenticated.
  final bool unauthorized;
  ApiException(this.message, {this.unauthorized = false});
  @override
  String toString() => 'ApiException: $message';
}

/// Outcome of an OTP verification call (`verify-signup-otp`,
/// `userManagement/verify-otp`).
///
/// [verified] is decided from the response BODY message — web
/// `isSignupOtpVerified` defense-in-depth — because the reset-password verify
/// endpoint answers a WRONG code with HTTP 200 + "Wrong OTP", so the status
/// code alone can never prove success. [message] carries the raw backend text
/// for display ("Wrong OTP", "OTP has expired", "User not found").
class OtpResult {
  final bool verified;
  final String message;
  final int statusCode;
  const OtpResult({
    required this.verified,
    required this.message,
    required this.statusCode,
  });
}

/// What `/oauth2/exchange` hands back: a platform session plus the profile
/// Google supplied, so a first-time Google user lands with a name and picture.
class GoogleSignInResult {
  final String token;
  final String email;
  final String firstName;
  final String lastName;
  final String profileImageUrl;
  const GoogleSignInResult({
    required this.token,
    required this.email,
    this.firstName = '',
    this.lastName = '',
    this.profileImageUrl = '',
  });
}

class AppleSignInResult {
  const AppleSignInResult({required this.token, required this.email});

  final String token;
  final String email;
}

/// Page-shaped request-board response — web parity `RequestBoardPage`
/// (request-board-types.ts:146). Parsed defensively: content may arrive as
/// `content`, `data.content`, `data`, or a bare list depending on the backend
/// era, and `totalPages` is derived from totalElements/size when absent.
class RequestBoardPageData {
  final List<Map<String, dynamic>> content;
  final int totalElements;
  final int totalPages;
  final int page;
  final int size;
  final bool first;
  final bool last;

  const RequestBoardPageData({
    this.content = const [],
    this.totalElements = 0,
    this.totalPages = 1,
    this.page = 0,
    this.size = 20,
    this.first = true,
    this.last = true,
  });

  factory RequestBoardPageData.fromJson(dynamic raw,
      {int fallbackPage = 0, int fallbackSize = 20}) {
    var list = <dynamic>[];
    var totalElements = 0;
    var totalPages = 1;
    var page = fallbackPage;
    var size = fallbackSize;
    var first = true;
    var last = true;
    if (raw is List) {
      list = raw;
      totalElements = raw.length;
      last = true;
    } else if (raw is Map) {
      final contentRaw = raw['content'] ??
          (raw['data'] is Map ? (raw['data'] as Map)['content'] : null) ??
          raw['data'];
      if (contentRaw is List) list = contentRaw;
      totalElements = raw['totalElements'] is num
          ? (raw['totalElements'] as num).toInt()
          : list.length;
      if (raw['totalPages'] is num) {
        totalPages = (raw['totalPages'] as num).toInt();
      } else {
        totalPages = size <= 0 ? 1 : (totalElements / size).ceil();
        if (totalPages < 1) totalPages = 1;
      }
      page =
          raw['number'] is num ? (raw['number'] as num).toInt() : fallbackPage;
      size = raw['size'] is num ? (raw['size'] as num).toInt() : fallbackSize;
      first = raw['first'] is bool ? raw['first'] as bool : page == 0;
      last = raw['last'] is bool ? raw['last'] as bool : false;
    }
    return RequestBoardPageData(
      content: list.whereType<Map<String, dynamic>>().toList(),
      totalElements: totalElements,
      totalPages: totalPages,
      page: page,
      size: size,
      first: first,
      last: last,
    );
  }
}
