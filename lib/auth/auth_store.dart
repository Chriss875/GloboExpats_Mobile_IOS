import 'apple_sign_in_service.dart';
import 'google_sign_in_service.dart';
import '../config.dart';
import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../storage/kv_store.dart';

/// Holds the auth session (JWT + email) and exposes login/register/logout.
///
/// The token is persisted through [KvStore] (web parity: the reference keeps
/// its JWT in `localStorage` so sessions survive reloads) and restored on app
/// start. Logout also hits the backend endpoint before clearing local state.
class AuthStore extends ChangeNotifier {
  /// Set once at app startup so screens (e.g. checkout) can reach the session.
  static AuthStore? instance;

  AuthStore({
    ApiClient? api,
    String? initialToken,
    String? initialEmail,
    GoogleAuthenticator? googleAuthenticator,
    AppleAuthenticator? appleAuthenticator,
  })  : _api = api ?? ApiClient(),
        _google = googleAuthenticator,
        _apple = appleAuthenticator,
        _token = initialToken,
        _email = initialEmail;

  final ApiClient _api;

  /// Injected only by tests. In the app this stays null and each use builds a
  /// real [GoogleSignInAuthenticator] on demand, so a build without Google
  /// configured never touches the plugin's platform channel.
  final GoogleAuthenticator? _google;
  final AppleAuthenticator? _apple;

  /// Exposed so a screen that only has the store (not its own injected
  /// client) still hits whatever backend/mock the store was built with,
  /// rather than standing up a second, unrelated `ApiClient()`.
  ApiClient get api => _api;

  String? _token;
  String? _email;
  bool _busy = false;
  String? _error;

  bool get isAuthenticated => _token != null && _token!.isNotEmpty;
  String? get token => _token;
  String? get email => _email;
  bool get busy => _busy;
  String? get error => _error;

  /// Restore a persisted session. Called from main() after KvStore.load();
  /// a corrupt/expired token simply leaves the user logged out (a later 401
  /// clears it — see [handleUnauthorized]).
  Future<void> restoreSession() async {
    final token = KvStore.instance.getString(KvStore.kAuthToken);
    if (token == null || token.isEmpty) return;
    _token = token;
    _email = KvStore.instance.getString(KvStore.kAuthEmail);
    notifyListeners();
  }

