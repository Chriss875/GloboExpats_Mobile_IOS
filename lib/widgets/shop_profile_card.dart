import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../config.dart';
import '../domain/seller_display.dart';
import '../models/product.dart' show Product;
import '../storage/kv_store.dart';
import '../theme.dart';
import 'app_image.dart';
import 'share_kit/share_cards.dart' show ShareCardItem, paintBrandMark;
import 'share_kit/share_sheets.dart';
import 'seller_verification_gate.dart' show isVerifiedAccountDetails;

/// The top of the Account tab: the signed-in user's public shop as buyers
/// see it — name, verified seal, listings, rating, member since — with the
/// way into the shop page and the Share Kit's shop pictures.
///
/// It paints at once: the last shop it showed is kept on the phone (per
/// account, [cacheKey]) and refreshed quietly in the background, and with a
/// remembered user id the three lookups run side by side instead of one
/// after another. A first-ever open shows the card's outline, not a gap.
class ShopProfileCard extends StatefulWidget {
  const ShopProfileCard(
      {super.key, required this.api, required this.token, this.cacheKey});
  final ApiClient api;
  final String token;

  /// Usually the account email; null keeps nothing on the phone.
  final String? cacheKey;

  @override
  State<ShopProfileCard> createState() => _ShopProfileCardState();
}

class _ShopProfileCardState extends State<ShopProfileCard> {
  int? _userId;
  String _fullName = '';
  String? _photo;
  bool _verified = false;
  double _rating = 0;
  int _reviews = 0;
  String? _location;
  String? _memberSince;
  int? _listingCount;
  List<_Listing> _latest = const [];

  /// The account lookup failed and nothing was remembered: hide the card.
  bool _failed = false;

  String? get _storeKey =>
      widget.cacheKey == null || widget.cacheKey!.isEmpty
          ? null
          : 'shop_profile_card:v1:${widget.cacheKey}';

  @override
  void initState() {
    super.initState();
    _restore();
    _load();
  }

  void _restore() {
    final key = _storeKey;
    if (key == null) return;
    final j = KvStore.instance.getJson(key);
    if (j == null) return;
    _userId = (j['userId'] as num?)?.toInt();
    _fullName = (j['fullName'] ?? '').toString();
    _photo = j['photo'] as String?;
    _verified = j['verified'] == true;
    _rating = (j['rating'] as num?)?.toDouble() ?? 0;
    _reviews = (j['reviews'] as num?)?.toInt() ?? 0;
    _location = j['location'] as String?;
    _memberSince = j['memberSince'] as String?;
    _listingCount = (j['listingCount'] as num?)?.toInt();
    _latest = [
      for (final l in (j['latest'] as List? ?? const []))
        if (l is Map) _Listing.fromJson(l.cast<String, dynamic>()),
    ];
  }

  void _persist() {
    final key = _storeKey;
    if (key == null || _userId == null) return;
    KvStore.instance.setJson(key, {
      'userId': _userId,
      'fullName': _fullName,
      'photo': _photo,
      'verified': _verified,
      'rating': _rating,
      'reviews': _reviews,
      'location': _location,
      'memberSince': _memberSince,
      'listingCount': _listingCount,
      'latest': [for (final l in _latest) l.toJson()],
    });
  }

  Future<void> _load() async {
    // A remembered id starts the shop lookups alongside the account one.
    final known = _userId;
    final early = known == null
        ? null
        : Future.wait([_loadSummary(known), _loadListings(known)]);
    try {
      final me = await widget.api.getUserDetails(widget.token);
      final raw = me['userId'] ?? me['id'];
      final id = raw is num ? raw.toInt() : int.tryParse('$raw');
      if (!mounted) return;
      if (id == null) throw StateError('no user id');
      final photo = (me['profileImageUrl'] ?? '').toString().trim();
      setState(() {
        _userId = id;
        _fullName = [me['firstName'], me['lastName']]
            .map((p) => (p ?? '').toString().trim())
            .where((p) => p.isNotEmpty)
            .join(' ');
        _photo = photo.isEmpty ? null : AppConfig.resolveAssetUrl(photo);
        _verified = isVerifiedAccountDetails(me);
      });
      await (id == known
          ? early!
          : Future.wait([_loadSummary(id), _loadListings(id)]));
      if (mounted) _persist();
    } catch (_) {
      // No profile, no card: the rest of the Account tab still works.
      if (mounted && _userId == null) setState(() => _failed = true);
    }
  }

