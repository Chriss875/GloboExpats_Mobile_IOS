/// App configuration.
///
/// The API base URL defaults to the DEV backend — the environment this app is
/// tested against. The live backend is opted into explicitly for a release,
/// never inherited by accident.
class AppConfig {
  AppConfig._();

  /// Which of the two shippable builds this is — `dev` (internal testing,
  /// the dev backend, experiments switched on) or `prod` (the live listing).
  /// Set by the build scripts alongside Gradle's `--flavor`, and defaulting
  /// to `dev` so a plain `flutter run` never points at production by
  /// accident.
  static const String flavor =
      String.fromEnvironment('APP_FLAVOR', defaultValue: 'dev');

  /// True for the internal-testing build. Gates anything not ready for the
  /// live listing, so an experiment ships to testers without a code branch.
  static const bool isDevBuild = flavor != 'prod';

  /// The backend's property-rental support (backend 2c8277d, 2026-10-09):
  /// short-stay purpose, minimum stays, the dated Short Stays search and
  /// photo groups. On by default (that backend ships with this app); an
  /// emergency off-switch for a server still on the older backend, which
  /// parses listings strictly and refuses the whole listing when it sees
  /// `shortStay` / `minimumNights`. tool/build_release.sh passes
  /// PROPERTY_RENTALS_DEV / _PROD from .env.release when set. Mutable only
  /// so tests can flip it.
  static bool propertyRentals =
      const bool.fromEnvironment('PROPERTY_RENTALS', defaultValue: true);

  /// Follows the flavour unless a build overrides it explicitly. Was a bare
  /// default of apidev, which meant a production build that forgot its
  /// `--dart-define` silently shipped pointing at the dev backend.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: flavor == 'prod'
        ? 'https://api.globoexpats.com'
        : 'https://apidev.globoexpats.com',
  );

  /// Analytics microservice (AU-064). The web proxies /api/analytics/* to
  /// ANALYTICS_API_URL (:8082 in prod/dev); the sandbox runs its own
  /// instance on :8084 reading the SANDBOX database. Overridable for APK
  /// builds so the endpoint can be repointed without code changes.
  static const String analyticsBaseUrl = String.fromEnvironment(
    'ANALYTICS_BASE_URL',
    defaultValue: 'http://localhost:8084', // sandbox analytics
  );

  /// The backend's own Google client id, passed to native sign-in as the
  /// server client id so the ID token is audienced to GloboExpats — the
  /// backend refuses a token minted for anyone else.
  ///
  /// A client id is public (it ships in every consent URL the web already
  /// serves); the client SECRET stays on the backend and never reaches here.
  /// Injected at build time so it is not committed:
  /// `--dart-define=GOOGLE_SERVER_CLIENT_ID=…`
  static const String googleServerClientId =
      String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');

  /// Whether native Google sign-in can run at all.
  static bool get googleSignInConfigured => googleServerClientId.isNotEmpty;

  /// Google Maps SDK key (Android app-restricted — safe to embed). Renders
  /// map tiles only; injected two ways at once because they're two different
  /// mechanisms reading the same value: `--dart-define=GOOGLE_MAPS_API_KEY=…`
  /// for this constant, AND a `GOOGLE_MAPS_API_KEY` environment variable
  /// (picked up by android/app/build.gradle) so it lands in the manifest's
  /// `com.google.android.geo.API_KEY` meta-data that the native SDK reads.
  static const String googleMapsApiKey =
      String.fromEnvironment('GOOGLE_MAPS_API_KEY');

  /// Key for the Places/Geocoding *web service* REST calls (search-as-you-type
  /// and reverse geocoding). Deliberately separate from [googleMapsApiKey]:
  /// an Android-app-restricted key only authenticates native Maps/Places SDK
  /// requests, which carry the app's signature. Direct iOS REST requests add
  /// the bundle identifier header required by Google, allowing a separate
  /// iOS-app-restricted key limited to Places API (New), Geocoding API, and
  /// Routes API. Falls back to
  /// [googleMapsApiKey] so a team with a single unrestricted key can pass just
  /// that one. `--dart-define=GOOGLE_PLACES_API_KEY=…`
  static const String googlePlacesApiKey =
      String.fromEnvironment('GOOGLE_PLACES_API_KEY');

  /// Whether the map location picker can render at all.
  static bool get mapsConfigured => googleMapsApiKey.isNotEmpty;

  /// Static frontend art bundled into the app (Rule 13 asset parity). The
  /// sandbox backend serves these paths as OAuth redirects (302), never bytes,
  /// so they must never go over the network.
  static const List<String> bundledAssetDirs = [
    'images/home/',
    'images/quick-subcategories/',
    'images/transport/',
  ];

  /// AU-063 Matomo analytics proxy (read-only, dev instance — the SAME data
  /// source the reference web app's /api/matomo proxy uses). Token is injected
  /// at build time via --dart-define, never committed.
  static const String matomoUrl = String.fromEnvironment(
    'MATOMO_URL',
    defaultValue: 'https://matomodev.globoexpats.com/index.php',
  );
  static const String matomoSiteId =
      String.fromEnvironment('MATOMO_SITE_ID', defaultValue: '1');
  static const String matomoToken = String.fromEnvironment('MATOMO_TOKEN');

  /// Asset-bundle path when [path] is one of the bundled static directories,
  /// else null (caller falls through to the API URL).
  static String? bundledAssetPath(String path) {
    var rel = path.startsWith('/') ? path.substring(1) : path;
    for (final dir in bundledAssetDirs) {
      if (rel.startsWith(dir)) return 'assets/$rel';
    }
    return null;
  }

  /// Resolve an image path to something renderable: bundled static art first,
  /// otherwise an absolute URL against the API base (e.g. `/uploads/x.webp`).
  static String resolveAssetUrl(String path) {
    if (path.startsWith('http')) return path;
    final bundled = bundledAssetPath(path);
    if (bundled != null) return bundled;
    // apiBaseUrl has no trailing slash and backend image paths have no
    // leading slash; join with exactly one separator.
    final base = apiBaseUrl.endsWith('/')
        ? apiBaseUrl.substring(0, apiBaseUrl.length - 1)
        : apiBaseUrl;
    final rel = path.startsWith('/') ? path : '/$path';
    return '$base$rel';
  }
}
