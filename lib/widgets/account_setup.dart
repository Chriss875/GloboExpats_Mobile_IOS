import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../domain/account_setup.dart';
import '../domain/international_phone.dart';
import '../screens/addresses_screen.dart' show showAddressEditorSheet;
import '../storage/kv_store.dart';
import '../theme.dart';
import 'phone_number_field.dart';

/// The mobile answer to the web's setup popups: the same three things (a
/// WhatsApp number, a pinned location, a payout method for sellers) as a
/// checklist the user can finish from wherever they meet it — the Account
/// tab, a one-off welcome sheet after signing in, or the step of the sell
/// flow that needs it. Each step opens its own small sheet in place, so
/// nobody is sent off to a settings page and left to find their way back.

// ---- copy -------------------------------------------------------------------

class _StepCopy {
  const _StepCopy(this.title, this.reason, this.icon);
  final String title;
  final String reason;
  final IconData icon;
}

_StepCopy _copy(SetupStep step, AccountSetupStatus s) => switch (step) {
      SetupStep.whatsapp => const _StepCopy(
          'WhatsApp number',
          'So buyers, sellers and our team can reach you about orders.',
          Icons.phone_iphone_rounded),
      SetupStep.location => s.unpinnedAddress != null
          ? const _StepCopy(
              'Pin your location',
              'Drop a pin on your saved address for accurate delivery.',
              Icons.place_outlined)
          : const _StepCopy(
              'Your location',
              'Your pickup and delivery point. Fills checkout for you.',
              Icons.place_outlined),
      SetupStep.workingHours => const _StepCopy(
          'Working hours',
          'When you accept orders, so buyers get delivery times you can keep.',
          Icons.schedule_rounded),
      SetupStep.payout => const _StepCopy(
          'Payout method',
          'Where we send the money from your sales.',
          Icons.account_balance_wallet_outlined),
    };

// ---- running a step ---------------------------------------------------------

/// Opens whatever finishes [step], then re-reads the checklist. True when the
/// step is now done.
Future<bool> runSetupStep(
  BuildContext context,
  SetupStep step, {
  required ApiClient api,
  required String token,
}) async {
  final setup = AccountSetup.instance;
  final status = setup.status ?? const AccountSetupStatus();
  switch (step) {
    case SetupStep.whatsapp:
      final saved = await showWhatsAppSheet(context,
          api: api, token: token, initial: status.whatsapp);
      if (saved == null) return false;
    case SetupStep.location:
      final saved = await showAddressEditorSheet(
        context,
        api: api,
        token: token,
        existing: status.unpinnedAddress,
        // The account's first location is its default.
        makeDefault: true,
      );
      if (!saved) return false;
      setup.markLocation();
    case SetupStep.workingHours:
      await GoRouter.of(context).push('/account/working-hours');
    case SetupStep.payout:
      await GoRouter.of(context).push('/account/payout-details');
  }
  final fresh = await setup.refresh(api, token);
  return fresh?.isDone(step) ?? true;
}

/// What is wrong with a number from [PhoneNumberField], or null when it can
/// be saved.
String? whatsAppNumberError(String value) {
  final v = value.trim();
  if (v.isEmpty) return 'Enter your WhatsApp number.';
  if (!v.startsWith('+')) return 'Choose your country code.';
  if (!isValidInternationalPhone(v)) {
    return 'That number looks incomplete. Check the country code and digits.';
  }
  return null;
}

/// A bottom sheet that adds or changes the profile's WhatsApp number and
/// saves it straight away. Resolves to the saved `+…` number, or null.
Future<String?> showWhatsAppSheet(
  BuildContext context, {
  required ApiClient api,
  required String token,
  String? initial,
  String? reason,
}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _WhatsAppSheet(
        api: api, token: token, initial: initial ?? '', reason: reason),
  );
}

class _WhatsAppSheet extends StatefulWidget {
  const _WhatsAppSheet({
    required this.api,
    required this.token,
    required this.initial,
    this.reason,
  });
  final ApiClient api;
  final String token;
  final String initial;
  final String? reason;

  @override
  State<_WhatsAppSheet> createState() => _WhatsAppSheetState();
}

class _WhatsAppSheetState extends State<_WhatsAppSheet> {
  late String _value = widget.initial;
  String? _error;
  bool _saving = false;

