import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/domain/notification_feed.dart';

UserNotificationRow _row({
  int id = 1,
  String title = 'Notification',
  String message = '',
  String type = 'SYSTEM',
  String? referenceId,
  String? actionUrl,
  bool isRead = false,
}) =>
    UserNotificationRow.fromJson({
      'notificationId': id,
      'title': title,
      'message': message,
      'notificationType': type,
      if (referenceId != null) 'referenceId': referenceId,
      if (actionUrl != null) 'actionUrl': actionUrl,
      'isRead': isRead,
    })!;

void main() {
  group('normalization tolerates every shape the backend has used', () {
    test('id, type and read flag fall through their aliases', () {
      final n = UserNotificationRow.fromJson({
        'id': 7,
        'title': 'T',
        'message': 'm',
        'type': 'order_update',
        'read': true,
      })!;
      expect(n.id, 7);
      expect(n.notificationType, 'ORDER_UPDATE');
      expect(n.isRead, isTrue);
    });

    test('a row with no usable id is dropped, not crashed on', () {
      expect(UserNotificationRow.fromJson({'title': 'x'}), isNull);
    });

    test('a missing timestamp yields null instead of throwing', () {
      // TimeUtils.parseBackendTimestamp throws on null - one dateless row
      // must not take down the whole feed.
      final n = UserNotificationRow.fromJson(
          {'notificationId': 1, 'title': 'T', 'message': 'm'})!;
      expect(n.createdAt, isNull);
    });

    test('a Jackson array timestamp is understood', () {
      final n = UserNotificationRow.fromJson({
        'notificationId': 1,
        'title': 'T',
        'message': 'm',
        'createdAt': [2026, 3, 1, 9, 30, 0],
      })!;
      expect(n.createdAt!.year, 2026);
      expect(n.createdAt!.month, 3);
    });

    test('the feed payload is read from any of the four envelopes', () {
      final one = {'notificationId': 1};
      expect(extractNotificationContent([one]), hasLength(1));
      expect(
          extractNotificationContent({
            'content': [one]
          }),
          hasLength(1));
      expect(
          extractNotificationContent({
            'data': [one]
          }),
          hasLength(1));
      expect(
          extractNotificationContent({
            'data': {
              'content': [one]
            }
          }),
          hasLength(1));
      expect(extractNotificationContent('nonsense'), isEmpty);
    });
  });

  group('action urls are safe', () {
    test('only rooted same-origin paths survive', () {
      expect(safeNotificationActionUrl('/orders/5'), '/orders/5');
      expect(safeNotificationActionUrl('//evil.com'), isNull);
      expect(safeNotificationActionUrl('https://evil.com'), isNull);
      expect(safeNotificationActionUrl(42), isNull);
    });
  });

  group('tab scoping', () {
    test('a new order is a selling concern', () {
      expect(
          notificationMatchesTab(
              _row(type: 'NEW_ORDER'), NotificationTab.selling),
          isTrue);
      expect(
          notificationMatchesTab(
              _row(type: 'NEW_ORDER'), NotificationTab.buying),
          isFalse);
    });

    test('a generic order update stays visible in BOTH role tabs', () {
      final n = _row(type: 'ORDER_UPDATE');
      expect(notificationMatchesTab(n, NotificationTab.buying), isTrue);
      expect(notificationMatchesTab(n, NotificationTab.selling), isTrue);
    });

    test('request rows only appear under requests', () {
      final n = _row(type: 'REQUEST_NUDGE');
      expect(notificationMatchesTab(n, NotificationTab.requests), isTrue);
      expect(notificationMatchesTab(n, NotificationTab.buying), isFalse);
    });

    test('a _SELLING/_BUYING suffix wins outright', () {
      expect(
          notificationMatchesTab(
              _row(type: 'RATING_REQUIRED_SELLING'), NotificationTab.selling),
          isTrue);
      expect(
          notificationMatchesTab(
              _row(type: 'RATING_REQUIRED_BUYING'), NotificationTab.buying),
          isTrue);
    });

    test('everything shows under All', () {
      expect(
          notificationMatchesTab(_row(type: 'ANYTHING'), NotificationTab.all),
          isTrue);
    });
  });

  group('action filter', () {
    test('confirming receipt outranks the rating it previews', () {
      final n = _row(title: 'Confirm receipt', message: 'Then rate the seller');
      expect(notificationActionFilter(n), NotificationActionFilter.receipt);
    });

    test('a rating request is a rating', () {
      expect(notificationActionFilter(_row(title: 'Rate seller')),
          NotificationActionFilter.rating);
    });

    test('payouts and refunds are payment', () {
      expect(notificationActionFilter(_row(title: 'Payout sent')),
          NotificationActionFilter.payment);
    });

    test('logistics wording is fulfillment', () {
      expect(notificationActionFilter(_row(title: 'Delivery scheduled')),
          NotificationActionFilter.fulfillment);
    });
  });

  group('active feed hiding', () {
    test('a READ informational payment row drops out', () {
      final n = _row(type: 'PAYMENT_VERIFIED', isRead: true);
      expect(shouldShowNotificationInActiveFeed(n), isFalse);
    });

    test('the same row stays while unread', () {
      final n = _row(type: 'PAYMENT_VERIFIED');
      expect(shouldShowNotificationInActiveFeed(n), isTrue);
    });

    test('a read actionable row still shows', () {
      final n =
          _row(type: 'ORDER_UPDATE', title: 'Confirm receipt', isRead: true);
      expect(shouldShowNotificationInActiveFeed(n), isTrue);
    });
  });

  group('deep links use mobile routes', () {
    test('an order row opens that order, not an unfiltered dashboard', () {
      final n =
          _row(type: 'ORDER_UPDATE', title: 'Delivered', referenceId: '42');
      expect(notificationActionUrl(n), '/orders/42');
    });

    test('a logistics row opens the listing editor', () {
      final n =
          _row(type: 'PRODUCT_LOGISTICS_UPDATE_REQUIRED', referenceId: '9');
      expect(notificationActionUrl(n), '/edit-listing/9');
    });

    test('a buying payment row opens the payments screen', () {
      // "receipt" in the text would make this a RECEIPT row, not a payment
      // one - the filter order is deliberate, so use real payment wording.
      final n = _row(type: 'PAYMENT', title: 'Refund processed');
      expect(notificationActionFilter(n), NotificationActionFilter.payment);
      expect(
          notificationActionUrl(n), '/expat/dashboard?tab=buying&sub=payments');
    });

    test('a selling payout row goes to the seller dashboard instead', () {
      final n = _row(type: 'PAYMENT', title: 'Payout sent');
      expect(notificationActionUrl(n),
          '/expat/dashboard?tab=selling&sub=payments');
    });

    test('an informational or cancelled row is not tappable', () {
      expect(notificationActionUrl(_row(type: 'PAYMENT_VERIFIED')), isNull);
      expect(
          notificationActionUrl(_row(
              type: 'ORDER_UPDATE',
              title: 'Order cancelled',
              referenceId: '1')),
          isNull);
    });

    test('an unrecognised row falls back to its own safe actionUrl', () {
      final n = _row(type: 'SYSTEM', title: 'Hello', actionUrl: '/help');
      expect(notificationActionUrl(n), '/help');
    });
  });

  test('the driver-assignment message is rewritten, not shown raw', () {
    final n = _row(
        title: 'Seller confirmed your delivery',
        message: 'We are assigning a driver and will send your code');
    expect(n.message, contains('send your delivery code'));
  });

  test('visual kinds drive the row styling', () {
    expect(
        notificationVisualKind(_row(type: 'PRODUCT_LOGISTICS_UPDATE_REQUIRED')),
        NotificationVisualKind.logistics);
    expect(notificationVisualKind(_row(title: 'Rate seller')),
        NotificationVisualKind.rating);
    expect(notificationVisualKind(_row(title: 'Hello')),
        NotificationVisualKind.normal);
  });

  // The below-the-topbar strip is not derived from these rows at all — see
  // `domain/pending_actions.dart`. `test/pending_action_banner_test.dart`
  // covers what it shows and when it clears.
}
