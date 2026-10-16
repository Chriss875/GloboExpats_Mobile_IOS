import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'app_router.dart';
import 'api/api_client.dart';
import 'auth/auth_store.dart';
import 'cart/cart_store.dart';
import 'cart/saved_products_store.dart';
import 'domain/pending_actions.dart';
import 'storage/kv_store.dart';
import 'theme.dart';
import 'currency_controller.dart';
import 'theme_controller.dart';
import 'notifications/push_notification_service.dart';
import 'widgets/app_update_gate.dart';
import 'screens/welcome_guide_screen.dart';
import 'services/matomo_tracker.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Publish the accessibility/semantics tree (to the web `flt-semantics`
  // placeholder) so screen readers AND our Playwright harness can assert
  // roles/labels/states against the rendered app.
  if (kIsWeb) {
    SemanticsBinding.instance.ensureSemantics();
  }
  await KvStore.instance.load();
  // Read before the first frame so the app never flashes the wrong theme.
  ThemeController.instance.restore();
  // Same treatment for the header's currency: read before the first frame so
  // prices never flash in TZS on the way to the shopper's choice.
  CurrencyController.instance.restore();

  final store = AuthStore();
  AuthStore.instance = store;
  // Restore a persisted JWT before first paint so a reload keeps the user
  // signed in (web parity: localStorage token).
  await store.restoreSession();

  // App analytics. Bind the restored account FIRST: the auth listener below
  // only fires on later changes, so a user who reopened the app while still
  // signed in was tracked anonymously for the whole session (web parity:
  // auth-provider calls setMatomoUserId when it rebuilds the session).
  // init() is local-storage only and never throws, and must finish before
  // the router resolves its first location so that hit is not lost.
  MatomoTracking.instance.setUserId(store.isAuthenticated ? store.email : null);
  await MatomoTracking.instance.init();
  // Uncaught errors (web parity: trackError on window.error /
  // unhandledrejection). Chained, so existing handlers keep running.
  final previousFlutterError = FlutterError.onError;
  FlutterError.onError = (details) {
    MatomoTracking.instance.trackError(details.exception, source: 'flutter');
    (previousFlutterError ?? FlutterError.presentError)(details);
  };
  final previousPlatformError = PlatformDispatcher.instance.onError;
  PlatformDispatcher.instance.onError = (error, stack) {
    MatomoTracking.instance.trackError(error, source: 'platform');
    return previousPlatformError?.call(error, stack) ?? false;
  };

  // Load the cart that belongs to the restored session (web parity:
  // expatCartItems_{userId}); guests start with an empty in-memory cart.
  final email = store.email;
  if (email != null && email.isNotEmpty) {
    // The cart is local storage — cheap, and the first screen reads it.
    await CartStore.instance.loadForUser(email);
    // Saved items refresh over the network. Awaiting that here meant a
    // phone with no signal never reached `runApp`: the request threw a
    // SocketException, which is NOT the ApiException the store catches, so
    // main() died before the first frame. Offline, the app simply did not
    // open. It reads its cache synchronously and refreshes in the
    // background now, and nothing it throws can reach startup.
    unawaited(SavedProductsStore.instance
        .load(email, store.token ?? '')
        .catchError((Object _) {}));
  }

  // Warm the live platform commission settings (VAT / Selcom rates) so a
  // seller's FIRST pricing screen already shows admin-tuned rates instead of
  // the hardcoded defaults (FINANC-02 parity with the web settings fetch).
  // Fire-and-forget: failures keep the defaults; nothing here blocks first
  // paint.
  // ignore: unawaited_futures
  ApiClient().fetchPlatformCommissionSettings(token: store.token);

  // Keep the cart store in lockstep with the session: login swaps in that
  // user's persisted cart, logout drops to the empty guest cart.
  store.addListener(() {
    final user = store.email;
    if (store.isAuthenticated && user != null && user.isNotEmpty) {
      // The OS remembers the user's choice, so subsequent authenticated
      // session changes don't repeatedly show the permission dialog.
      PushNotificationService.instance.syncSession(store.token);
      if (!CartStore.instance.isLoadedFor(user)) {
        CartStore.instance.loadForUser(user);
      }
      if (!SavedProductsStore.instance.isLoadedFor(user)) {
        SavedProductsStore.instance.load(user, store.token ?? '');
      }
      MatomoTracking.instance.setUserId(user);
    } else if (!store.isAuthenticated) {
      PushNotificationService.instance.syncSession(null);
      MatomoTracking.instance.setUserId(null);
      CartStore.instance.reset();
      SavedProductsStore.instance.reset();
      // The reminder strip is derived from the signed-out user's orders and
      // payments. Waiting for the shell's next refresh to clear it meant the
      // previous account's outstanding work sat on screen — badges, counts
      // and all — over a session that no longer existed.
      PendingActionsStore.instance.clear();
    }
  });

  runApp(GloboExpatsApp(store: store));

  // Push is useful, but it must never hold the first Flutter frame hostage.
  // Firebase/network/device-service failures are isolated so the marketplace
  // still opens normally and push can retry on the next app start.
  unawaited(_initializePush(store));
}

Future<void> _initializePush(AuthStore store) async {
  if (kIsWeb) return;
  try {
    await Firebase.initializeApp().timeout(const Duration(seconds: 10));
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await PushNotificationService.instance
        .initialize()
        .timeout(const Duration(seconds: 10));
    if (store.isAuthenticated) {
      await PushNotificationService.instance.syncSession(store.token);
    }
  } catch (error, stackTrace) {
    if (kDebugMode) {
      debugPrint('Push startup skipped: $error');
      debugPrintStack(stackTrace: stackTrace);
    }
  }
}

class GloboExpatsApp extends StatelessWidget {
  final AuthStore store;
  const GloboExpatsApp({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    final router = buildRouter(store);
    // Rebuilt on every change of the persisted Light/Dark/System preference.
    return ListenableBuilder(
      // Both are app-wide display settings: a change to either has to repaint
      // every screen holding a price or a colour.
      listenable: Listenable.merge(
          [ThemeController.instance, CurrencyController.instance]),
      builder: (context, _) => MaterialApp.router(
        title: 'GloboExpats',
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        darkTheme: buildAppDarkTheme(),
        themeMode: ThemeController.instance.mode,
        routerConfig: router,
        // Offers the newest Play Store build each time the app is entered.
        builder: (context, child) => AppUpdateGate(
            navigatorKey: rootNavigatorKey,
            // A fresh install opens on the welcome guide, once.
            child: WelcomeGuideGate(
                navigatorKey: rootNavigatorKey,
                child: child ?? const SizedBox.shrink())),
      ),
    );
  }
}
