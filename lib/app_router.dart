import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'api/api_client.dart';
import 'services/matomo_tracker.dart';
import 'auth/auth_store.dart';
import 'domain/seller_display.dart';
import 'domain/stay_listing.dart';
import 'models/category.dart';
import 'models/product.dart';
import 'screens/account_misc_screens.dart';
import 'screens/addresses_screen.dart';
import 'screens/edit_listing_screen.dart';
import 'screens/rental_availability_screen.dart';
import 'screens/saved_items_screen.dart';
import 'screens/admin_dashboard.dart';
import 'screens/admin_payments_review_screen.dart';
import 'screens/auth_screens.dart';
import 'screens/cart_screen.dart';
import 'screens/catalog_screens.dart';
import 'screens/checkout_screen.dart';
import 'screens/home_screen.dart';
import 'screens/my_payments_screen.dart';
import 'screens/insights_screen.dart';
import 'screens/orders_screen.dart';
import 'screens/payment_screen.dart';
import 'screens/product_detail_screen.dart';
import 'screens/reset_password_screen.dart';
import 'screens/create_request_screen.dart';
import 'screens/admin_ratings_screen.dart';
import 'screens/payout_details_screen.dart';
import 'screens/working_hours_screen.dart';
import 'screens/requests_screen.dart';
import 'screens/register_screen.dart' as reg;
import 'screens/delivery_dashboard_screens.dart';
import 'screens/seller_profile_screen.dart';
import 'screens/sell/sell_wizard_screen.dart';
import 'screens/contact_screen.dart';
import 'screens/shell.dart';
import 'screens/verification_hub_screen.dart';
import 'screens/verification_screens.dart';
import 'theme.dart';
import 'widgets/seller_verification_gate.dart';
import 'widgets/skeleton_loader.dart';
import 'widgets/sign_in_prompt.dart';
import 'widgets/navigation_boundary.dart';

/// Named routes for the app (web-parity paths; AU-003).
///
/// The shell tabs stay imperative (bottom-nav IndexedStack); go_router adds
/// SHAREABLE deep links for the push-routes, mirroring the reference's URLs
/// (`/product/42`, `/checkout?proforma=…`, `/seller/7`, …). Unauthenticated
/// hits on gated routes redirect to `/login?returnUrl=<original>` and come
/// back after login (web RouteGuard behavior).

/// Routes that require an authenticated session.
const _gatedRoutes = {
  '/checkout',
  '/orders',
  '/account/addresses',
  '/account/payments',
  '/account/settings',
  '/account/payment-methods',
  // ACCOUN-gates: the seller-verification hub and payout details are personal
  // to the signed-in user (web RouteGuard requireAuth). Without this, hitting
  // the deep link cold logged you out into an unauthenticated form.
  '/account/verification',
  '/account/payout-details',
  '/account/working-hours',
  '/sell',
  '/edit-listing',
};

/// Route-id parse that clamps to a sane positive range. On web `int.tryParse`
/// happily yields an out-of-range double for 20-digit segments, which then
/// reaches the backend as a Long overflow (HTTP 500). A segment that does not
/// parse to a bounded id degrades to 0 -> 'not found' rendering (AU-013).
int _routeId(String? raw) {
  final v = int.tryParse(raw ?? '');
  if (v == null || v < 0 || v > 9007199254740991) {
    return 0; // 2^53-1: exact in JS
  }
  return v;
}

/// Product and request pages on the web carry the title in the URL —
/// `/product/natural-cocoa-powder-1174` — and the id last (web
/// `extractProductIdFromSlug`). Website links now open in the app, so read
/// the trailing id the same way; a bare id still works.
int slugRouteId(String? raw) {
  final segment = raw ?? '';
  final trailing = RegExp(r'(?:^|-)(\d+)$').firstMatch(segment);
  return _routeId(trailing?.group(1) ?? segment);
}

/// LISTIN-28/B7: seller deep links accept the web's shared formats — a bare
/// numeric id, `{name}-p{base36}`, or (legacy) a plain name slug. A name-only
/// segment has no resolvable id here, so it degrades to 0 -> 'Seller not found'
/// (the web resolves name-only slugs by searching products for the seller).
int _sellerRouteId(String? raw) =>
    parseSellerProfileSegment(raw ?? '').sellerId ?? 0;

String? _loginRedirect(GoRouterState state) {
  final path = state.uri.path;
  final gated =
      _gatedRoutes.any((route) => path == route || path.startsWith('$route/'));
  if (!gated) return null;
  final authed = AuthStore.instance?.isAuthenticated ?? false;
  if (authed) return null;
  final qp = <String, String>{'returnUrl': state.uri.toString()};
  return Uri(path: '/login', queryParameters: qp).toString();
}

final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