  Future<void> _save() async {
    if (_saving) return;
    final error = whatsAppNumberError(_value);
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    final number = normalizeInternationalPhone(_value);
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      // Only this field: the backend leaves every field it is not sent alone.
      await widget.api.editProfile(widget.token, {'whatsAppPhoneNumber': number});
      AccountSetup.instance.markWhatsApp(number);
      if (mounted) Navigator.of(context).pop(number);
    } on ApiException catch (e) {
      if (e.unauthorized) AuthStore.instance?.handleUnauthorized();
      if (mounted) {
        setState(() {
          _saving = false;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = 'Could not save your number. Check your connection and try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final changing = widget.initial.trim().isNotEmpty;
    return Padding(
      padding: EdgeInsets.only(
          bottom: math.max(MediaQuery.of(context).viewInsets.bottom,
              MediaQuery.of(context).padding.bottom)),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          key: const ValueKey('whatsapp-sheet'),
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            _IconBadge(icon: Icons.phone_iphone_rounded, color: palette.accentInk),
            const SizedBox(height: 12),
            Text(changing ? 'Change your WhatsApp number' : 'Add your WhatsApp number',
                style: TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                    color: palette.textPrimary)),
            const SizedBox(height: 6),
            Text(
              widget.reason ??
                  'Buyers and sellers use it to reach you, and our team uses '
                      'it to sort out order and delivery issues quickly.',
              style: TextStyle(
                  fontSize: 13.5, height: 1.4, color: palette.textSecondary),
            ),
            const SizedBox(height: 18),
            PhoneNumberField(
              initialValue: widget.initial,
              autofocus: true,
              errorText: _error,
              helperText:
                  'Pick the country your WhatsApp is registered in. International numbers work.',
              onChanged: (v) => setState(() {
                _value = v;
                _error = null;
              }),
              onSubmitted: _save,
            ),
            const SizedBox(height: 18),
            FilledButton(
              key: const ValueKey('whatsapp-sheet-save'),
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brandBlue,
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
              ),
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2.4))
                  : const Text('Save number',
                      style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );
  }
}

// ---- the checklist ----------------------------------------------------------

/// "Finish setting up" — the checklist card at the top of the Account tab.
/// Hidden entirely once every step is done (or before the first read lands).
class AccountSetupCard extends StatefulWidget {
  const AccountSetupCard({super.key, required this.api, required this.token});
  final ApiClient api;
  final String token;

  @override
  State<AccountSetupCard> createState() => _AccountSetupCardState();
}

class _AccountSetupCardState extends State<AccountSetupCard> {
  @override
  void initState() {
    super.initState();
    unawaited(AccountSetup.instance.refresh(widget.api, widget.token,
        maxAge: const Duration(seconds: 30)));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AccountSetup.instance,
      builder: (context, _) {
        final s = AccountSetup.instance.status;
        if (s == null || s.complete) return const SizedBox.shrink();
        final palette = AppPalette.of(context);
        return Padding(
          padding: const EdgeInsets.only(bottom: 20),
          child: Container(
            key: const ValueKey('account-setup-card'),
            decoration: BoxDecoration(
              color: palette.surface,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: palette.infoBorder),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  color: palette.infoFill,
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                  child: _ChecklistHeader(status: s),
                ),
                AccountSetupSteps(
                    status: s, api: widget.api, token: widget.token),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _ChecklistHeader extends StatelessWidget {
  const _ChecklistHeader({required this.status});
  final AccountSetupStatus status;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final left = status.missing.length;
    return Row(children: [
      _ProgressRing(done: status.doneCount, total: status.steps.length),
      const SizedBox(width: 14),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Finish setting up your account',
                style: TextStyle(
                    fontSize: 15.5,
                    fontWeight: FontWeight.w800,
                    color: palette.textPrimary)),
            const SizedBox(height: 2),
            Text(
                left == 1
                    ? '1 step left, and you are ready to buy and sell.'
                    : '$left quick steps, and you are ready to buy and sell.',
                style: TextStyle(fontSize: 12.5, color: palette.textSecondary)),
          ],
        ),
      ),
    ]);
  }
}

