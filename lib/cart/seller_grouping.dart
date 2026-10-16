import 'cart_store.dart' show CartItem;

/// One seller's slice of the cart (web parity `groupCartItemsBySeller` in
/// `lib/cart-grouping.ts`): delivery is quoted and charged ONCE per seller
/// group, never per item.
class SellerGroup {
  /// Stable grouping key (seller id, falling back to name, then 'unknown').
  final String sellerKey;
  final String? sellerId;
  final String sellerName;
  final String? location;
  final bool isVerified;
  final List<CartItem> items;
  const SellerGroup({
    required this.sellerKey,
    this.sellerId,
    required this.sellerName,
    this.location,
    this.isVerified = false,
    required this.items,
  });

  double get subtotal =>
      items.fold(0, (s, i) => s + i.price * (i.quantity < 1 ? 1 : i.quantity));
}

/// Group SELECTED cart lines by seller. Cart lines carry `sellerId`
/// (`expatId` on the web) with a name fallback — exactly the web's key
/// `String(item.expatId || item.expatName || 'unknown')`. Delivery is quoted
/// once per returned group at checkout.
List<SellerGroup> groupCartItemsBySeller(
  Iterable<CartItem> items, {
  String Function(CartItem)? sellerIdOf,
  String Function(CartItem)? sellerNameOf,
}) {
  final buckets = <String, SellerGroup>{};
  for (final item in items) {
    final id = sellerIdOf?.call(item) ?? item.sellerId;
    final name = sellerNameOf?.call(item) ?? item.sellerName;
    final key = _groupKey(id, name);
    final group = buckets.putIfAbsent(
      key,
      () => SellerGroup(
        sellerKey: key,
        sellerId: id,
        sellerName: name ?? 'Seller',
        location: item.location,
        isVerified: item.isVerified,
        items: [],
      ),
    );
    group.items.add(item);
  }
  return buckets.values.toList();
}

/// Web parity: numeric-id first, else the display name, else 'unknown'.
String _groupKey(String? sellerId, String? sellerName) {
  if (sellerId != null && sellerId.isNotEmpty && sellerId != 'null') return sellerId;
  if (sellerName != null && sellerName.isNotEmpty) return sellerName;
  return 'unknown';
}