GoRouter buildRouter(AuthStore store) {
  final router = GoRouter(
    navigatorKey: rootNavigatorKey,
    // Screen views for pageless Navigator.push screens on the root navigator.
    // Router locations (including the shell's tabs) are tracked by
    // MatomoTracking.attachRouter below.
    observers: [MatomoRouteObserver()],
    // AU-022 verifier FAIL fix: initialLocation '/' overrode cold deep links
    // (/checkout rendered the HOME shell). Let the router start from the
    // BROWSER URL; the redirect below then enforces the login gate with
    // returnUrl, matching web RouteGuard behavior.
    initialLocation: Uri.base.path.isEmpty ? '/' : Uri.base.path,
    debugLogDiagnostics: false,
    redirect: (context, state) => _loginRedirect(state),
    routes: [
      // The five bottom-nav destinations live inside the shell, so the top
      // bar and bottom nav persist while moving between them. Only `/` used
      // to be a shell child, which is why the first tap on Marketplace left
      // the user on a bare full-screen route with no navigation back.
      ShellRoute(
        // The shell runs its own nested navigator: the root observer never
        // sees pageless screens pushed inside it, so it gets its own.
        observers: [MatomoRouteObserver()],
        builder: (context, state, child) => AppShellWithRouter(child: child),
        routes: [
          GoRoute(
            path: '/',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: HomeScreen()),
          ),
          GoRoute(
            path: '/browse',
            pageBuilder: (context, state) => NoTransitionPage(
              child: BrowseScreen(
                  key: ValueKey(state.uri.toString()),
                  api: state.extra as ApiClient?,
                  initialQuery: state.uri.queryParameters['q'] ?? '',
                  // Home's "See more" links ask for an order (`?sort=trending`,
                  // `?sort=date-desc`), which used to be dropped on arrival.
                  initialSort:
                      ProductSort.fromParam(state.uri.queryParameters['sort']),
                  initialSource: state.uri.queryParameters['source'] ?? '',
                  initialCategoryId:
                      int.tryParse(state.uri.queryParameters['category'] ?? ''),
                  initialSubcategoryIds:
                      (state.uri.queryParameters['subcategory'] ?? '')
                          .split(',')
                          .map(int.tryParse)
                          .whereType<int>()
                          .where((id) => id > 0)
                          .toList()),
            ),
          ),
          // MySpace: the seller/owner hub, and where selling now starts.
          GoRoute(
            path: '/expat/dashboard',
            pageBuilder: (context, state) => NoTransitionPage(
                child: AnimatedBuilder(
                    animation: store,
                    builder: (_, __) => store.isAuthenticated
                        ? ExpatDashboardScreen(
                            initialTab:
                                state.uri.queryParameters['tab'] ?? 'overview',
                            initialSub: state.uri.queryParameters['sub'],
                            initialListingFilter:
                                state.uri.queryParameters['listingFilter'],
                            initialPaymentStatus:
                                PaymentGroup.values.firstWhere(
                              (group) =>
                                  group.name ==
                                  state.uri.queryParameters['paymentStatus'],
                              orElse: () => PaymentGroup.pending,
                            ))
                        : const Scaffold(
                            body: SingleChildScrollView(
                              child: SignInPrompt(
                                title: 'Your space, all in one place',
                                message: 'Sign in to see your listings, '
                                    'orders, payments and saved items.',
                                highlights: [
                                  (
                                    Icons.storefront_outlined,
                                    'Sell and track your listings'
                                  ),
                                  (
                                    Icons.shopping_bag_outlined,
                                    'Follow orders and payments'
                                  ),
                                  (
                                    Icons.favorite_border_rounded,
                                    'Keep your saved items'
                                  ),
                                ],
                              ),
                            )))),
          ),
          GoRoute(
            path: '/requests',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: RequestsScreen()),
          ),
          GoRoute(
            path: '/account',
            pageBuilder: (context, state) => NoTransitionPage(
              child: AnimatedBuilder(
                animation: store,
                builder: (context, _) => store.isAuthenticated
                    ? AccountScreen(store: store)
                    : const Scaffold(
                        body: SingleChildScrollView(
                            child: SignInPrompt(
                          title: 'Your account',
                          message: 'Sign in to manage your profile, '
                              'verification and security.',
                          returnUrl: '/account',
                          highlights: [
                            (Icons.person_outline_rounded, 'Profile and addresses'),
                            (Icons.verified_outlined, 'Seller verification'),
                            (Icons.lock_outline_rounded, 'Security and sign-in'),
                          ],
                        ))),
              ),
            ),
          ),
          GoRoute(
            path: '/sell',
            builder: (context, state) => SellerVerificationGate(
              child: SellWizardScreen(auth: store),
            ),
          ),
          GoRoute(
            path: '/orders',
            pageBuilder: (context, state) =>
                NoTransitionPage(child: OrdersScreen(auth: store)),
          ),
          GoRoute(
            path: '/orders/:id',
            builder: (context, state) => NavigationBoundary(
              fallbackLocation: '/orders',
              child: OrderDetailScreen(
                orderId: state.pathParameters['id']!,
                token: store.token ?? '',
                api: ApiClient(),
                admin: state.uri.queryParameters['admin'] == '1',
              ),
            ),
          ),
          GoRoute(
            path: '/product/:id',
            builder: (context, state) => NavigationBoundary(
              fallbackLocation: '/browse',
              child: ProductDetailScreen(
                productId: slugRouteId(state.pathParameters['id']),
                initial: state.extra is Product ? state.extra as Product : null,
                initialStayDates: readStayDates(state.uri.queryParameters),
              ),
            ),
          ),
          GoRoute(
            path: '/request/:id',
            builder: (context, state) {
              final raw = state.pathParameters['id'];
              final parsed = slugRouteId(raw);
              final id = parsed > 0 ? parsed : null;
              final supplied = state.extra;
              final request = supplied is Map
                  ? supplied.cast<String, dynamic>()
                  : <String, dynamic>{'id': id ?? raw};
              return NavigationBoundary(
                fallbackLocation: '/requests',
                child: RequestDetailScreen(req: request),
              );
            },
          ),
        ],
      ),
      GoRoute(
        path: '/category/:slug',
        // Web /category/[slug] is a static slug→id lookup that renders the
        // same filtered feed; resolve by matching the loaded categories.
        builder: (context, state) => CategoryBySlugScreen(
          slug: state.pathParameters['slug']!,
        ),
      ),
      GoRoute(
        path: '/search',
        builder: (context, state) =>
            SearchScreen(initialQuery: state.uri.queryParameters['q'] ?? ''),
      ),
      GoRoute(
        path: '/seller/:id',
        builder: (context, state) => SellerProfileScreen(
          sellerId: _sellerRouteId(state.pathParameters['id']),
        ),
      ),
      GoRoute(
        path: '/cart',
        builder: (context, state) => const CartScreen(),
      ),
      GoRoute(
        path: '/checkout',
        // ?proforma=<id> resumes an active proforma (web parity
        // /checkout?proforma= — AU-003; the resume flow lands the buyer back
        // on the PAYMENT step, CARTCH-02 / FINANC-01 / APISUR-01).
        builder: (context, state) => CheckoutScreen(
          auth: AuthStore.instance,
          proformaId: state.uri.queryParameters['proforma'],
        ),
      ),
      GoRoute(
        path: '/checkout/success',
        builder: (context, state) => PaymentScreen(
          proformaId: state.uri.queryParameters['proforma'] ?? '',
        ),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => LoginScreenWithReturn(
          store: store,
          returnUrl: state.uri.queryParameters['returnUrl'],
        ),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => reg.RegisterScreen(store: store),
      ),
      GoRoute(
        path: '/reset-password',
        builder: (context, state) => const ResetPasswordScreen(),
      ),
      GoRoute(
        path: '/verify-email',
        builder: (context, state) => VerifyEmailScreen(
          email: state.uri.queryParameters['email'] ?? '',
        ),
      ),
      GoRoute(
        path: '/account/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
      GoRoute(
        path: '/account/addresses',
        builder: (context, state) => AddressesScreen(auth: store),
      ),
      // AU-033: My Payments panel (web /expat/dashboard?tab=orders&sub=payments).
      // `?paymentStatus=rejected|pending|verified|expired` deep-links straight
      // into that group tab, matching the web's searchParams handling.
      GoRoute(
        path: '/account/payments',
        builder: (context, state) {
          final requested = PaymentGroup.values.firstWhere(
            (g) =>
                g.name ==
                (state.uri.queryParameters['paymentStatus'] ?? '')
                    .toLowerCase(),
            orElse: () => PaymentGroup.pending,
          );
          return MyPaymentsScreen(auth: store, initialGroup: requested);
        },
      ),
      GoRoute(
        path: '/account/payment-methods',
        builder: (context, state) => const PaymentMethodsScreen(),
      ),
      // AU-050: saved-items grid (web /expat/dashboard?tab=saved).
      GoRoute(
        path: '/account/saved',
        builder: (context, state) => const SavedItemsScreen(),
      ),
      // AU-061: the seller verification HUB owns /account/verification (web
      // parity). The OTP email-verify screen keeps its own deep link.
      GoRoute(
        path: '/account/verification',
        builder: (context, state) => const VerificationHubScreen(),
      ),
      GoRoute(
        path: '/verify-email',
        builder: (context, state) => VerifyEmailScreen(
          email: state.uri.queryParameters['email'] ?? store.email ?? '',
        ),
      ),
      GoRoute(
        path: '/notifications',
        builder: (context, state) => const NotificationsScreen(),
      ),
      GoRoute(
        path: '/requests/new',
        builder: (context, state) => const CreateRequestScreen(),
      ),
      GoRoute(
        path: '/help',
        builder: (context, state) => const HelpScreen(),
      ),
      GoRoute(
        path: '/faq',
        builder: (context, state) => const HelpScreen(title: 'FAQ'),
      ),
      GoRoute(
        path: '/about',
        builder: (context, state) => const HelpScreen(title: 'About'),
      ),
      GoRoute(
        path: '/admin/ratings',
        builder: (context, state) => const AdminRatingsScreen(),
      ),
      GoRoute(
        path: '/account/payout-details',
        builder: (context, state) => const PayoutDetailsScreen(),
      ),
      GoRoute(
        path: '/account/working-hours',
        builder: (context, state) => const WorkingHoursScreen(),
      ),
      GoRoute(
        path: '/contact',
        builder: (context, state) => const ContactScreen(),
      ),
      GoRoute(
        path: '/privacy',
        builder: (context, state) => const HelpScreen(title: 'Privacy policy'),
      ),
      GoRoute(
        path: '/terms',
        builder: (context, state) =>
            const HelpScreen(title: 'Terms of service'),
      ),
      GoRoute(
        path: '/edit-listing/:id',
        // SELLWI-01 parity: the web editor wraps /edit-listing/[id] in
        // <RouteGuard requireAuth requireVerification="sell"
        // loadingMessage="Loading listing editor..."> — only verified sellers
        // may reach it (app/edit-listing/[id]/page.tsx:150-152). The gate
        // redirects an unverified seller to /account/verification rather than
        // dead-ending, so the logistics-notification deep link still lands
        // somewhere actionable.
        builder: (context, state) => SellerVerificationGate(
          child: EditListingScreen(
            listingId: _routeId(state.pathParameters['id']),
          ),
        ),
      ),
      GoRoute(
        // Owner-only editor for a rental listing's closed dates.
        path: '/listing/:id/availability',
        builder: (context, state) => RentalAvailabilityScreen(
          productId: _routeId(state.pathParameters['id']),
          title: state.uri.queryParameters['title'],
        ),
      ),
      GoRoute(
        path: '/insights',
        builder: (context, state) => InsightsScreen(auth: store),
      ),
      GoRoute(
        path: '/admin',
        builder: (context, state) => AdminDashboard(auth: store),
      ),
      GoRoute(
        path: '/admin/payments-review',
        builder: (context, state) => AdminPaymentsReviewScreen(auth: store),
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(title: const Text('Not found')),
      body: Center(
        child: Text(
          'Page not found: ${state.uri.path}',
          style: TextStyle(color: AppPalette.of(context).textSecondary),
        ),
      ),
    ),
  );
  // Screen-view analytics: one Matomo page view per location change — go,
  // push, pop, redirect and the initial route, shell tabs included (web
  // parity: SPA tracking in components/matomo-tag-manager.tsx).
  MatomoTracking.instance.attachRouter(router);
  return router;
}

