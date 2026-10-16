import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../cart/saved_products_store.dart';
import '../models/product.dart';
import '../theme.dart';
import '../widgets/product_card.dart';
import '../widgets/skeleton_loader.dart';
import '../widgets/sign_in_prompt.dart';

/// AU-050: saved-items grid (web /expat/dashboard?tab=saved). Lists the
/// wishlist rows from GET /api/saved-products with unsave on each card and a
/// hide-blocks-entirely empty state (platform no-scaffolding rule).
class SavedItemsScreen extends StatefulWidget {
  const SavedItemsScreen({super.key, this.api, this.embedded = false});
  final ApiClient? api;

  /// See [SellerListingsScreen.embedded].
  final bool embedded;
  @override
  State<SavedItemsScreen> createState() => _SavedItemsScreenState();
}

class _SavedItemsScreenState extends State<SavedItemsScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();
  final SavedProductsStore _saved = SavedProductsStore.instance;
  List<Product> _items = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = AuthStore.instance?.token;
    if (token == null) {
      setState(() {
        _loading = false;
        _error = 'Log in to see your saved items.';
      });
      return;
    }
    setState(() => _loading = true);
    try {
      await _saved.load(AuthStore.instance!.email ?? '', token);
      final items = await _api.fetchSavedProducts(token);
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not load your saved items. Pull to retry.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar:
          widget.embedded ? null : AppBar(title: const Text('Saved items')),
      body: AuthStore.instance?.token == null
          ? const SingleChildScrollView(
              child: SignInPrompt(
                title: 'Keep your favourites close',
                message: 'Sign in to save items you love and find them again here.',
                returnUrl: '/account/saved',
                highlights: [
                  (Icons.favorite_border_rounded, 'Save listings with one tap'),
                  (Icons.bookmark_border_rounded, 'Come back to them any time'),
                  (Icons.shopping_cart_outlined, 'Move them to your cart'),
                ],
              ))
          : _loading
          ? const SkeletonPage()
          : RefreshIndicator(
              onRefresh: _load,
              child: _error != null
                  ? ListView(children: [
                      Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(_error!, style: TextStyle(color: AppPalette.of(context).textSecondary)),
                      ),
                    ])
                  // Unsaving now happens on the card's own heart button (web
                  // parity: the same wishlist toggle everywhere), so this
                  // screen just reacts to SavedProductsStore and drops a tile
                  // the instant its product is no longer saved.
                  : ListenableBuilder(
                      listenable: _saved,
                      builder: (context, _) {
                        final visible = _items
                            .where((p) => _saved.isSaved(p.productId))
                            .toList();
                        if (visible.isEmpty) {
                          // Web parity empty state: friendly card, Explore CTA.
                          return ListView(children: [
                            Padding(
                              padding: const EdgeInsets.all(32),
                              child: Column(children: [
                                Icon(Icons.favorite_border,
                                    size: 56, color: AppPalette.of(context).border),
                                const SizedBox(height: 12),
                                const Text('No Saved Items',
                                    style: TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.w700)),
                                const SizedBox(height: 6),
                                Text(
                                  'Items you save will appear here for quick access later.',
                                  textAlign: TextAlign.center,
                                  style:
                                      TextStyle(color: AppPalette.of(context).textSecondary),
                                ),
                                const SizedBox(height: 16),
                                FilledButton(
                                  onPressed: () => Navigator.of(context).pop(),
                                  style: FilledButton.styleFrom(
                                      backgroundColor: AppColors.brandBlue),
                                  child: const Text('Explore Products'),
                                ),
                              ]),
                            ),
                          ]);
                        }
                        return LayoutBuilder(
                            builder: (context, constraints) {
                          // Mirrors the delegate's own column maths so the
                          // cell can be sized to the card (productCardHeight).
                          final columns =
                              ((constraints.maxWidth - 24) / 220).ceil();
                          final cardWidth =
                              (constraints.maxWidth - 24 - 12 * (columns - 1)) /
                                  columns;
                          return GridView.builder(
                            padding: const EdgeInsets.all(12),
                            gridDelegate:
                                SliverGridDelegateWithMaxCrossAxisExtent(
                              maxCrossAxisExtent: 220,
                              mainAxisSpacing: 12,
                              crossAxisSpacing: 12,
                              childAspectRatio: cardWidth /
                                  productCardHeight(context, width: cardWidth),
                            ),
                            itemCount: visible.length,
                            itemBuilder: (context, i) =>
                                ProductCard(visible[i]),
                          );
                        });
                      },
                    ),
            ),
    );
  }
}
