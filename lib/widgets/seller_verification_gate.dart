import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import 'skeleton_loader.dart';

/// Web parity for the seller-verification check used to gate `/sell` — the
/// RouteGuard `requireVerification="sell"` rule (web components/route-guard.tsx
/// checkVerification + canUserSell). Only a VERIFIED / NATURAL_VERIFIED
/// application may create listings.
///
/// The backend's compact answer is `{ application: { reviewStatus: ... } }`;
/// the hub screen reads the same two fallbacks (`reviewStatus` / `status`).
bool isVerifiedSellerApplication(Map<String, dynamic>? application) {
  if (application == null) return false;
  final status = ((application['reviewStatus'] ?? application['status'] ?? ''))
      .toString()
      .trim()
      .toUpperCase();
  return status == 'VERIFIED' || status == 'NATURAL_VERIFIED';
}

/// Unwraps `{ application: ... }` (or `{ data: { application: ... } }`) from
/// `fetchSellerVerification` and applies [isVerifiedSellerApplication].
bool isVerifiedSellerResponse(Map<String, dynamic>? body) {
  if (body == null) return false;
  final data = body['data'];
  final dataMap = data is Map ? data.cast<String, dynamic>() : null;
  final candidate =
      body['application'] ?? dataMap?['application'] ?? dataMap ?? body;
  return isVerifiedSellerApplication(
      candidate is Map ? candidate.cast<String, dynamic>() : null);
}

/// The second way the web answers "can this account sell": the user record
/// itself, not the seller application (web `lib/verification-utils.ts`
/// isAccountVerified + `hooks/use-auth.ts` canUserSell, which passes when
/// EITHER source says yes).
///
/// This matters for accounts verified without an application row on file —
/// against the application endpoint alone they look unverified, which wrongly
/// bounced verified sellers out of the sell wizard.
bool isVerifiedAccountDetails(Map<String, dynamic>? user) {
  if (user == null) return false;

  // An explicit backend status is the source of truth, exactly as on the web:
  // a role must never paper over a PENDING verification.
  final explicit = (user['backendVerificationStatus'] ??
          user['sellerVerificationStatus'] ??
          user['verificationStatus'])
      ?.toString()
      .trim()
      .toUpperCase();
  if (explicit != null && explicit.isNotEmpty && explicit != 'NULL') {
    // `verificationStatus` is an object on some payloads; fall through to the
    // flag checks below when it did not stringify to a status word.
    if (explicit == 'VERIFIED' || explicit == 'NATURAL_VERIFIED') return true;
    if (!explicit.startsWith('{') && !explicit.startsWith('_')) return false;
  }

  final status = user['verificationStatus'];
  final statusMap = status is Map ? status.cast<String, dynamic>() : null;
  return statusMap?['isFullyVerified'] == true ||
      statusMap?['isOrganizationEmailVerified'] == true ||
      statusMap?['canSell'] == true ||
      user['isVerified'] == true ||
      user['verified'] == true;
}

/// Route guard around the sell wizard (web parity SELLWI-01): while the current
/// verification state loads it shows `Verifying seller permissions...`; an
/// unverified seller is toasted with the RouteGuard copy and sent to
/// `/account/verification` instead of the wizard.
class SellerVerificationGate extends StatefulWidget {
  final Widget child;
  final AuthStore? auth;
  final ApiClient? api;
  const SellerVerificationGate(
      {super.key, required this.child, this.auth, this.api});

  @override
  State<SellerVerificationGate> createState() => _SellerVerificationGateState();
}

class _SellerVerificationGateState extends State<SellerVerificationGate> {
  late final AuthStore _auth = widget.auth ?? AuthStore.instance!;
  late final ApiClient _api = widget.api ?? ApiClient();
  bool _checked = false;
  bool _verified = false;

  @override
  void initState() {
    super.initState();
    _run();
  }

  Future<void> _run() async {
    var verified = false;
    final token = _auth.token;
    if (token != null && token.isNotEmpty) {
      try {
        final body = await _api.fetchSellerVerification(token);
        verified = isVerifiedSellerResponse(body);
      } catch (_) {
        // Network/API failure is treated as unverified — the wizard must not
        // be reachable when the gate cannot confirm the seller is verified.
        // The web RouteGuard behaves the same way (checkVerification throws
        // -> blocked). The account check below is still allowed to clear it.
        verified = false;
      }
      // Web parity `canUserSell`: the account's own verification counts too,
      // so an account with no seller application on file (or an endpoint that
      // just failed) is not bounced when the user record says verified.
      if (!verified) {
        try {
          verified = isVerifiedAccountDetails(await _api.getUserDetails(token));
        } catch (_) {
          verified = false;
        }
      }
    }
    if (!mounted) return;
    setState(() {
      _checked = true;
      _verified = verified;
    });
    if (!verified) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Verification Required — Please verify your account to list items for sale.'),
        ));
        // Web parity: router.push('/account/verification'). `go` rather than
        // pushReplacement because /sell is a shell route and the hub is not —
        // replacing across that boundary left the hub with nothing to pop back
        // to and no bottom navigation either.
        try {
          GoRouter.of(context).go('/account/verification');
          return;
        } catch (_) {
          // Plain-Navigator test hosts (no GoRouter) fall through.
        }
        Navigator.of(context).pushReplacementNamed('/account/verification');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_checked) {
      // Web RouteGuard loadingMessage="Verifying seller permissions...".
      return const Scaffold(
        body: SkeletonPage(),
      );
    }
    if (!_verified) {
      // Momentary frame before the post-frame redirect above fires.
      return const Scaffold(
        body: SkeletonPage(),
      );
    }
    return widget.child;
  }
}
