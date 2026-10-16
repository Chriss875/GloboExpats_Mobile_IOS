import 'package:flutter_test/flutter_test.dart';

import 'package:globoexpats_mobile/domain/pending_actions.dart';
import 'package:globoexpats_mobile/models/order.dart';

Order _o(Map<String, dynamic> j) => Order.fromJson(Map<String, dynamic>.from(j));

void main() {
  test('AU-058: buyer AWAITING_PAYMENT without escrow → Pay now', () {
    final a = getOrderNotificationAction(_o({
      'orderId': 'o1', 'orderNumber': 'ORD-1', 'status': 'AWAITING_PAYMENT',
      'orderType': 'buying', 'escrowPending': false,
    }))!;
    expect(a.actionType, OrderActionType.paymentRequired);
    expect(a.actionLabel, 'Pay now');
    // escrowPending=true (money already submitted) suppresses the nudge.
    expect(
        getOrderNotificationAction(_o({
          'orderId': 'o2', 'status': 'AWAITING_PAYMENT',
          'orderType': 'buying', 'escrowPending': true,
        })),
        isNull);
  });

  test('AU-058: buyer lifecycle ladder — time/code/receipt/rating', () {
    expect(
        getOrderNotificationAction(_o({'orderId': 'x', 'status': 'AWAITING_BUYER_CONFIRMATION', 'orderType': 'buying'}))!.actionType,
        OrderActionType.confirmDeliveryTime);
    expect(
        getOrderNotificationAction(_o({'orderId': 'x', 'status': 'IN_TRANSIT', 'orderType': 'buying'}))!.actionType,
        OrderActionType.viewDeliveryCode);
    expect(
        getOrderNotificationAction(_o({'orderId': 'x', 'status': 'DELIVERED', 'orderType': 'buying'}))!.actionType,
        OrderActionType.confirmReceipt);
    // Completed + unrated → rate seller.
    expect(
        getOrderNotificationAction(_o({'orderId': 'x', 'status': 'COMPLETED', 'orderType': 'buying', 'buyerRated': false}))!.actionType,
        OrderActionType.rateSeller);
    // Completed + rated → nothing pending.
    expect(
        getOrderNotificationAction(_o({'orderId': 'x', 'status': 'COMPLETED', 'orderType': 'buying', 'buyerRated': true})),
        isNull);
  });

  test('AU-058: seller ladder — availability → mark paid → transporter/pickup → dispatch → verify', () {
    expect(
        getOrderNotificationAction(_o({'orderId': 'x', 'status': 'AWAITING_SELLER_CONFIRMATION', 'orderType': 'selling'}))!.actionType,
        OrderActionType.confirmAvailability);
    expect(
        getOrderNotificationAction(_o({'orderId': 'x', 'status': 'PENDING', 'orderType': 'selling'}))!.actionType,
        OrderActionType.markPaid);
    // SELLER_DELIVERY → arrange transport; pickup → confirm pickup.
    expect(
        getOrderNotificationAction(_o({'orderId': 'x', 'status': 'PAID', 'orderType': 'selling', 'fulfillmentType': 'SELLER_DELIVERY'}))!.actionType,
        OrderActionType.assignTransporter);
    expect(
        getOrderNotificationAction(_o({'orderId': 'x', 'status': 'PAID', 'orderType': 'selling', 'fulfillmentType': 'BUYER_PICKUP'}))!.actionType,
        OrderActionType.markPickedUp);
    expect(
        getOrderNotificationAction(_o({'orderId': 'x', 'status': 'READY_FOR_DISPATCH', 'orderType': 'selling', 'canDispatch': true}))!.actionType,
        OrderActionType.dispatchOrder);
    expect(
        getOrderNotificationAction(_o({'orderId': 'x', 'status': 'IN_TRANSIT', 'orderType': 'selling'}))!.actionType,
        OrderActionType.verifyDelivery);
  });

  test('AU-058: DISPATCH_TOO_EARLY suppresses the seller nudge (timing reason)', () {
    expect(
        getOrderNotificationAction(_o({
          'orderId': 'x', 'status': 'READY_FOR_DISPATCH', 'orderType': 'selling',
          'canDispatch': false, 'dispatchBlockedReason': 'DISPATCH_TOO_EARLY',
        })),
        isNull);
    // A fixable blocker still nudges, but routes to review delivery.
    final a = getOrderNotificationAction(_o({
      'orderId': 'x', 'status': 'READY_FOR_DISPATCH', 'orderType': 'selling',
      'canDispatch': false, 'dispatchBlockedReason': 'NO_TRANSPORTER_ASSIGNED',
    }))!;
    expect(a.actionType, OrderActionType.assignTransporter);
    expect(a.title, contains('needs attention'));
  });

  test('AU-059: no orderType → sellerId/buyerId match against currentUserId', () {
    // Seller views an order missing orderType but stamped with their id.
    final seller = getOrderNotificationAction(_o({
      'orderId': 'x', 'status': 'AWAITING_SELLER_CONFIRMATION',
      'sellerId': 42,
    }), currentUserId: '42')!;
    expect(seller.selling, isTrue);
    expect(seller.actionType, OrderActionType.confirmAvailability);

    // Buyer views an order missing orderType but stamped with their id.
    final buyer = getOrderNotificationAction(_o({
      'orderId': 'x', 'status': 'AWAITING_BUYER_CONFIRMATION',
      'buyerId': '7',
    }), currentUserId: '7')!;
    expect(buyer.selling, isFalse);
    expect(buyer.actionType, OrderActionType.confirmDeliveryTime);

    // A different viewer sees the same order as buying (reference default).
    final stranger = getOrderNotificationAction(_o({
      'orderId': 'x', 'status': 'AWAITING_SELLER_CONFIRMATION',
      'sellerId': 42, 'buyerId': 7,
    }), currentUserId: '999');
    // sellerId 42 != 999, buyerId 7 != 999 → default buying → the seller-side
    // status yields nothing for a buying viewer.
    expect(stranger, isNull);
  });

  test('AU-059: explicit orderType still beats the id fallback', () {
    final a = getOrderNotificationAction(_o({
      'orderId': 'x', 'status': 'AWAITING_SELLER_CONFIRMATION',
      'orderType': 'selling', 'buyerId': 7,
    }), currentUserId: '7')!;
    expect(a.selling, isTrue, reason: 'orderType wins over the id match');
    expect(a.actionType, OrderActionType.confirmAvailability);
  });

  test('AU-059: listType is honored as the explicit perspective alias', () {
    final a = getOrderNotificationAction(_o({
      'orderId': 'x', 'status': 'AWAITING_SELLER_CONFIRMATION',
      'listType': 'selling',
    }))!;
    expect(a.selling, isTrue);
    expect(a.actionType, OrderActionType.confirmAvailability);
  });

  test('listings hidden from buyers get one reminder that leads to fixing them',
      () {
    final store = PendingActionsStore.instance;
    store.replace(orders: const [], payments: const [], listings: [
      {'productId': 1, 'productStatus': 'PENDING', 'coordinatesSource': null,
       'transportModeSource': 'SELLER_SELECTED'},
      {'productId': 2, 'deliverySetupReady': false},
      {'productId': 3, 'coordinatesSource': 'PINNED',
       'transportModeSource': 'SELLER_SELECTED'},
      {'productId': 4, 'productStatus': 'ARCHIVED', 'deliverySetupReady': false},
    ]);
    final entry = store.entries.single;
    expect(entry.title, '2 listings are hidden from buyers');
    expect(entry.route, PendingActionsStore.listingsAttentionRoute);
    expect(entry.section, PendingActionSection.sellingOrders);

    store.replace(orders: const [], payments: const [], listings: [
      {'productId': 3, 'coordinatesSource': 'PINNED',
       'transportModeSource': 'SELLER_SELECTED'},
    ]);
    expect(store.entries, isEmpty, reason: 'fixed listings stop nagging');
  });
}
