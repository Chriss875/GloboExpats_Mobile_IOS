import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../theme.dart';
import '../widgets/account_ui.dart';
import '../widgets/error_text.dart';
import '../widgets/navigation_boundary.dart';
import '../widgets/seller_verification_gate.dart' show isVerifiedAccountDetails;
import '../widgets/skeleton_loader.dart';
import 'otp_input.dart';

/// Account verification — web `/account/verification`: a status card for a
/// verified, pending or follow-up account, and otherwise the same short
/// conversation as the web. Organization member? → work email (a one-time
/// code) or, without one, buyer or seller → the seller's three questions
/// (where they heard of us, business or personal, what they will sell),
/// submitted to POST `/api/v1/seller-verification`.
class VerificationHubScreen extends StatefulWidget {
  const VerificationHubScreen({super.key, this.api});
  final ApiClient? api;
  @override
  State<VerificationHubScreen> createState() => _VerificationHubScreenState();
}

enum _Step {
  organization,
  workEmail,
  organizationEmail,
  role,
  buyer,
  referral,
  sellerType,
  details,
}

/// Web `referralOptions` (lib/seller-verification.ts).
const _referralOptions = [
  ('FRIEND_REFERRAL', 'Friend / Referral', 'Someone you know recommended us',
      Icons.people_alt_outlined),
  ('SOCIAL_MEDIA', 'Social Media',
      'Instagram, Facebook, LinkedIn, or another platform', Icons.public_rounded),
  ('GLOBOEXPATS_OUTREACH', 'GloboExpats Outreach',
      'Our team contacted you or shared a campaign', Icons.campaign_outlined),
  ('COMMUNITY_ORGANIZATION', 'Community / Organization',
      'An embassy, agency, NGO, or professional community',
      Icons.apartment_rounded),
  ('EVENT', 'Event', 'A market, meetup, or community event',
      Icons.event_outlined),
  ('OTHER', 'Other', 'A different source', Icons.more_horiz_rounded),
];

/// Web `isLikelyPersonalEmail`: a personal inbox cannot fast-track, so it is
/// sent to the seller review instead of an OTP that proves nothing.
const _personalEmailDomains = [
  'gmail.com', 'googlemail.com', 'yahoo.', 'hotmail.', 'icloud.com',
  'outlook.', 'live.', 'msn.', 'tutamail.', 'tutanota.', 'tuta.', 'aol.',
  'protonmail.', 'mail.com', 'zoho.',
];

bool _likelyPersonalEmail(String email) {
  final domain = email.trim().toLowerCase().split('@').last;
  return _personalEmailDomains
      .any((p) => domain.startsWith(p) || domain.contains(p));
}

class _Loaded {
  const _Loaded(this.application, this.me);
  final Map<String, dynamic>? application;
  final Map<String, dynamic>? me;
}