/// The step rows, shared by the Account card and the welcome sheet. Done
/// steps stay listed with a tick, so progress is visible.
class AccountSetupSteps extends StatefulWidget {
  const AccountSetupSteps({
    super.key,
    required this.status,
    required this.api,
    required this.token,
  });
  final AccountSetupStatus status;
  final ApiClient api;
  final String token;

  @override
  State<AccountSetupSteps> createState() => _AccountSetupStepsState();
}

class _AccountSetupStepsState extends State<AccountSetupSteps> {
  /// Guards against a second tap opening a second sheet.
  SetupStep? _running;

  Future<void> _run(SetupStep step) async {
    if (_running != null) return;
    setState(() => _running = step);
    try {
      await runSetupStep(context, step, api: widget.api, token: widget.token);
    } finally {
      if (mounted) setState(() => _running = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final s = widget.status;
    final steps = s.steps;
    return Column(children: [
      for (var i = 0; i < steps.length; i++) ...[
        if (i > 0) Divider(height: 1, indent: 64, color: palette.border),
        _StepRow(
          step: steps[i],
          copy: _copy(steps[i], s),
          done: s.isDone(steps[i]),
          onTap: () => _run(steps[i]),
        ),
      ],
    ]);
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({
    required this.step,
    required this.copy,
    required this.done,
    required this.onTap,
  });
  final SetupStep step;
  final _StepCopy copy;
  final bool done;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return InkWell(
      key: ValueKey('account-setup-${step.name}'),
      onTap: done ? null : onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Row(children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: done ? palette.successFill : palette.infoFill,
            ),
            child: Icon(done ? Icons.check_rounded : copy.icon,
                size: 20,
                color: done ? palette.successText : palette.accentInk),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(copy.title,
                    style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: done ? palette.textSecondary : palette.textPrimary,
                        decoration: done ? TextDecoration.lineThrough : null,
                        decorationColor: palette.textMuted)),
                if (!done) ...[
                  const SizedBox(height: 2),
                  Text(copy.reason,
                      style: TextStyle(
                          fontSize: 12.5,
                          height: 1.3,
                          color: palette.textSecondary)),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (done)
            Text('Done',
                style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: palette.successText))
          else
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.brandBlue,
                borderRadius: BorderRadius.circular(999),
              ),
              child: const Text('Add',
                  style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: BrandStage.ink)),
            ),
        ]),
      ),
    );
  }
}

class _ProgressRing extends StatelessWidget {
  const _ProgressRing({required this.done, required this.total});
  final int done;
  final int total;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return SizedBox(
      width: 46,
      height: 46,
      child: Stack(alignment: Alignment.center, children: [
        SizedBox.expand(
          child: CircularProgressIndicator(
            value: total == 0 ? 0 : done / total,
            strokeWidth: 4.5,
            strokeCap: StrokeCap.round,
            backgroundColor: palette.infoBorder,
            valueColor: const AlwaysStoppedAnimation(AppColors.brandBlue),
          ),
        ),
        Text('$done/$total',
            style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w800,
                color: palette.textPrimary)),
      ]),
    );
  }
}

class _IconBadge extends StatelessWidget {
  const _IconBadge({required this.icon, required this.color});
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: AppPalette.of(context).infoFill,
        ),
        child: Icon(icon, color: color, size: 22),
      );
}

// ---- the one-off welcome sheet ----------------------------------------------

/// After signing in, an account with steps missing is offered the checklist
/// once — a sheet the user can put off, never a wall. "Later" rests it for a
/// few days; the Account card and the sell flow still cover it meanwhile.
class AccountSetupNudge {
  AccountSetupNudge._();

  static const Duration snooze = Duration(days: 3);

  /// Off under widget tests unless a test turns it on, like the welcome guide.
  static bool? debugEnabled;
  static bool get enabled =>
      debugEnabled ??
      !WidgetsBinding.instance.runtimeType
          .toString()
          .contains('TestWidgetsFlutterBinding');
  static String _key(String who) => 'account_setup_snoozed_until:$who';

  /// Accounts already offered the sheet in this app session.
  static final Set<String> _shownThisSession = {};

  @visibleForTesting
  static void debugReset() => _shownThisSession.clear();