  Future<void> _loadSummary(int id) async {
    try {
      final s = await widget.api.fetchSellerSummary(id);
      if (!mounted) return;
      String? location;
      for (final key in const ['location', 'placeName']) {
        final v = s[key]?.toString().trim() ?? '';
        if (v.isNotEmpty && v != 'null') {
          location = v;
          break;
        }
      }
      final joined = s['joinedDate'] ?? s['createdAt'];
      setState(() {
        _rating = (s['averageRating'] as num?)?.toDouble() ?? 0;
        _reviews = (s['totalRatingsCount'] as num?)?.toInt() ?? 0;
        _location = location;
        _memberSince = joined == null ? null : memberSinceYear(joined);
      });
    } catch (_) {}
  }

  Future<void> _loadListings(int id) async {
    try {
      final res =
          await widget.api.fetchFiltered(sellerId: id, page: 0, size: 12);
      if (!mounted) return;
      setState(() {
        _listingCount = res.totalElements;
        _latest = [
          for (final p in res.products)
            if ((p.primaryImageUrl ?? '').isNotEmpty)
              _Listing(p.primaryImageUrl!, p.productAskingPrice,
                  p.productCurrency),
        ].take(6).toList();
      });
    } catch (_) {}
  }

  String get _publicName => publicSellerName(_fullName, fallback: 'Your shop');
  String get _path => buildSellerProfilePath(_fullName, _userId);
  bool get _hasRating => _rating > 0 && _reviews > 0;

  void _share() {
    final id = _userId;
    if (id == null) return;
    showSellerShareSheet(
      context,
      sellerName: _publicName,
      profilePath: _path,
      profileImageUrl: _photo,
      sharerId: id,
      kit: SellerShareKitDetails(
        sellerId: id,
        verified: _verified,
        city: _location,
        statsText: _hasRating
            ? '★ ${_rating.toStringAsFixed(1)} · $_reviews reviews'
            : null,
        listings: [
          for (final l in _latest)
            ShareCardItem(
              imageUrl: AppConfig.resolveAssetUrl(l.image),
              price: Product.formatPrice(l.price, l.currency),
            ),
        ],
        listingCount: _listingCount,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) return const SizedBox.shrink();
    // Until the first answer (and with nothing remembered) the card shows
    // its outline: no jump when it fills in, and the buttons wait.
    final ready = _userId != null;
    final palette = AppPalette.of(context);
    final count = _listingCount;
    return Column(
      key: const ValueKey('account-shop-profile'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
          child: Text('SHOP PROFILE',
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                  color: palette.textSecondary)),
        ),
        Container(
          decoration: BoxDecoration(
            color: palette.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: palette.border),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x1A172554),
                  blurRadius: 18,
                  offset: Offset(0, 6)),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // The storefront: brand blue, the shop's identity and numbers.
              Material(
                color: const Color(0x00000000),
                child: Ink(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        AppColors.brandBlue,
                        AppColors.heroBlue700,
                        AppColors.heroBlue600,
                      ],
                    ),
                  ),
                  child: InkWell(
                    onTap: ready ? () => context.push(_path) : null,
                    child: Stack(children: [
                      // The GE mark as a quiet watermark in the corner.
                      Positioned(
                        right: -22,
                        bottom: -30,
                        child: Opacity(
                          opacity: 0.09,
                          child: ColorFiltered(
                            colorFilter: const ColorFilter.mode(
                                BrandStage.ink, BlendMode.srcIn),
                            child: CustomPaint(
                              size: const Size(176, 110),
                              painter: _MarkPainter(),
                            ),
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 16, 12, 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(children: [
                              _ShopAvatar(
                                  name: ready ? _publicName : '',
                                  imageUrl: _photo),
                              const SizedBox(width: 14),
                              Expanded(child: _identity()),
                              const Icon(Icons.chevron_right_rounded,
                                  color: BrandStage.inkSoft),
                            ]),
                            const SizedBox(height: 16),
                            Row(children: [
                              _StatTile(
                                value: count == null ? '–' : '$count',
                                label: count == 1 ? 'Listing' : 'Listings',
                              ),
                              const SizedBox(width: 8),
                              _StatTile(
                                value: _hasRating
                                    ? _rating.toStringAsFixed(1)
                                    : (ready ? 'New' : '–'),
                                icon: _hasRating ? Icons.star_rounded : null,
                                label: _hasRating
                                    ? '$_reviews ${_reviews == 1 ? 'review' : 'reviews'}'
                                    : (ready ? 'No reviews yet' : 'Rating'),
                              ),
                              const SizedBox(width: 8),
                              _StatTile(
                                value: _memberSince ?? '–',
                                label: 'Member since',
                              ),
                            ]),
                          ],
                        ),
                      ),
                    ]),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const ValueKey('account-shop-view'),
                      onPressed: ready ? () => context.push(_path) : null,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: palette.textPrimary,
                        side: BorderSide(color: palette.border),
                        minimumSize: const Size.fromHeight(46),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                      icon: const Icon(Icons.storefront_outlined, size: 18),
                      label: const Text('View shop',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      key: const ValueKey('account-shop-share'),
                      onPressed: ready ? _share : null,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brandBlue,
                        foregroundColor: BrandStage.ink,
                        minimumSize: const Size.fromHeight(46),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                      icon: const Icon(Icons.ios_share_rounded, size: 18),
                      label: const Text('Share shop',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                ]),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _identity() {
    if (_userId == null) {
      // Loading outline: two soft bars where the name and city will be.
      Widget bar(double w, double h) => Container(
            width: w,
            height: h,
            decoration: BoxDecoration(
              color: BrandStage.glass,
              borderRadius: BorderRadius.circular(6),
            ),
          );
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [bar(130, 18), const SizedBox(height: 9), bar(90, 12)],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(_publicName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
                fontFamily: 'Lexend',
                fontSize: 19,
                height: 1.2,
                fontWeight: FontWeight.w700,
                color: BrandStage.ink)),
        const SizedBox(height: 6),
        Row(children: [
          if (_verified) ...[
            Container(
              padding: const EdgeInsets.fromLTRB(6, 3, 8, 3),
              decoration: BoxDecoration(
                color: BrandStage.glass,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: BrandStage.glassLine),
              ),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.verified_rounded,
                    size: 13, color: Color(0xFF34D399)),
                SizedBox(width: 4),
                Text('Verified',
                    style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: BrandStage.ink)),
              ]),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Text(_location ?? 'Your shop on Globoexpats',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w500,
                    color: BrandStage.inkSoft)),
          ),
        ]),
      ],
    );
  }
}