class _VerificationHubScreenState extends State<VerificationHubScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();
  late Future<_Loaded> _future = _load();

  _Step _step = _Step.organization;
  bool _busy = false;
  String? _error;

  String? _referral;
  String? _sellerType;
  final _referralOther = TextEditingController();
  final _sellerName = TextEditingController();
  final _productTypes = TextEditingController();
  final _followUp = TextEditingController();

  final _orgName = TextEditingController();
  final _orgEmail = TextEditingController();
  bool _otpSent = false;
  String _otp = '';

  String get _accountEmail => AuthStore.instance?.email ?? '';

  @override
  void dispose() {
    for (final c in [
      _referralOther, _sellerName, _productTypes, _followUp, _orgName, _orgEmail
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<_Loaded> _load() async {
    final token = AuthStore.instance?.token;
    if (token == null) return const _Loaded(null, null);
    final results = await Future.wait<Object?>([
      _api.fetchSellerVerification(token),
      _api
          .getUserDetails(token)
          .then<Map<String, dynamic>?>((v) => v)
          .catchError((Object _) => null),
    ]);
    final raw = results[0] as Map<String, dynamic>;
    final app = (raw['application'] ?? raw['data']?['application'])
        as Map<String, dynamic>?;
    final me = results[1] as Map<String, dynamic>?;
    if (me != null && _orgName.text.isEmpty) {
      _orgName.text = (me['organization'] ?? '').toString();
    }
    return _Loaded(app, me);
  }

  void _reload() => setState(() {
        _future = _load();
        _busy = false;
      });

  void _go(_Step step) => setState(() {
        _step = step;
        _error = null;
      });

  String _statusOf(Map<String, dynamic>? app) =>
      ((app?['reviewStatus'] ?? app?['status'] ?? '')).toString().toUpperCase();

  // ---- actions ---------------------------------------------------------------

  Future<void> _submit(Map<String, dynamic>? me) async {
    final token = AuthStore.instance?.token;
    final name = _sellerName.text.trim();
    final products = _productTypes.text.trim();
    if (token == null || _referral == null || _sellerType == null) return;
    if (_referral == 'OTHER' && _referralOther.text.trim().isEmpty) {
      setState(() => _error = 'Tell us where you heard about GloboExpats.');
      return;
    }
    if (name.isEmpty) {
      setState(() => _error = _sellerType == 'BUSINESS'
          ? 'Business name is required for a business account.'
          : 'Your full name is required.');
      return;
    }
    if (products.length < 3) {
      setState(() => _error =
          'Please describe what you plan to sell (at least a few characters).');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _api.submitSellerVerification(token, {
        'referralSource': _referral,
        if (_referral == 'OTHER') 'referralOther': _referralOther.text.trim(),
        'sellerType': _sellerType,
        if (_sellerType == 'BUSINESS') 'businessName': name,
        if (_sellerType == 'PERSONAL') 'fullName': name,
        'productTypes': products,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Application received. The GloboExpats team will review your seller details.')));
      _reload();
    } on ApiException catch (e) {
      if (e.unauthorized) AuthStore.instance?.handleUnauthorized();
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Could not submit the application. Please try again.';
        });
      }
    }
  }

  Future<void> _sendFollowUp(Map<String, dynamic> app) async {
    final token = AuthStore.instance?.token;
    final requestId = (app['requestId'] as num?)?.toInt();
    final answer = _followUp.text.trim();
    if (token == null) return;
    if (answer.isEmpty) {
      setState(() => _error = 'Please write your response.');
      return;
    }
    if (requestId == null) {
      setState(() => _error = 'This application cannot accept a response right now.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _api.respondToSellerVerification(token, requestId, answer);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Response submitted — your application is back in review.')));
      _followUp.clear();
      _reload();
    } on ApiException catch (e) {
      if (e.unauthorized) AuthStore.instance?.handleUnauthorized();
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Could not send your response. Please try again.';
        });
      }
    }
  }

  Future<void> _sendCode() async {
    final token = AuthStore.instance?.token;
    final email = _orgEmail.text.trim();
    if (token == null) return;
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
      setState(() => _error = 'Enter a valid work email, the one your organization issued.');
      return;
    }
    if (_likelyPersonalEmail(email)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'That looks like a personal email — no problem, continue with the seller review instead.')));
      _go(_Step.role);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final org = _orgName.text.trim();
      if (org.isNotEmpty) {
        // Best effort, like the web: the code still goes out if this fails.
        try {
          await _api.editProfile(token, {'organization': org});
        } catch (_) {}
      }
      await _api.sendOrganizationEmailOtp(token, email);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _otpSent = true;
        _otp = '';
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Code sent. Check your work inbox and spam folder.')));
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Could not send the code. Please try again in a moment.';
        });
      }
    }
  }

  Future<void> _verifyCode() async {
    if (_otp.length != 6) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await _api.verifyOrganizationEmailOtp(_orgEmail.text.trim(), _otp);
      if (!mounted) return;
      if (r.verified) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Work email verified. Your seller access is now unlocked.')));
        ApiClient.invalidateReads('user-details');
        _reload();
      } else {
        setState(() {
          _busy = false;
          _error = r.message.isNotEmpty ? r.message : 'The code did not work. Check it and try again.';
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Could not verify the code. Please try again.';
        });
      }
    }
  }

  // ---- layout ----------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    // The /sell gate redirects here, replacing its route, so there is often
    // nothing underneath to pop back to — without an explicit fallback the
    // screen dead-ends with neither a back button nor the bottom nav.
    return NavigationBoundary(
      fallbackLocation: '/account',
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Verification'),
          leading: IconButton(
            tooltip: 'Back',
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: () =>
                NavigationBoundary.back(context, fallbackLocation: '/account'),
          ),
        ),
        body: FutureBuilder<_Loaded>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const FeedSkeleton(itemCount: 3);
            }
            if (snap.hasError) {
              return Center(
                  child: ErrorText(
                      error: snap.error,
                      context: 'Could not load your verification.'));
            }
            return AccountFormTheme(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                children: [
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppPalette.of(context).surface,
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: AppPalette.of(context).border),
                    ),
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 220),
                      child: KeyedSubtree(
                        key: ValueKey('${_step.name}-$_otpSent'),
                        child: _content(snap.data!),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'Your details are used only for account safety and seller review.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 12,
                        color: AppPalette.of(context).textSecondary),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _content(_Loaded data) {
    final signedOut = !(AuthStore.instance?.isAuthenticated ?? false);
    final app = data.application;
    final status = _statusOf(app);
    final appVerified = status == 'VERIFIED' || status == 'NATURAL_VERIFIED';
    // Web: both records must agree. An open application overrides a stale
    // verified session, and an account without an application falls back to
    // the account's own status.
    final accountVerified =
        data.me == null ? appVerified : isVerifiedAccountDetails(data.me);
    final verified = accountVerified && (app == null || appVerified);

    if (signedOut) {
      return _StatusView(
        icon: Icons.verified_outlined,
        tone: _Tone.info,
        label: 'Account',
        title: 'Sign in to continue',
        description:
            'Verification is connected securely to your GloboExpats account.',
        primaryLabel: 'Sign in',
        onPrimary: () =>
            context.push('/login?returnUrl=/account/verification'),
      );
    }
    if (verified) {
      return _StatusView(
        icon: Icons.verified_rounded,
        tone: _Tone.verified,
        label: 'Verified',
        title: 'Your account is verified',
        description:
            'You can buy, contact members, and use GloboExpats seller features.',
        primaryLabel: 'Go to marketplace',
        onPrimary: () => context.push('/browse'),
      );
    }
    if (status == 'PENDING') {
      return _StatusView(
        icon: Icons.schedule_rounded,
        tone: _Tone.pending,
        label: 'Pending Review',
        title: 'Your seller application is with our team',
        description: app?['applicantResponse'] != null
            ? 'We received your answer and notified the GloboExpats review team. Your application is back in review.'
            : 'We saved your details and notified the GloboExpats admin team. You cannot submit another application while this one is pending.',
        detail: (app?['businessName'] ?? app?['fullName'])?.toString(),
        email: (app?['loggingEmail'] ?? _accountEmail).toString(),
        primaryLabel: 'Continue browsing',
        onPrimary: () => context.push('/browse'),
      );
    }
    if (status == 'REJECTED' || status == 'BLOCKED') {
      final note = (app?['reviewNote'] as String?)?.trim() ?? '';
      if (note.isNotEmpty) return _followUpView(app!, note);
      return _StatusView(
        icon: Icons.refresh_rounded,
        tone: _Tone.needsInfo,
        label: 'Needs Information',
        title: 'Your application needs a follow-up',
        description:
            'Please contact the GloboExpats team so we can clarify the details needed to finish your review.',
        email: (app?['loggingEmail'] ?? _accountEmail).toString(),
        primaryLabel: 'Contact support',
        onPrimary: () => context.push('/contact'),
        secondaryLabel: 'Back to marketplace',
        onSecondary: () => context.push('/browse'),
      );
    }
    return _conversation(data.me);
  }

  Widget _conversation(Map<String, dynamic>? me) {
    Widget panel({
      _Step? back,
      required String eyebrow,
      required String title,
      required String description,
      required List<Widget> children,
    }) =>
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (back != null) _BackLink(onTap: () => _go(back)),
            StepHeader(eyebrow: eyebrow, title: title, description: description),
            const SizedBox(height: 20),
            for (final (i, c) in children.indexed) ...[
              if (i > 0) const SizedBox(height: 10),
              c,
            ],
          ],
        );

    switch (_step) {
      case _Step.organization:
        return panel(
          eyebrow: 'Let’s find the right path',
          title:
              'Are you part of an expatriate organization, international community, embassy, UN agency, humanitarian organization, or verified professional network?',
          description: 'This helps us choose the quickest verification option for you.',
          children: [
            ChoiceTile(
                key: const ValueKey('verify-org-yes'),
                title: 'Yes',
                description: 'I belong to an organization or verified community',
                icon: Icons.groups_outlined,
                onTap: () => _go(_Step.workEmail)),
            ChoiceTile(
                key: const ValueKey('verify-org-no'),
                title: 'No',
                description: 'I am joining independently',
                icon: Icons.check_rounded,
                onTap: () => _go(_Step.role)),
          ],
        );
      case _Step.workEmail:
        return panel(
          back: _Step.organization,
          eyebrow: 'Organization verification',
          title: 'Do you have an organization or work email?',
          description:
              'A work email gives you the fastest path. If you do not have one, you can still apply as a seller.',
          children: [
            ChoiceTile(
                key: const ValueKey('verify-work-email-yes'),
                title: 'Yes, I have a work email',
                description: 'Send a one-time verification code',
                icon: Icons.mark_email_read_outlined,
                onTap: () => _go(_Step.organizationEmail)),
            ChoiceTile(
                title: 'No, I do not have one',
                description: 'Continue with the alternative onboarding flow',
                icon: Icons.check_rounded,
                onTap: () => _go(_Step.role)),
          ],
        );
      case _Step.organizationEmail:
        return _otpSent ? _codeEntry() : _workEmailForm();
      case _Step.role:
        return panel(
          back: _Step.organization,
          eyebrow: 'How will you use GloboExpats?',
          title:
              'Are you registering as a vendor/seller on GloboExpats, or are you joining as a buyer?',
          description:
              'Buyers can shop without vendor verification. Sellers complete one short review.',
          children: [
            ChoiceTile(
                key: const ValueKey('verify-role-seller'),
                title: 'Vendor / Seller',
                description: 'I want to list products or personal items',
                icon: Icons.storefront_outlined,
                onTap: () => _go(_Step.referral)),
            ChoiceTile(
                key: const ValueKey('verify-role-buyer'),
                title: 'Buyer',
                description: 'I want to discover and buy items',
                icon: Icons.shopping_bag_outlined,
                onTap: () => _go(_Step.buyer)),
          ],
        );
      case _Step.buyer:
        return panel(
          back: _Step.role,
          eyebrow: 'You are ready',
          title: 'No vendor verification needed',
          description:
              'You can continue buying normally with your GloboExpats account. Seller verification is only required when you want to list items.',
          children: [
            _PrimaryButton(
                label: 'Browse the marketplace',
                onPressed: () => context.push('/browse')),
            OutlinedButton(
              onPressed: () => context.go('/'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
              ),
              child: const Text('Return to homepage'),
            ),
          ],
        );
      case _Step.referral:
        return panel(
          back: _Step.role,
          eyebrow: 'A little context',
          title: 'Where did you hear about GloboExpats?',
          description:
              'Your answer helps us understand and support our seller community.',
          children: [
            for (final (value, label, detail, icon) in _referralOptions)
              ChoiceTile(
                  key: ValueKey('verify-referral-$value'),
                  compact: true,
                  title: label,
                  description: detail,
                  icon: icon,
                  onTap: () {
                    _referral = value;
                    _go(_Step.sellerType);
                  }),
          ],
        );
      case _Step.sellerType:
        final fullName = [me?['firstName'], me?['lastName']]
            .where((v) => (v ?? '').toString().trim().isNotEmpty)
            .join(' ');
        return panel(
          back: _Step.referral,
          eyebrow: 'About your listings',
          title:
              'Do you own a store or business, or are you selling personal items?',
          description: 'Choose the option that best describes what you plan to list.',
          children: [
            ChoiceTile(
                key: const ValueKey('verify-type-business'),
                title: 'Store or business',
                description:
                    'I sell products through a registered or trading business',
                icon: Icons.business_rounded,
                onTap: () {
                  _sellerType = 'BUSINESS';
                  _sellerName.text = '';
                  _go(_Step.details);
                }),
            ChoiceTile(
                key: const ValueKey('verify-type-personal'),
                title: 'Personal items',
                description: 'I am selling items that belong to me',
                icon: Icons.person_outline_rounded,
                onTap: () {
                  _sellerType = 'PERSONAL';
                  _sellerName.text = fullName;
                  _go(_Step.details);
                }),
          ],
        );
      case _Step.details:
        final business = _sellerType == 'BUSINESS';
        final palette = AppPalette.of(context);
        return panel(
          back: _Step.sellerType,
          eyebrow: 'Final step',
          title: business
              ? 'Tell us about your business'
              : 'Tell us what you plan to sell',
          description:
              'We will use these details only to review your seller access.',
          children: [
            if (_referral == 'OTHER')
              TextField(
                controller: _referralOther,
                decoration: const InputDecoration(
                    labelText: 'Where did you hear about us?',
                    hintText: 'Tell us briefly'),
              ),
            TextField(
              key: const ValueKey('verify-seller-name'),
              controller: _sellerName,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(
                labelText: business ? 'Business name' : 'Official / full name',
                prefixIcon: Icon(business
                    ? Icons.business_rounded
                    : Icons.person_outline_rounded),
              ),
            ),
            TextField(
              key: const ValueKey('verify-products'),
              controller: _productTypes,
              minLines: 3,
              maxLines: 5,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'What products do you intend to sell?',
                hintText:
                    'For example: fresh groceries, furniture, clothing, or electronics',
                alignLabelWithHint: true,
              ),
            ),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: palette.surfaceMuted,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: palette.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('ACCOUNT EMAIL',
                      style: TextStyle(
                          fontSize: 11,
                          letterSpacing: 0.6,
                          fontWeight: FontWeight.w700,
                          color: palette.textSecondary)),
                  const SizedBox(height: 4),
                  Text(_accountEmail,
                      style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: palette.textPrimary)),
                  const SizedBox(height: 2),
                  Text('We use the email already connected to your account.',
                      style: TextStyle(
                          fontSize: 12, color: palette.textSecondary)),
                ],
              ),
            ),
            if (_error != null) _ErrorBox(_error!),
            _PrimaryButton(
              key: const ValueKey('verify-submit'),
              label: 'Submit for review',
              busy: _busy,
              onPressed: () => _submit(me),
            ),
            Text(
              'One application at a time. You will see its status here while our team reviews it.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: palette.textSecondary),
            ),
          ],
        );
    }
  }

  Widget _workEmailForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _BackLink(onTap: () => _go(_Step.workEmail)),
        const _IconTile(Icons.verified_user_outlined),
        const SizedBox(height: 14),
        const StepHeader(
          eyebrow: 'Fast-track verification',
          title: 'Verify your work email',
          description:
              'We will send a one-time code. Your personal account email stays unchanged.',
        ),
        const SizedBox(height: 20),
        TextField(
          controller: _orgName,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
              labelText: 'Organization or office',
              hintText: 'e.g. UNICEF, Embassy, NGO',
              prefixIcon: Icon(Icons.apartment_rounded)),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('org-email-field'),
          controller: _orgEmail,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          decoration: const InputDecoration(
              labelText: 'Work email',
              hintText: 'name@organization.org',
              prefixIcon: Icon(Icons.mail_outline_rounded)),
        ),
        if (_error != null) ...[const SizedBox(height: 12), _ErrorBox(_error!)],
        const SizedBox(height: 16),
        _PrimaryButton(
            key: const ValueKey('org-send-otp-btn'),
            label: 'Send verification code',
            busy: _busy,
            onPressed: _sendCode),
        const SizedBox(height: 6),
        TextButton(
          onPressed: () => _go(_Step.role),
          child: Text('I cannot use a work email',
              style: TextStyle(color: AppPalette.of(context).textSecondary)),
        ),
      ],
    );
  }

  Widget _codeEntry() {
    final palette = AppPalette.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _IconTile(Icons.mail_outline_rounded),
        const SizedBox(height: 14),
        StepHeader(
          eyebrow: 'Check your inbox',
          title: 'Enter your verification code',
          description: 'We sent a 6-digit code to ${_orgEmail.text.trim()}.',
        ),
        const SizedBox(height: 20),
        OtpBoxField(
          autofocusFirst: true,
          enabled: !_busy,
          onChanged: (v) => setState(() => _otp = v),
          onCompleted: (v) => setState(() => _otp = v),
        ),
        if (_error != null) ...[const SizedBox(height: 12), _ErrorBox(_error!)],
        const SizedBox(height: 16),
        _PrimaryButton(
            key: const ValueKey('org-verify-btn'),
            label: 'Verify work email',
            busy: _busy,
            onPressed: _otp.length == 6 ? _verifyCode : null),
        const SizedBox(height: 6),
        Row(children: [
          TextButton(
            onPressed: _busy
                ? null
                : () => setState(() {
                      _otpSent = false;
                      _error = null;
                    }),
            child: Text('Change email',
                style: TextStyle(color: palette.textSecondary)),
          ),
          const Spacer(),
          TextButton(
            onPressed: _busy ? null : _sendCode,
            child: const Text('Resend code'),
          ),
        ]),
      ],
    );
  }

  Widget _followUpView(Map<String, dynamic> app, String note) {
    final palette = AppPalette.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const StepHeader(
          eyebrow: 'Needs information',
          title: 'The GloboExpats team needs more information',
          description: 'Answer the question below to continue your application.',
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: palette.warningFill,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: palette.warningBorder),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.chat_bubble_outline_rounded,
                size: 18, color: palette.warningText),
            const SizedBox(width: 10),
            Expanded(
              child: Text(note,
                  style: TextStyle(
                      fontSize: 13.5,
                      height: 1.4,
                      color: palette.warningTextStrong)),
            ),
          ]),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _followUp,
          minLines: 3,
          maxLines: 6,
          decoration: const InputDecoration(
              labelText: 'Your response',
              hintText: 'Answer the question above to continue your application.',
              alignLabelWithHint: true),
        ),
        if (_error != null) ...[const SizedBox(height: 12), _ErrorBox(_error!)],
        const SizedBox(height: 16),
        _PrimaryButton(
            label: 'Submit response',
            busy: _busy,
            onPressed: () => _sendFollowUp(app)),
      ],
    );
  }
}

