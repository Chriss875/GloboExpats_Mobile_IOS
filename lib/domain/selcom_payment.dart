/// Selcom mobile-wallet payment (USSD push) — port of web
/// `hooks/use-selcom-wallet-payment.ts` and the validation inside
/// `components/checkout/mobile-wallet-payment.tsx`.
///
/// The buyer confirms their wallet number, a PIN prompt is pushed to that
/// phone, and the order confirms itself once the PIN is entered. No
/// screenshot and no manual verification — that path stays for bank
/// transfers.
///
/// Why the app polls: Selcom's webhook fires only on SUCCESS and lands on the
/// backend, not in the app. Polling the status endpoint is the only way the
/// buyer learns about a rejection promptly rather than waiting out a timeout.
library;

enum SelcomOutcome {
  /// Paid — the order is confirmed.
  success,

  /// Gateway-side cancellation or expiry; nothing the buyer did.
  failed,

  /// The wallet rejected it, or the buyer cancelled on their phone.
  declined,

  /// The bounded poll expired with no terminal state.
  timeout,
}

/// First check soon after the push (the buyer may cancel instantly), then
/// steady.
const Duration selcomFirstPoll = Duration(seconds: 2);
const Duration selcomPollInterval = Duration(seconds: 3);

/// Give up polling after this long without a terminal status.
///
/// The web waits 45s, but its buyer approves on a phone while the page stays
/// open. On mobile the buyer has to LEAVE the app — open the Selcom App or
/// answer the USSD prompt, sign in, approve — which routinely takes longer;
/// at 45s the app gave up on payments that then succeeded. Returning to the
/// app also triggers an immediate check (checkout's lifecycle observer).
const Duration selcomPollTimeout = Duration(minutes: 3);

/// Selcom `payment_status` → what the buyer should see. Their docs spell the
/// same state differently per endpoint (USERCANCELLED / USERCANCELED), so
/// match on letters only. Null means "keep waiting" (PENDING / INPROGRESS).
SelcomOutcome? outcomeFromState(Object? state) {
  final key =
      (state?.toString() ?? '').toUpperCase().replaceAll(RegExp(r'[^A-Z]'), '');
  switch (key) {
    case 'COMPLETED':
    case 'COMPLETE':
    case 'SUCCESS':
      return SelcomOutcome.success;
    // The wallet rejected the request; do not infer a reason Selcom did not
    // provide.
    case 'REJECTED':
    case 'FAILED':
    case 'USERCANCELLED':
    case 'USERCANCELED':
      return SelcomOutcome.declined;
    case 'CANCELLED':
    case 'CANCELED':
      return SelcomOutcome.failed;
    default:
      return null;
  }
}

/// A wallet pull can sit at PENDING forever. Once the bounded poll expires,
/// show the neutral failure explanation rather than guessing why the wallet
/// never returned a final state (web `resultPageForOutcome`).
SelcomOutcome? resolvedOutcome(SelcomOutcome? outcome) =>
    outcome == SelcomOutcome.timeout ? SelcomOutcome.failed : outcome;

/// Tanzanian mobile: `0[67]xxxxxxxx` or `255[67]xxxxxxxx`.
bool isValidTzMobile(String? raw) {
  final digits = (raw ?? '').replaceAll(RegExp(r'\D'), '');
  return RegExp(r'^(0|255)[67]\d{8}$').hasMatch(digits);
}

/// `0712 345 678` for display, from any of 0712…, 255712…, +255712….
String displayWalletPhone(String? raw) {
  final digits = (raw ?? '').replaceAll(RegExp(r'\D'), '');
  final local = digits.startsWith('255') ? '0${digits.substring(3)}' : digits;
  final match = RegExp(r'^(\d{4})(\d{3})(\d{3})$').firstMatch(local);
  return match == null
      ? local
      : '${match.group(1)} ${match.group(2)} ${match.group(3)}';
}

/// Networks reachable through Selcom's USSD push (web `WALLET_PROVIDERS`).
const List<({String name, String operator})> kWalletProviders = [
  (name: 'M-Pesa', operator: 'Vodacom'),
  (name: 'Mixx by Yas', operator: 'Yas'),
  (name: 'Airtel Money', operator: 'Airtel'),
  (name: 'HaloPesa', operator: 'Halotel'),
];

/// The two ways a Selcom request reaches the buyer (web `SelcomPushChannel`).
/// Both use the same Selcom order and the same status poll; they differ only
/// in the endpoint and in where the buyer approves it.
enum SelcomPushChannel {
  /// A USSD PIN prompt from the buyer's mobile-money network
  /// (`/pay/selcom/wallet-push`).
  mobileWallet,

  /// An in-app request inside the Selcom Wallet app
  /// (`/pay/selcom/selcom-pesa-push`).
  selcomPesa,
}

/// The payment-method id that selects each channel on the Payment step.
const String kMobileWalletMethod = 'MOBILE_MONEY';
const String kSelcomPesaMethod = 'SELCOM_PESA';

SelcomPushChannel? channelForMethod(String? method) =>
    switch ((method ?? '').toUpperCase()) {
      kMobileWalletMethod => SelcomPushChannel.mobileWallet,
      kSelcomPesaMethod => SelcomPushChannel.selcomPesa,
      _ => null,
    };

/// Methods the buyer completes inside the app — no screenshot, no manual
/// verification (web `AUTOMATED_METHODS`).
bool isAutomatedPaymentMethod(String? method) =>
    channelForMethod(method) != null;

/// What a finished wallet payment shows at Checkout Step 04 — web
/// `PaymentResultKind`. A timeout is not its own kind: it resolves to
/// [failed] through [resolvedOutcome].
enum PaymentResultKind { success, failed, declined }

PaymentResultKind? resultKindFor(SelcomOutcome? outcome) =>
    switch (resolvedOutcome(outcome)) {
      SelcomOutcome.success => PaymentResultKind.success,
      SelcomOutcome.failed => PaymentResultKind.failed,
      SelcomOutcome.declined => PaymentResultKind.declined,
      _ => null,
    };

/// Web `payment-result-screen.tsx` COPY, word for word.
({String title, String body, String cta}) paymentResultCopy(
        PaymentResultKind kind) =>
    switch (kind) {
      PaymentResultKind.success => (
          title: 'Payment successful',
          body: 'Your payment has been received and your order is confirmed. '
              'The seller has been notified and will confirm availability '
              'shortly - we will keep you posted.',
          cta: 'Continue shopping',
        ),
      PaymentResultKind.failed => (
          title: "We couldn't confirm your payment",
          body: 'We did not receive a final response from your mobile money '
              'provider. Please check your mobile money messages before trying '
              'again. Your invoice is still reserved.',
          cta: 'Try again',
        ),
      PaymentResultKind.declined => (
          title: 'Your mobile money payment was declined',
          body: 'Your mobile money provider did not approve the request. '
              'Please review the message from your provider and try again when '
              'you are ready.',
          cta: 'Try again',
        ),
    };

/// Web `use-proforma.ts` RESUME_TIMEOUT_MS: how long reopening an invoice may
/// take before the retry screen replaces the "Loading your invoice" spinner.
const Duration proformaResumeTimeout = Duration(seconds: 12);
const String proformaResumeTimeoutMessage =
    'Loading your invoice is taking longer than expected. Please try again.';
