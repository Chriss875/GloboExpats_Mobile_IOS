import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../app_router.dart' show rootNavigatorKey;

const _androidChannel = AndroidNotificationChannel(
  'globoexpats_updates',
  'Orders and activity',
  description: 'Order, delivery, payment and request updates.',
  importance: Importance.high,
);

/// MUST name a resource under `res/drawable/`. The plugin looks the icon up
/// with `getIdentifier(name, "drawable", …)` and returns a platform ERROR —
/// i.e. `show()` throws — when it resolves to 0. This was `ic_launcher`,
/// which exists only under `mipmap/`, so every foreground notification threw.
const _notificationIcon = 'ic_notification';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

class PushNotificationService {
  PushNotificationService._();
  static final instance = PushNotificationService._();

  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;
  StreamSubscription<String>? _tokenSubscription;
  final ApiClient _api = ApiClient();
  String? _sessionToken;
  String? _registrationToken;
  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized || kIsWeb) return;
    _initialized = true;

    const settings = InitializationSettings(
      android: AndroidInitializationSettings(_notificationIcon),
      iOS: DarwinInitializationSettings(),
    );
    await _local.initialize(
      settings,
      onDidReceiveNotificationResponse: (response) {
        _openRoute(response.payload);
      },
    );
    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_androidChannel);

    _foregroundSubscription =
        FirebaseMessaging.onMessage.listen(_showForegroundMessage);
    _openedSubscription =
        FirebaseMessaging.onMessageOpenedApp.listen(_openRemoteMessage);
    _tokenSubscription = FirebaseMessaging.instance.onTokenRefresh.listen(
      (token) {
        _registrationToken = token;
        final session = _sessionToken;
        if (session != null) {
          _register(session, token);
        }
      },
    );

    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) {
      WidgetsBinding.instance
          .addPostFrameCallback((_) => _openRemoteMessage(initial));
    }
  }

  Future<NotificationSettings> requestPermission() =>
      FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

  Future<String?> getToken() => FirebaseMessaging.instance.getToken();

  Stream<String> get onTokenRefresh =>
      FirebaseMessaging.instance.onTokenRefresh;

  /// Keep the backend device registry in lockstep with login/logout and FCM
  /// token rotation. Delivery setup is best-effort and never blocks auth.
  Future<void> syncSession(String? sessionToken) async {
    if (kIsWeb) return;
    // Auth can change during the short asynchronous Firebase bootstrap. Main
    // performs a session sync again after initialize() succeeds.
    if (!_initialized) return;
    if (sessionToken != null &&
        sessionToken.isNotEmpty &&
        sessionToken == _sessionToken &&
        _registrationToken != null) {
      return;
    }
    final previousSession = _sessionToken;
    final existingToken = _registrationToken ?? await getToken();
    _registrationToken = existingToken;

    if (sessionToken == null || sessionToken.isEmpty) {
      _sessionToken = null;
      if (previousSession != null && existingToken != null) {
        try {
          await _api.unregisterPushDevice(previousSession, existingToken);
        } catch (error) {
          if (kDebugMode) debugPrint('Push unregister failed: $error');
        }
      }
      return;
    }

    _sessionToken = sessionToken;
    await requestPermission();
    if (existingToken != null) await _register(sessionToken, existingToken);
  }

  Future<void> _register(String sessionToken, String registrationToken) async {
    try {
      await _api.registerPushDevice(
        sessionToken,
        registrationToken,
        platform: defaultTargetPlatform.name.toUpperCase(),
      );
    } catch (error) {
      if (kDebugMode) debugPrint('Push registration failed: $error');
    }
  }

  Future<void> _showForegroundMessage(RemoteMessage message) async {
    final notification = message.notification;
    // A data-only push carries no `notification` block. Dropping those meant
    // the app silently ignored anything the backend chose to send as data,
    // so fall back to the payload's own title/body.
    final title = notification?.title ??
        message.data['title']?.toString() ??
        'GloboExpats';
    final body =
        notification?.body ?? message.data['body']?.toString() ?? '';
    if (notification == null && body.isEmpty) return;

    try {
      await _local.show(
        message.messageId.hashCode,
        title,
        body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'globoexpats_updates',
            'Orders and activity',
            channelDescription: 'Order, delivery, payment and request updates.',
            importance: Importance.high,
            priority: Priority.high,
            icon: _notificationIcon,
          ),
          iOS: DarwinNotificationDetails(),
        ),
        payload: _safeRoute(message.data['route']?.toString()),
      );
    } catch (error) {
      // Never silent again: this exact path failed for months because an
      // unresolvable icon threw inside an unawaited stream listener.
      debugPrint('Foreground notification could not be shown: $error');
    }
  }

  void _openRemoteMessage(RemoteMessage message) {
    _openRoute(message.data['route']?.toString());
  }

  void _openRoute(String? route) {
    final safe = _safeRoute(route);
    final context = rootNavigatorKey.currentContext;
    if (safe == null || context == null) return;
    GoRouter.of(context).push(safe);
  }

  String? _safeRoute(String? route) {
    if (route == null || !route.startsWith('/') || route.startsWith('//')) {
      return null;
    }
    const allowed = [
      '/orders/',
      '/request/',
      '/product/',
      '/edit-listing/',
      '/notifications',
      '/account/payments',
      '/account/verification',
      '/expat/dashboard',
    ];
    return allowed.any((prefix) => route == prefix || route.startsWith(prefix))
        ? route
        : '/notifications';
  }

  Future<void> dispose() async {
    await _foregroundSubscription?.cancel();
    await _openedSubscription?.cancel();
    await _tokenSubscription?.cancel();
    _initialized = false;
  }
}