enum _Tone { verified, pending, needsInfo, info }

/// Web `StatusView`: a toned icon tile, a status pill, title, explanation,
/// the details on file and the next step.
class _StatusView extends StatelessWidget {
  const _StatusView({
    required this.icon,
    required this.tone,
    required this.label,
    required this.title,
    required this.description,
    required this.primaryLabel,
    required this.onPrimary,
    this.email,
    this.detail,
    this.secondaryLabel,
    this.onSecondary,
  });
  final IconData icon;
  final _Tone tone;
  final String label;
  final String title;
  final String description;
  final String? email;
  final String? detail;
  final String primaryLabel;
  final VoidCallback onPrimary;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    final (fill, border, ink) = switch (tone) {
      _Tone.verified => (p.successFill, p.successBorder, p.successText),
      _Tone.pending => (p.warningFill, p.warningBorder, p.warningText),
      _Tone.needsInfo => (p.dangerFill, p.dangerBorder, p.dangerText),
      _Tone.info => (p.infoFill, p.infoBorder, p.accentInk),
    };
    final hasDetail = (detail ?? '').trim().isNotEmpty;
    final hasEmail = (email ?? '').trim().isNotEmpty;
    return Column(children: [
      Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: border),
        ),
        child: Icon(icon, size: 28, color: ink),
      ),
      const SizedBox(height: 14),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: border),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w700, color: ink)),
      ),
      const SizedBox(height: 14),
      Text(title,
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 21,
              height: 1.3,
              fontWeight: FontWeight.w800,
              color: p.textPrimary)),
      const SizedBox(height: 8),
      Text(description,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13.5, height: 1.45, color: p.textSecondary)),
      if (hasDetail || hasEmail) ...[
        const SizedBox(height: 16),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: p.surfaceMuted,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: p.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (hasDetail)
                Text(detail!,
                    style: TextStyle(
                        fontWeight: FontWeight.w700, color: p.textPrimary)),
              if (hasEmail)
                Text(email!,
                    style: TextStyle(fontSize: 13, color: p.textSecondary)),
            ],
          ),
        ),
      ],
      const SizedBox(height: 20),
      _PrimaryButton(label: primaryLabel, onPressed: onPrimary),
      if (secondaryLabel != null && onSecondary != null) ...[
        const SizedBox(height: 10),
        OutlinedButton(
          onPressed: onSecondary,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(50),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          child: Text(secondaryLabel!),
        ),
      ],
    ]);
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton(
      {super.key, required this.label, required this.onPressed, this.busy = false});
  final String label;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) => FilledButton(
        onPressed: busy ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brandBlue,
          minimumSize: const Size.fromHeight(50),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: busy
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2.2))
            : Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
      );
}

class _BackLink extends StatelessWidget {
  const _BackLink({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: TextButton.icon(
            key: const ValueKey('verify-back'),
            onPressed: onTap,
            style: TextButton.styleFrom(
              foregroundColor: AppPalette.of(context).textSecondary,
              padding: EdgeInsets.zero,
              visualDensity: VisualDensity.compact,
            ),
            icon: const Icon(Icons.arrow_back_rounded, size: 17),
            label: const Text('Back'),
          ),
        ),
      );
}

class _IconTile extends StatelessWidget {
  const _IconTile(this.icon);
  final IconData icon;

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            color: AppPalette.of(context).infoFill,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Icon(icon, color: AppPalette.of(context).accentInk),
        ),
      );
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox(this.message);
  final String message;

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: p.dangerFill,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: p.dangerBorder),
      ),
      child: Text(message,
          style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: p.dangerTextStrong)),
    );
  }
}