/// A listing as the card remembers it: enough for the Share Kit's collage.
class _Listing {
  const _Listing(this.image, this.price, this.currency);
  final String image;
  final double price;
  final String currency;

  factory _Listing.fromJson(Map<String, dynamic> j) => _Listing(
        (j['image'] ?? '').toString(),
        (j['price'] as num?)?.toDouble() ?? 0,
        (j['currency'] ?? 'TZS').toString(),
      );

  Map<String, dynamic> toJson() =>
      {'image': image, 'price': price, 'currency': currency};
}

class _MarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 64, size.height / 40);
    paintBrandMark(canvas);
  }

  @override
  bool shouldRepaint(_MarkPainter oldDelegate) => false;
}

class _ShopAvatar extends StatelessWidget {
  const _ShopAvatar({required this.name, required this.imageUrl});
  final String name;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 62,
      height: 62,
      padding: const EdgeInsets.all(2.5),
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        color: BrandStage.ink,
        boxShadow: [
          BoxShadow(
              color: Color(0x33000000), blurRadius: 10, offset: Offset(0, 4)),
        ],
      ),
      // The photo is clipped to its own circle inside the white ring.
      child: ClipOval(
        child: imageUrl != null
            ? AppImage(imageUrl!, fit: BoxFit.cover)
            : DecoratedBox(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [AppColors.brandBlue, Color(0xFF60A5FA)],
                  ),
                ),
                child: Center(
                  child: Text(name.isEmpty ? '' : publicInitials(name, fallback: 'S'),
                      style: const TextStyle(
                          color: BrandStage.ink,
                          fontSize: 21,
                          fontWeight: FontWeight.w700)),
                ),
              ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.value, required this.label, this.icon});
  final String value;
  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
        decoration: BoxDecoration(
          color: BrandStage.glass,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: BrandStage.glassLine),
        ),
        child: Column(children: [
          Row(mainAxisSize: MainAxisSize.min, children: [
            if (icon != null) ...[
              Icon(icon, size: 16, color: const Color(0xFFFBBF24)),
              const SizedBox(width: 3),
            ],
            Text(value,
                style: const TextStyle(
                    fontSize: 17,
                    height: 1.1,
                    fontWeight: FontWeight.w800,
                    color: BrandStage.ink)),
          ]),
          const SizedBox(height: 3),
          Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: BrandStage.inkSoft)),
        ]),
      ),
    );
  }
}