  Future<bool> login({required String email, required String password}) async {
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      final token = await _api.login(email, password);
      await _setSession(token, email);
      _busy = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      _busy = false;
      notifyListeners();
      return false;
    }
  }

  /// Native Google sign-in: account picker → ID token → platform session.
  ///
  /// Returns false and sets [error] on failure; a user who dismisses the
  /// picker is not an error, so nothing is shown for that.
  Future<bool> signInWithGoogle({GoogleAuthenticator? authenticator}) async {
    if (!AppConfig.googleSignInConfigured) {
      _error = 'Google sign-in is not configured in this build.';
      notifyListeners();
      return false;
    }
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      final google = authenticator ?? _google ?? GoogleSignInAuthenticator();
      final idToken = await google.signInAndGetIdToken();
      if (idToken == null) {
        // Dismissed the picker - silent, not a failure.
        _busy = false;
        notifyListeners();
        return false;
      }
      final result = await _api.signInWithGoogleIdToken(idToken);
      await _setSession(result.token, result.email);
      _busy = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      _busy = false;
      notifyListeners();
      return false;
    } catch (e) {
      // Never swallow the real cause - it is the only thing that says what is
      // actually misconfigured (see googleFailureMessage).
      _error = googleFailureMessage(e);
      // debugPrint still writes in a release build, and this carries the raw
      // platform exception — keep it out of logcat on a shipped app.
      if (kDebugMode) debugPrint('Google sign-in failed: $e');
      _busy = false;
      notifyListeners();
      return false;
    }
  }

  /// Native Sign in with Apple: system sheet -> verified backend session.
  Future<bool> signInWithApple({AppleAuthenticator? authenticator}) async {
    if (!appleSignInSupported && authenticator == null && _apple == null) {
      _error = 'Sign in with Apple is only available on iPhone and iPad.';
      notifyListeners();
      return false;
    }
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      final apple = authenticator ?? _apple ?? const NativeAppleAuthenticator();
      final credential = await apple.signIn();
      if (credential == null) {
        _busy = false;
        notifyListeners();
        return false;
      }
      final result = await _api.signInWithApple(
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
        rawNonce: credential.rawNonce,
        email: credential.email,
        firstName: credential.firstName,
        lastName: credential.lastName,
      );
      await _setSession(result.token, result.email);
      _busy = false;
      notifyListeners();
      return true;
    } on ApiException catch (error) {
      _error = error.message;
    } catch (error) {
      _error = appleFailureMessage(error);
      if (kDebugMode) debugPrint('Apple sign-in failed: $error');
    }
    _busy = false;
    notifyListeners();
    return false;
  }

  /// Completes a Google sign-in: swaps the one-shot auth code for a platform
  /// session and stores it exactly like an email login.
  ///
  /// The code is spent by the first caller, so this must only run on whoever
  /// actually received the redirect.
  Future<bool> completeGoogleSignIn(String code) async {
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      final result = await _api.exchangeOAuthCode(code);
      await _setSession(result.token, result.email);
      _busy = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      _busy = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> register({
    required String firstName,
    required String lastName,
    required String email,
    required String password,
  }) async {
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      await _api.register(
        firstName: firstName,
        lastName: lastName,
        email: email,
        password: password,
      );
      _email = email;
      _busy = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      _busy = false;
      notifyListeners();
      return false;
    }
  }

  /// Stage 1 of signup: email the verification code. Returns true when the
  /// backend accepted the request (202 "Verification code queued for
  /// delivery"). Throws [ApiException] so the register screen can distinguish
  /// transport failures from validation ones.
  Future<bool> sendSignupOtp({
    required String email,
    String? firstName,
    String? lastName,
  }) async {
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      await _api.sendSignupOtp(email, firstName: firstName, lastName: lastName);
      _busy = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      _busy = false;
      notifyListeners();
      return false;
    }
  }

  /// Stage 2 of signup: confirm the emailed code. Success is decided from the
  /// response BODY message ("OTP verified successfully" / "OTP already
  /// verified") — web `isSignupOtpVerified` defense-in-depth — because the
  /// sandbox answers a wrong code with HTTP 400 + plain text and an expired one
  /// with 400 "OTP has expired"; both must surface as errors, never as success.
  Future<bool> verifySignupOtp(
      {required String email, required String otp}) async {
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      final result = await _api.verifySignupOtp(email, otp);
      final verified = result.verified;
      if (!verified) {
        _error = result.message.isEmpty
            ? 'Verification failed. Please check your code and try again.'
            : result.message;
        notifyListeners();
        return false;
      }
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      notifyListeners();
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Logout: clear the local session first, then fire the backend logout call
  /// best-effort. Web parity: the reference never POSTs a logout endpoint
  /// (auth-provider.tsx has that call commented out) and this sandbox has no
  /// such endpoint — clearing local state first is what makes the Account tab
  /// swap to the logged-out view instantly instead of waiting on a doomed 500.
  Future<void> logout() async {
    final token = _token;
    await clearSession();
    if (token != null && token.isNotEmpty) {
      try {
        await _api.logout(token);
      } catch (_) {
        // Backend logout is best-effort; local state is already cleared.
      }
    }
  }

  /// Permanently delete the backend account, then remove the local session.
  Future<bool> deleteAccount() async {
    final token = _token;
    if (token == null || token.isEmpty) {
      _error = 'Please log in again to delete your account.';
      notifyListeners();
      return false;
    }
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      await _api.deleteAccount(token);
      _busy = false;
      await clearSession();
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      _busy = false;
      notifyListeners();
      return false;
    } catch (e) {
      _error = 'Account deletion could not be completed: $e';
      _busy = false;
      notifyListeners();
      return false;
    }
  }

  /// Clear local session state without calling the backend (used by logout
  /// and by 401 recovery).
  Future<void> clearSession() async {
    _token = null;
    _email = null;
    _error = null;
    // Every short-TTL read the previous session warmed goes with it. The
    // profile read in particular was cached per endpoint, not per session,
    // so for its next 45 seconds the app kept answering with the account
    // that had just signed out.
    ApiClient.invalidateReads();
    await KvStore.instance.remove(KvStore.kAuthToken);
    await KvStore.instance.remove(KvStore.kAuthEmail);
    await _forgetGoogleAccount();
    notifyListeners();
  }

  /// Drop the Google plugin's cached account.
  ///
  /// `GoogleSignIn` remembers the last account across sign-ins and, on a
  /// second `signIn()`, hands that same account back WITHOUT showing the
  /// picker. Clearing only the platform session therefore left a signed-out
  /// user unable to switch Google accounts: every subsequent "Login with
  /// Google" silently re-authenticated whoever signed in first. Nothing else
  /// clears it — uninstalling the app was the only way out.
  ///
  /// Best-effort by design: a failure here must not block a logout, and a
  /// build without Google configured has no plugin to talk to.
  Future<void> _forgetGoogleAccount() async {
    if (_google == null && !AppConfig.googleSignInConfigured) return;
    try {
      await (_google ?? GoogleSignInAuthenticator()).signOut();
    } catch (e) {
      if (kDebugMode) debugPrint('Google sign-out failed: $e');
    }
  }

  /// Called by API consumers on 401: drop the dead token so the next
  /// interaction surfaces the login UI instead of failing silently.
  Future<void> handleUnauthorized() async {
    if (!isAuthenticated) return;
    await clearSession();
  }

  /// True from a login (email, Google or registration) until the app has
  /// reacted to it once — unlike a session restored when the app reopens.
  bool _freshSignIn = false;

  /// Reads and clears [_freshSignIn].
  bool consumeFreshSignIn() {
    final fresh = _freshSignIn;
    _freshSignIn = false;
    return fresh;
  }

  Future<void> _setSession(String token, String email) async {
    // Same reasoning as clearSession: whoever was here before must not be
    // able to answer for the account signing in now.
    ApiClient.invalidateReads();
    _token = token;
    _email = email;
    _freshSignIn = true;
    await KvStore.instance.setString(KvStore.kAuthToken, token);
    await KvStore.instance.setString(KvStore.kAuthEmail, email);
  }
}
