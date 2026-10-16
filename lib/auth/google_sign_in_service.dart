import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../config.dart';

/// Native Google sign-in: shows the system account picker and returns the ID
/// token the backend can verify.
///
/// No Google secret lives in this app. `serverClientId` is the backend's own
/// public client id, and passing it is what makes Google mint an ID token
/// *audienced to GloboExpats* — the backend rejects tokens issued for anyone
/// else, so a token lifted from another app is useless here.
///
/// Wrapped behind an interface so tests can drive the flow without a real
/// Google account or a platform channel.
/// Turns a native Google sign-in failure into something actionable.
///
/// Google Play Services reports native setup problems as a PlatformException
/// whose code is the only thing that says WHAT is misconfigured, and there is
/// no other channel that carries it — a generic "could not be completed"
/// makes an unregistered signing certificate indistinguishable from a dead
/// network, so the cause is mapped here instead of being swallowed.
///
/// `ApiException: 10` (DEVELOPER_ERROR) is the one that bites during setup:
/// Google refused to mint a token because this build's package name +
/// signing SHA-1 are not registered as an Android OAuth client in the same
/// Google Cloud project as the configured server client id.
String googleFailureMessage(Object e) {
  final text = e.toString();
  if (text.contains('invalid_audience')) {
    return 'Google sign-in is being configured for this iPhone. Please try '
        'again after the GloboExpats team has completed the update.';
  }
  if (text.contains('ApiException: 10') || text.contains('DEVELOPER_ERROR')) {
    return 'Google rejected this build (DEVELOPER_ERROR). The app\'s package '
        'name and signing certificate are not registered as an Android OAuth '
        'client in the same Google project as the server client id.';
  }
  if (text.contains('ApiException: 12501') ||
      text.contains('SIGN_IN_CANCELLED')) {
    return 'Google sign-in was cancelled.';
  }
  if (text.contains('ApiException: 7') || text.contains('NETWORK_ERROR')) {
    return 'No connection to Google. Check the network and try again.';
  }
  return 'Google sign-in could not be completed: $text';
}

abstract class GoogleAuthenticator {
  /// The signed-in user's ID token, or null when they backed out.
  Future<String?> signInAndGetIdToken();

  /// Forgets the Google account so the next sign-in shows the picker again.
  Future<void> signOut();
}

class GoogleSignInAuthenticator implements GoogleAuthenticator {
  GoogleSignInAuthenticator({GoogleSignIn? client})
      : _client = client ??
            GoogleSignIn(
              scopes: const ['email', 'profile'],
              clientId: defaultTargetPlatform == TargetPlatform.iOS &&
                      AppConfig.googleIosClientId.isNotEmpty
                  ? AppConfig.googleIosClientId
                  : null,
              serverClientId: AppConfig.googleServerClientId.isEmpty
                  ? null
                  : AppConfig.googleServerClientId,
            );

  final GoogleSignIn _client;

  @override
  Future<String?> signInAndGetIdToken() async {
    final account = await _client.signIn();
    if (account == null) return null; // dismissed the picker
    final auth = await account.authentication;
    return auth.idToken;
  }

  @override
  Future<void> signOut() => _client.signOut();
}
