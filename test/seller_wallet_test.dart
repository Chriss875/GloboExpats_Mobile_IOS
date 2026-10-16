import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/domain/seller_wallet.dart';
import 'package:globoexpats_mobile/screens/delivery_dashboard_screens.dart';
import 'package:globoexpats_mobile/screens/seller_wallet_panel.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker/image_picker.dart';

/// Web parity `components/dashboard/seller-virtual-wallet.tsx` +
/// `lib/seller-wallet.ts` after the 2026-10-02/03 wallet update: the wallet
/// comes from `GET /api/v1/seller/wallet`, each payout shows one breakdown
/// (items sold, delivery fee, GloboExpats fee), and a settled payout carries
/// GloboExpats' transfer proof. The seller's Payments tab now lives here.
Map<String, dynamic> _wallet({bool configured = true}) => {
      'payoutDetailsConfigured': configured,
      'summary': {
        'currency': 'TZS',
        'unsettledTotal': 50000,
        'unsettledCount': 1,
        'settledTotal': 80000,
        'settledCount': 1,
        'total': 130000,
        'totalCount': 2,
      },
      'rows': [
        {
          'orderId': 'e53381fb-04d7-458c-8c4a-19f188ab5745',
          'orderNumber': 'ORD-2026-000042',
          'buyerName': 'Kai Maembe',
          'itemsSummary': 'Chair',
          'currency': 'TZS',
          'paymentMethod': 'MOBILE_MONEY',
          'buyerPaid': 104000,
          'deliveryFee': 4000,
          'platformFee': 20000,
          'sellerPayout': 80000,
          'withheldAmount': 0,
          'status': 'SETTLED',
          'delivered': true,
          'checkoutAt': '2026-09-18T09:00:00Z',
          'reasons': <String>[],
          'adminNote': 'Sent to your M-Pesa',
          'documents': <Object>[],
          'transferProofs': [
            {
              'documentId': 'tp-1',
              'receiptId': 'tp-1',
              'fileName': 'transfer.png',
              'contentType': 'image/png',
              'fileUrl': '/api/v1/seller/wallet/proofs/tp-1/file',
              'uploadedAt': '2026-09-20T10:00:00Z',
            }
          ],
          'canUploadDocument': true,
        },
        {
          'orderId': 'b1c2d3e4-0000-0000-0000-00000000wait',
          'buyerName': 'Ana Moyo',
          'itemsSummary': 'Lamp',
          'currency': 'TZS',
          'paymentMethod': 'SELCOM_APP',
          'buyerPaid': 60000,
          'deliveryFee': 0,
          'platformFee': 10000,
          'sellerPayout': 50000,
          'status': 'UNSETTLED',
          'delivered': false,
          'checkoutAt': '2026-09-17T09:00:00Z',
          'reasons': ['Waiting for the order to be delivered'],
          'documents': <Object>[],
          'transferProofs': <Object>[],
          'canUploadDocument': false,
        },
      ],
    };

/// A 1×1 transparent PNG.
final _png = base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');