  static bool _snoozed(String who) {
    final until = int.tryParse(KvStore.instance.getString(_key(who)) ?? '');
    return until != null && until > DateTime.now().millisecondsSinceEpoch;
  }

  static Future<void> _rest(String who) => KvStore.instance.setString(
      _key(who), '${DateTime.now().add(snooze).millisecondsSinceEpoch}');

  /// Shows the sheet when this account is missing its WhatsApp number, its
  /// location or (for a seller) its working hours or payout details.
  ///
  /// [freshSignIn] is a user who has just logged in: they are reminded every
  /// time, whatever "later" said. Reopening the app on a saved session
  /// respects the rest period instead, so it does not nag on every launch.
  static Future<void> maybeShow(
      BuildContext context, ApiClient api, String token, String who,
      {bool freshSignIn = false}) async {
    // A new login is always worth one reminder — even after logging out and
    // back in without closing the app. Otherwise once per app session.
    if (freshSignIn) {
      _shownThisSession.remove(who);
    } else if (_shownThisSession.contains(who) || _snoozed(who)) {
      return;
    }
    final status = await AccountSetup.instance.refresh(api, token,
        maxAge: const Duration(seconds: 30));
    if (status == null || status.complete || !context.mounted) return;
    if (_shownThisSession.contains(who)) return;
    _shownThisSession.add(who);
    final finished = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _WelcomeSetupSheet(api: api, token: token),
    );
    if (finished != true) await _rest(who);
  }

  /// Right after a listing goes live — the moment a seller's payout details
  /// and working hours start to matter (web shows its seller setup popups
  /// after the first listing). Reads afresh, since publishing is what made
  /// the account a seller, and ignores the rest period.
  static Future<void> afterListing(
      NavigatorState navigator, ApiClient api, String token) async {
    if (!enabled) return;
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!navigator.mounted) return;
    final status = await AccountSetup.instance.refresh(api, token);
    if (status == null || status.complete || !navigator.mounted) return;
    await showModalBottomSheet<bool>(
      context: navigator.context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          _WelcomeSetupSheet(api: api, token: token, afterListing: true),
    );
  }
}

class _WelcomeSetupSheet extends StatelessWidget {
  const _WelcomeSetupSheet(
      {required this.api, required this.token, this.afterListing = false});
  final ApiClient api;
  final String token;

  /// Opened by a freshly published listing: says why now.
  final bool afterListing;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return SafeArea(
      child: ListenableBuilder(
        listenable: AccountSetup.instance,
        builder: (context, _) {
          final s = AccountSetup.instance.status ?? const AccountSetupStatus();
          final allDone = s.complete;
          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
              key: const ValueKey('account-setup-welcome'),
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(children: [
                  _ProgressRing(done: s.doneCount, total: s.steps.length),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                        allDone
                            ? 'You are all set'
                            : afterListing
                                ? 'Your listing is live — now get ready to sell'
                                : 'Let’s finish setting up your account',
                        style: TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                            color: palette.textPrimary)),
                  ),
                ]),
                const SizedBox(height: 10),
                Text(
                  allDone
                      ? 'Buyers can reach you, and checkout and selling will fill in your details.'
                      : afterListing
                          ? 'Add where your earnings go and when you can handle '
                              'orders, so a buyer’s order reaches you and you get paid.'
                          : 'A couple of details so buyers can reach you, deliveries find you '
                              'and forms fill themselves. Each one takes a moment.',
                  style: TextStyle(
                      fontSize: 13.5, height: 1.4, color: palette.textSecondary),
                ),
                const SizedBox(height: 14),
                Container(
                  decoration: BoxDecoration(
                    color: palette.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: palette.border),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: AccountSetupSteps(status: s, api: api, token: token),
                ),
                const SizedBox(height: 16),
                if (allDone)
                  FilledButton(
                    key: const ValueKey('account-setup-welcome-done'),
                    onPressed: () => Navigator.of(context).pop(true),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brandBlue,
                      minimumSize: const Size.fromHeight(50),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                    child: const Text('Start exploring',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                  )
                else
                  Center(
                    child: TextButton(
                      key: const ValueKey('account-setup-welcome-later'),
                      onPressed: () => Navigator.of(context).pop(false),
                      child: Text('I’ll do this later',
                          style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: palette.textSecondary)),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
