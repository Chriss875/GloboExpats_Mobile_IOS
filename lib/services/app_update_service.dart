import 'package:flutter/foundation.dart';
import 'package:in_app_update/in_app_update.dart';
import 'package:url_launcher/url_launcher.dart';

/// A newer build Google Play is offering this install.
@immutable
class AppUpdateOffer {
  const AppUpdateOffer({
    required this.immediateAllowed,
    required this.flexibleAllowed,
    this.alreadyStarted = false,
    this.versionCode,
  });

  /// Play can run its full-screen update (download, install, restart).
  final bool immediateAllowed;

  /// Play can download in the background and install on request.
  final bool flexibleAllowed;

  /// The buyer already said yes and left mid-update; Play's guidance is to
  /// pick it straight back up rather than ask again.
  final bool alreadyStarted;
  final int? versionCode;
}

/// Where update offers come from. The real one is Google Play; tests supply
/// their own so no platform channel is ever touched.
abstract class AppUpdateSource {
  /// The offer on the table, or null when there is none — or when this
  /// install cannot be updated from inside the app at all.
  Future<AppUpdateOffer?> check();

  /// Runs the update the buyer just agreed to.
  Future<void> install(AppUpdateOffer offer);
}

/// Google Play In-App Updates.
///
/// Only an install that came FROM the Play Store can be updated this way. A
/// sideloaded APK — every dev build — gets an error from Play, which is
/// treated as "no update" and never shown to anyone.
class PlayAppUpdateSource implements AppUpdateSource {
  const PlayAppUpdateSource();

  static const _packageName = 'com.globoexpats.globoexpats_mobile';

  bool get _supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  @override
  Future<AppUpdateOffer?> check() async {
    if (!_supported) return null;
    try {
      final info = await InAppUpdate.checkForUpdate();
      switch (info.updateAvailability) {
        case UpdateAvailability.developerTriggeredUpdateInProgress:
          return AppUpdateOffer(
            immediateAllowed: true,
            flexibleAllowed: false,
            alreadyStarted: true,
            versionCode: info.availableVersionCode,
          );
        case UpdateAvailability.updateAvailable:
          return AppUpdateOffer(
            immediateAllowed: info.immediateUpdateAllowed,
            flexibleAllowed: info.flexibleUpdateAllowed,
            versionCode: info.availableVersionCode,
          );
        case UpdateAvailability.unknown:
        case UpdateAvailability.updateNotAvailable:
          return null;
      }
    } catch (_) {
      // Not from the Play Store, no Play services, offline: none of these is
      // the user's problem, and none of them is an update.
      return null;
    }
  }

  @override
  Future<void> install(AppUpdateOffer offer) async {
    try {
      if (offer.immediateAllowed) {
        // Play's own full-screen flow: it downloads, installs and restarts
        // the app. Backing out of it simply returns here.
        await InAppUpdate.performImmediateUpdate();
        return;
      }
      if (offer.flexibleAllowed) {
        final result = await InAppUpdate.startFlexibleUpdate();
        if (result == AppUpdateResult.success) {
          await InAppUpdate.completeFlexibleUpdate();
        }
        return;
      }
    } catch (_) {
      // Fall through to the store listing.
    }
    await openStoreListing();
  }

  /// The Play Store page for the app — the way to update when Play will not
  /// run the update in place.
  static Future<void> openStoreListing() async {
    final market = Uri.parse('market://details?id=$_packageName');
    final web = Uri.parse(
        'https://play.google.com/store/apps/details?id=$_packageName');
    try {
      if (await launchUrl(market, mode: LaunchMode.externalApplication)) {
        return;
      }
    } catch (_) {
      // No Play Store app: try the web listing.
    }
    try {
      await launchUrl(web, mode: LaunchMode.externalApplication);
    } catch (_) {
      // Nothing more the app can do.
    }
  }
}