/// Login screen that honours `?returnUrl=` — after a successful login the
/// user is taken back to where the guard intercepted them (web parity:
/// login/page.tsx returnUrl handling).
class LoginScreenWithReturn extends StatelessWidget {
  final AuthStore store;
  final String? returnUrl;
  const LoginScreenWithReturn({super.key, required this.store, this.returnUrl});

  @override
  Widget build(BuildContext context) {
    return LoginScreen(store: store, returnUrl: returnUrl);
  }
}

/// Resolves `/category/<slug>` to its categoryId through the public
/// categories endpoint (web parity: app/category/[slug]/page.tsx static map),
/// then renders the same filtered feed as tapping a category chip.
class CategoryBySlugScreen extends StatefulWidget {
  final String slug;
  const CategoryBySlugScreen({super.key, required this.slug});

  @override
  State<CategoryBySlugScreen> createState() => _CategoryBySlugScreenState();
}

class _CategoryBySlugScreenState extends State<CategoryBySlugScreen> {
  late Future<Category?> _future;

  @override
  void initState() {
    super.initState();
    _future = _resolve();
  }

  Future<Category?> _resolve() async {
    final cats = await ApiClient().fetchCategories();
    for (final c in cats) {
      if (c.slug == widget.slug ||
          c.categoryName.toLowerCase() == widget.slug) {
        return c;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Category?>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return Scaffold(
            appBar: AppBar(title: Text(widget.slug)),
            body: const SkeletonPage(),
          );
        }
        final cat = snap.data;
        if (cat == null) {
          return Scaffold(
            appBar: AppBar(title: Text(widget.slug)),
            body: Center(
              child: Text(
                'Category not found',
                style: TextStyle(color: AppPalette.of(context).textSecondary),
              ),
            ),
          );
        }
        return CategoryScreen(category: cat);
      },
    );
  }
}
