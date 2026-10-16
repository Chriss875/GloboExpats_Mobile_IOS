import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/pending_actions.dart';
import 'package:globoexpats_mobile/models/order.dart';

/// The badge counts what is waiting on you, not just unread rows.
///
/// The web badge is `buyingPending + sellingPending + standalone unread + …`.
/// Mobile showed only `/notifications/unread-count`, which knows nothing about
/// an order needing your confirmation — so the badge under-reported exactly
/// the things it exists to surface.
///
/// These exercise the counts through [PendingActionsStore], the single
/// definition of "pending work". They used to go through a separate
/// `pendingOrderActionCount` helper that counted ratings as work and dropped
/// orders older than 30 days — neither of which the web's badge does — so the
/// two could disagree about the same order.
void main() {
  Order order(String status,
          {String type = 'buying', bool escrowPending = false, String? createdAt}) =>
      Order.fromJson({
        'orderId': 'o-$status-$type',
        'orderNumber': 'ORD-1',
        'status': status,
        'orderType': type,
        'escrowPending': escrowPending,
        'totalAmount': 1000,
        'currency': 'TZS',
        if (createdAt != null) 'createdAt': createdAt,
      });

  /// A fresh store per test — [PendingActionsStore.instance] is a singleton
  /// shared with the running app.
  PendingActionsStore storeWith(List<Order> orders, {String? currentUserId}) {
    final store = PendingActionsStore.instance;
    store.clear();
    store.replace(orders: orders, payments: const [], currentUserId: currentUserId);
    return store;
  }

  tearDown(() => PendingActionsStore.instance.clear());

  test('counts the orders that need the viewer to act', () {
    final store = storeWith([
      // Seller has to confirm the item is available.
      order('AWAITING_SELLER_CONFIRMATION', type: 'selling'),
      // Buyer has to confirm the proposed delivery time.
      order('AWAITING_BUYER_CONFIRMATION'),
    ]);
    expect(store.total, greaterThan(0),
        reason: 'orders waiting on the viewer must reach the badge');
    expect(store.sellingPending, 1);
    expect(store.buyingOrdersPending, 1);
  });

  test('an empty list counts nothing', () {
    expect(storeWith(const []).total, 0);
  });

  test('settled orders do not inflate the badge', () {
    // A finished order is not an action; if these counted, the bell would
    // never clear.
    final store = storeWith([order('COMPLETED'), order('CANCELLED')]);
    expect(store.total, 0);
  });

  test('a completed-but-unrated order is not badge work', () {
    // Web parity: ratings are deliberately excluded from "act now" — nothing
    // is blocked while they stay outstanding. `getOrderNotificationAction`
    // still reports the rating for the order's own screen.
    final store = storeWith([
      Order.fromJson({
        'orderId': 'r1',
        'status': 'COMPLETED',
        'orderType': 'buying',
        'buyerRated': false,
        'totalAmount': 1000,
        'currency': 'TZS',
      }),
    ]);
    expect(getOrderNotificationAction(Order.fromJson({
      'orderId': 'r1',
      'status': 'COMPLETED',
      'orderType': 'buying',
      'buyerRated': false,
      'totalAmount': 1000,
      'currency': 'TZS',
    }))?.actionType, OrderActionType.rateSeller);
    expect(store.total, 0, reason: 'a rating is not work that blocks anyone');
  });

  test('the count matches how many orders yield an action', () {
    final orders = [
      order('AWAITING_SELLER_CONFIRMATION', type: 'selling'),
      order('COMPLETED'),
      order('AWAITING_BUYER_CONFIRMATION'),
    ];
    final expected =
        orders.where((o) => getOrderNotificationAction(o) != null).length;
    expect(storeWith(orders).total, expected);
  });

  test('sellerId/buyerId fallback steers the badge for the viewer', () {
    final sellerOrder = Order.fromJson({
      'orderId': 's1',
      'status': 'AWAITING_SELLER_CONFIRMATION',
      'sellerId': 42,
      'totalAmount': 1000,
      'currency': 'TZS',
    });
    expect(storeWith([sellerOrder], currentUserId: '42').sellingPending, 1,
        reason: 'viewer is the seller → confirm availability');
    expect(storeWith([sellerOrder], currentUserId: '99').total, 0,
        reason: 'viewer is not the seller → buying view → null');
  });

  test('completing the action removes it from every count', () {
    // The behaviour the whole design exists for: the same order, one status
    // later, is no longer pending — nothing is dismissed by hand.
    final pending = storeWith([
      order('AWAITING_SELLER_CONFIRMATION', type: 'selling'),
    ]);
    expect(pending.total, 1);
    expect(pending.countForOrder('o-AWAITING_SELLER_CONFIRMATION-selling'), 1);

    final advanced = storeWith([
      order('PAID', type: 'selling', createdAt: '2026-09-01T00:00:00Z'),
    ]);
    // PAID still wants the seller to fulfil it, so it is still work — but the
    // original step is gone.
    expect(advanced.forOrder('o-AWAITING_SELLER_CONFIRMATION-selling'), isNull);

    final done = storeWith([order('COMPLETED', type: 'selling')]);
    expect(done.total, 0);
    expect(done.countForOrder('o-COMPLETED-selling'), 0);
  });
}