void main() {
  group('the wallet model', () {
    test('reads the backend wallet and keeps its figures as sent', () {
      final w = SellerWallet.fromJson(_wallet());
      expect(w.summary.total, 130000);
      final row = w.rows.first;
      expect(row.settled, isTrue);
      expect(row.sellerPayout, 80000);
      expect(row.itemsSold, 100000, reason: 'buyer paid minus delivery');
      expect(row.transferProofs.single.fileName, 'transfer.png');
    });

    test('the order id is the short canonical one, like order details', () {
      final row = SellerWallet.fromJson(_wallet()).rows.first;
      expect(walletOrderLabel(row), '#88AB5745',
          reason: 'never the ORD- number (web 6bea586)');
    });

    test('money reads like the web, in the payout currency', () {
      expect(formatWalletMoney(184000.4), 'TZS 184,000');
      expect(walletPaymentMethodLabel('SELCOM_APP'), 'Selcom App');
      expect(walletPaymentMethodLabel(null), '—');
    });

    test('filters by status and searches order, item or buyer', () {
      final rows = sortWalletRows(SellerWallet.fromJson(_wallet()).rows);
      expect(rows.first.buyerName, 'Kai Maembe', reason: 'newest first');
      expect(
          filterWalletRows(rows, WalletSettlement.unsettled, ''), hasLength(1));
      expect(filterWalletRows(rows, null, 'lamp').single.buyerName, 'Ana Moyo');
    });
  });

  group('the Virtual wallet tab', () {
    http.Response json(Object body) => http.Response(jsonEncode(body), 200,
        headers: {'content-type': 'application/json'});

    Future<List<http.Request>> pump(WidgetTester tester,
        {bool configured = true, bool viaDashboard = false}) async {
      tester.view.physicalSize = const Size(430, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final requests = <http.Request>[];
      final api = ApiClient(client: MockClient((req) async {
        requests.add(req);
        final p = req.url.path;
        if (p == '/api/v1/seller/wallet') {
          return json(_wallet(configured: configured));
        }
        if (p.endsWith('/file')) {
          return http.Response.bytes(_png, 200,
              headers: {'content-type': 'image/png'});
        }
        if (p.endsWith('/seller-document')) return json({'documentId': 'd-1'});
        if (p.endsWith('/user-details')) {
          return json({
            'userId': 7,
            'isVerified': true,
            'roles': [
              {'roleName': 'SELLER'}
            ],
            'products': <Object>[],
          });
        }
        return json({});
      }));
      AuthStore.instance =
          AuthStore(api: api, initialToken: 'jwt', initialEmail: 'a@b.com');
      addTearDown(() => AuthStore.instance = null);
      await tester.pumpWidget(MaterialApp(
          home: viaDashboard
              ? ExpatDashboardScreen(
                  api: api, initialTab: 'selling', initialSub: 'payments')
              : Scaffold(
                  body: SellerWalletPanel(
                    api: api,
                    pickReceipt: () async => XFile.fromData(_png,
                        name: 'efd receipt.jpg', mimeType: 'image/jpeg'),
                  ),
                )));
      await tester.pumpAndSettle();
      return requests;
    }

    testWidgets('totals, breakdown, reasons and the note read like the web',
        (tester) async {
      await pump(tester);
      expect(find.text('TZS 130,000'), findsOneWidget);
      expect(find.text('Total earnings'), findsOneWidget);
      expect(find.text('Items sold: TZS 100,000'), findsOneWidget);
      expect(find.text('Delivery fee: TZS 4,000'), findsOneWidget);
      expect(find.text('GloboExpats fee: TZS 20,000'), findsOneWidget);
      expect(
          find.text('Waiting for the order to be delivered'), findsOneWidget);
      expect(find.textContaining('Sent to your M-Pesa', findRichText: true),
          findsOneWidget);
      expect(find.text('#88AB5745'), findsOneWidget);
      expect(find.text('After settlement'), findsOneWidget,
          reason: 'the unsettled payout has no proof yet');
      expect(find.text('After delivery'), findsOneWidget);
    });

    testWidgets('a settled payout opens the transfer proof, signed in',
        (tester) async {
      final requests = await pump(tester);
      await tester.tap(find.byKey(const ValueKey(
          'wallet-proof-view-e53381fb-04d7-458c-8c4a-19f188ab5745')));
      await tester.pumpAndSettle();
      expect(find.text('Payment transfer proof'), findsOneWidget);
      final fileRead =
          requests.firstWhere((r) => r.url.path.endsWith('/file'));
      expect(fileRead.headers['Authorization'], 'Bearer jwt',
          reason: 'proofs are private: fetched with the session');
    });

    testWidgets('the EFD receipt uploads against the order', (tester) async {
      final requests = await pump(tester);
      await tester.tap(find.byKey(const ValueKey(
          'wallet-receipt-upload-e53381fb-04d7-458c-8c4a-19f188ab5745')));
      await tester.pumpAndSettle();
      expect(
          requests.any((r) =>
              r.url.path ==
              '/api/v1/payments/received/e53381fb-04d7-458c-8c4a-19f188ab5745/seller-document'),
          isTrue);
      expect(find.text('EFD receipt uploaded'), findsOneWidget);
    });

    testWidgets('missing payout details are asked for', (tester) async {
      await pump(tester, configured: false);
      expect(find.byKey(const ValueKey('wallet-payout-details-banner')),
          findsOneWidget);
    });

    testWidgets('filters narrow the list', (tester) async {
      await pump(tester);
      await tester.tap(find.byKey(const ValueKey('wallet-filter-settled')));
      await tester.pumpAndSettle();
      expect(find.text('Chair'), findsOneWidget);
      expect(find.text('Lamp'), findsNothing);
    });

    testWidgets('an old Payments link lands on the wallet', (tester) async {
      await pump(tester, viaDashboard: true);
      expect(find.text('TZS 130,000'), findsOneWidget);
      expect(find.text('Payments'), findsNothing,
          reason: 'the separate seller Payments tab was merged away');
    });
  });
}
