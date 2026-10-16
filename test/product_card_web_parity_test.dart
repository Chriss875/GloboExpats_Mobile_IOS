import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/cart/cart_store.dart';
import 'package:globoexpats_mobile/models/product.dart';
import 'package:globoexpats_mobile/widgets/app_image.dart';
import 'package:globoexpats_mobile/widgets/product_card.dart';
import 'package:globoexpats_mobile/screens/product_quick_add.dart';
import 'package:globoexpats_mobile/widgets/product_grid.dart';

void main() {
  testWidgets('buyer product card mirrors the web information hierarchy',
      (tester) async {
    CartStore.instance.clear();
    const product = Product(
      productId: 44,
      productName: 'Solid wood dining table',
      productAskingPrice: 480000,
      productOriginalPrice: 525000,
      productQuantity: 2,
      sellerName: 'Amina Mwinyi',
      sellerOrganization: 'Amina Home',
      sellerVerified: true,
      sellerType: 'BUSINESS',
      placeName: 'Mikocheni',
      categoryName: 'Home & Garden',
      averageRating: 4.8,
      totalRatingsCount: 19,
    );

    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(width: 180, height: 360, child: ProductCard(product)),
        ),
      ),
    ));

    expect(find.text('Solid wood dining table'), findsOneWidget);
    expect(find.text('Amina M.'), findsOneWidget);
    expect(find.text('Verified Shop'), findsOneWidget);
    expect(find.text('4.8'), findsOneWidget);
    expect(find.textContaining('(19)'), findsOneWidget);
    expect(find.text('Mikocheni'), findsOneWidget);
    // Web browse cards do not repeat the category chip in their body.
    expect(find.text('Home & Garden'), findsNothing);
    expect(find.text('TSh 480,000'), findsOneWidget);
    expect(find.byIcon(Icons.shopping_cart_outlined), findsOneWidget);
    expect(tester.takeException(), isNull);

    // The cart button used to drop the listing straight into the cart —
    // no options, no sign-in, no own-item check — which is how a card and
    // the product page came to sell the same listing two different ways.
    // It is now the shared purchase button; what it does on a tap is pinned
    // in card_quick_add_parity_test.dart.
    expect(find.byType(QuickAddCartButton), findsOneWidget);
  });

  testWidgets('list rows show the whole product, not a cropped centre',
      (tester) async {
    const product = Product(
      productId: 45,
      productName: 'Blue light blocking glasses',
      productAskingPrice: 53000,
      productImageUrls: ['https://cdn.example/glasses.webp'],
    );

    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: ProductListRows([product])),
    ));

    final image = tester.widget<AppImage>(find.byType(AppImage));
    expect(image.fit, BoxFit.contain,
        reason: 'the row thumbnail used BoxFit.cover, which fills its box by '
            'cropping — a wide product (glasses, a bicycle) lost both ends '
            'and read as falling outside its own frame. Web parity: the list '
            'thumbnail is object-contain on a neutral panel '
            '(components/ui/product-card.tsx:872).');
  });

  test('product parser carries real seller verification into cards', () {
    final product = Product.fromJson({
      'productId': 1,
      'productName': 'Desk',
      'productAskingPrice': 120000,
      'sellerVerificationStatus': 'NATURAL_VERIFIED',
      'sellerType': 'PERSONAL',
    });
    expect(product.sellerVerified, isTrue);
    expect(product.sellerType, 'PERSONAL');
  });
}
