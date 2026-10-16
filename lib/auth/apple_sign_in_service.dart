import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

/// Whether the native Apple authorization sheet is meaningful on this build.
bool get appleSignInSupported =>
    !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

/// The one-time values returned by Apple's native authorization sheet.
///
/// [rawNonce] is sent to the backend, which hashes it and requires the result
/// to match the signed token's nonce claim. This prevents a captured identity
/// token from being replayed against GloboExpats.
class AppleSignInPayload {
  const AppleSignInPayload({
    required this.identityToken,
    required this.authorizationCode,
    required this.rawNonce,
    this.email,
    this.firstName,
    this.lastName,
  });

  final String identityToken;
  final String authorizationCode;
  final String rawNonce;
  final String? email;
  final String? firstName;
  final String? lastName;
}

abstract class AppleAuthenticator {
  /// Returns null only when the person deliberately closes Apple's sheet.
  Future<AppleSignInPayload?> signIn();
}

class NativeAppleAuthenticator implements AppleAuthenticator {
  const NativeAppleAuthenticator();

  @override
  Future<AppleSignInPayload?> signIn() async {
    final rawNonce = _randomNonce();
    final hashedNonce = sha256.convert(utf8.encode(rawNonce)).toString();

    try {
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: const [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
        nonce: hashedNonce,
      );
      final identityToken = credential.identityToken;
      if (identityToken == null || identityToken.isEmpty) {
        throw StateError('Apple returned no identity token.');
      }
      return AppleSignInPayload(
        identityToken: identityToken,
        authorizationCode: credential.authorizationCode,
        rawNonce: rawNonce,
        email: credential.email,
        firstName: credential.givenName,
        lastName: credential.familyName,
      );
    } on SignInWithAppleAuthorizationException catch (error) {
      if (error.code == AuthorizationErrorCode.canceled) return null;
      rethrow;
    }
  }
}

String appleFailureMessage(Object error) {
  if (error is SignInWithAppleAuthorizationException) {
    switch (error.code) {
      case AuthorizationErrorCode.canceled:
        return 'Sign in with Apple was cancelled.';
      case AuthorizationErrorCode.notHandled:
      case AuthorizationErrorCode.notInteractive:
        return 'Sign in with Apple is temporarily unavailable. Try again.';
      case AuthorizationErrorCode.failed:
      case AuthorizationErrorCode.invalidResponse:
      case AuthorizationErrorCode.credentialExport:
      case AuthorizationErrorCode.credentialImport:
      case AuthorizationErrorCode.matchedExcludedCredential:
      case AuthorizationErrorCode.unknown:
        return 'Apple could not verify this sign-in. Please try again.';
    }
  }
  return 'Sign in with Apple could not be completed.';
}

String _randomNonce([int length = 32]) {
  const alphabet =
      '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
  final random = Random.secure();
  return List.generate(
    length,
    (_) => alphabet[random.nextInt(alphabet.length)],
  ).join();
}
