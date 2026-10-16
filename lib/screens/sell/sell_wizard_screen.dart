import 'package:go_router/go_router.dart';
import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show Uint8List;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_picker/image_picker.dart';

import '../../api/api_client.dart';
import '../../auth/auth_store.dart';
import '../../domain/commission_calculator.dart' show currentCommissionRates;
import '../../domain/listing_events.dart';
import '../../domain/delivery_fare.dart';
import '../../domain/image_upload.dart';
import '../../domain/product_choices.dart';
import '../../domain/currency.dart';
import '../../domain/phone_display.dart';
import '../../domain/saved_address.dart';
import '../../domain/request_nudge_intent.dart';
import '../../models/category.dart';
import '../../models/sell_form_state.dart';
import '../../storage/kv_store.dart';
import '../../theme.dart';
import '../../widgets/account_setup.dart' show AccountSetupNudge, showWhatsAppSheet;
import '../../widgets/scroll_reveal.dart';
import '../addresses_screen.dart' show showAddressEditorSheet;
import '../../widgets/skeleton_loader.dart';
import 'product_choice_editor.dart';

/// Sell — the 4-stage listing wizard (web `/sell`, SELL_FLOW_SPEC §2):
/// Details → Photos → Pricing → Review, per-step validation, free jump via
/// Review "Edit" chips, publish sequence post-product(main image) → image
/// batches of 5 → quantity PATCH. Reports real results only.
class SellWizardScreen extends StatefulWidget {
  const SellWizardScreen({super.key, this.auth, this.api});
  final AuthStore? auth;
  final ApiClient? api;

  @override
  State<SellWizardScreen> createState() => _SellWizardScreenState();
}

class _SellWizardScreenState extends State<SellWizardScreen> {
  late final AuthStore _auth = widget.auth ?? AuthStore.instance!;
  late final ApiClient _api = widget.api ?? ApiClient();
  final _form = GlobalKey<FormState>();
  final KvStore _kv = KvStore.instance;

  final SellFormState state = SellFormState();
  int _step = 1;

  /// Web `STEP_TITLES` — what the phone-width step card names each step.
  static const _stepTitles = [
    'Basic Details',
    'Photos & Description',
    'Pricing',
    'Review & Publish'
  ];

  List<Category> _categories = const [];
  bool _loadingCat = true;
  bool _restoringDraft = true;
  // AU-040: flips exactly once when the draft restore settles, forcing one
  // form rebuild so TextFormField.initialValue picks up restored values.
  bool _draftRestored = false;
  // AU-040 C2: bumped when a restore lands so the keyed subtree is recreated
  // and every TextFormField re-reads state via initialValue/controller.
  int _restoreTick = 0;
  String? _stepError; // inline red banner under the offending step

  /// The form's own scroll position. A step used to open wherever the
  /// previous one had been scrolled to, and the error banner sits at the top
  /// of the form while the button that raises it is at the bottom — so both
  /// fixes are the same move: go back to the start.
  final ScrollController _formScroll = ScrollController();
  bool _publishing = false;
  bool _allowExit = false;
  String? _publishError;
  String? _publishStage;
  int _uploadedImages = 0;
  int _totalImages = 0;

  /// Web parity `getPendingRequestNudgeIntent` (app/sell/page.tsx:361-379):
  /// a "respond to this request" intent saved by the request board before
  /// entering /sell. When present the wizard prefills title/description/street,
  /// shows the 'Request match ready' toast and — after the listing is live —
  /// auto-sends the nudge and returns to the request.
  PendingRequestNudgeIntent? _nudgeIntent;

  /// Decode a stored JSON string into the intent; invalid/empty -> null.
  static PendingRequestNudgeIntent? _decodeIntent(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      return PendingRequestNudgeIntent.fromJson(
          jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  bool _nudgeToastShown = false;

  /// Set once the listing has been created; the draft is finished with.
  bool _published = false;

  @override
  void dispose() {
    // SellFormState owns a 3-second autosave debounce. Nothing disposed it,
    // so the timer outlived the screen. Cancelling it outright would drop
    // the last few seconds of the draft, so flush first, then dispose.
    // Not after a publish: the listing is live, and saving it here brought
    // it straight back as the next listing's draft.
    if (_userEdited && !_published) {
      unawaited(state.saveDraft(_kv).catchError((_) {}));
    }
    state.dispose();
    _formScroll.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _api.fetchCategories().then((c) {
      if (!mounted) return;
      setState(() {
        _categories = c;
        _loadingCat = false;
      });
      // A request-nudge intent may name a category — only actionable once the
      // taxonomy has arrived (web applies it in the same mount effect).
      _prefillFromNudge();
    }).catchError((_) {
      if (mounted) setState(() => _loadingCat = false);
    });
    _loadWhatsappFromProfile();
    _refreshCommissionRates();
    // Draft restore only when the title is empty (never clobbers a fresh edit).
    //
    // AU-040 C2 root cause (browser-proven): on web, KvStore is already
    // loaded at initState time, so loadDraft resolves in a microtask — and
    // ScaffoldMessenger.of(context) inside that callback threw
    // (dependOnInheritedWidgetOfExactType during initState), which jumped to
    // catchError and left _restoringDraft=true forever: the form never built
    // with the restored values. Fix: defer the whole continuation past the
    // first frame, set the flag via setState, and show the SnackBar only
    // after the build (post-frame) using the mounted messenger.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        // Read synchronously too: on web, SharedPreferences.getInstance() has
        // long resolved by now, so a direct getString sees persisted state
        // without any await timing subtleties.
        _nudgeIntent =
            _decodeIntent(_kv.getString(PendingRequestNudgeIntent.kvKey));
        final syncRaw = _kv.getString('sell_form_draft');
        final Map<String, dynamic>? syncMap =
            (syncRaw == null || syncRaw.isEmpty)
                ? null
                : () {
                    try {
                      return jsonDecode(syncRaw) as Map<String, dynamic>;
                    } catch (_) {
                      return null;
                    }
                  }();
        var d = syncMap ?? await SellFormState.loadDraft(_kv);
        if (!mounted) return;
        // A draft written for another server or account is not this seller's
        // work — restoring it brought back someone else's address and pin.
        if (d != null && !SellFormState.draftBelongsHere(d)) {
          d = null;
          unawaited(SellFormState.clearDraft(_kv));
        }
        // AU-040 C2 web-proven race: the debounced autosave fires ~3s into
        // live typing; a restore that lands AFTER that would flip the
        // KeyedSubtree key mid-keystroke, remounting the field and eating
        // input ('GateProbe7' -> 'Gat'). Only restore when the user has NOT
        // started editing this session.
        if (!_userEdited &&
            d != null &&
            (d['title'] as String? ?? '').isNotEmpty) {
          state.restoreFromDraft(d);
          if (!mounted) return;
          setState(() {
            _draftRestored = true;
            _restoreTick++;
          });
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:
                Text('Draft restored. Images will need to be re-uploaded.'),
          ));
        }
        if (mounted) setState(() => _restoringDraft = false);
        // SELLWI-02: request-nudge prefill — only fills fields the draft (or a
        // fresh session) left empty, exactly like web's intent effect.
        _prefillFromNudge();
      } catch (_) {
        if (mounted) setState(() => _restoringDraft = false);
      }
    });
  }

  /// Applies any pending request-nudge intent to fields the seller has not
  /// already filled (title/description/street/category), then surfaces web's
  /// 'Request match ready' toast once. Idempotent — safe to call again when the
  /// category taxonomy arrives late.
  void _prefillFromNudge() {
    final intent = _nudgeIntent;
    if (intent == null || !mounted) return;
    var applied = false;
    if (state.title.trim().isEmpty && intent.requestTitle.isNotEmpty) {
      state.title = titleFromRequestTitle(intent.requestTitle);
      applied = true;
    }
    if (state.description.trim().isEmpty && intent.message.isNotEmpty) {
      state.description =
          'Posted in response to request: "${intent.requestTitle}"\n\n${intent.message}';
      applied = true;
    }
    if (state.street.trim().isEmpty && (intent.location?.isNotEmpty ?? false)) {
      state.street = intent.location!;
      applied = true;
    }
    if (state.categoryId == null && (intent.category?.isNotEmpty ?? false)) {
      final match = intent.category!.trim().toLowerCase();
      for (final c in _categories) {
        if (c.categoryName.trim().toLowerCase() == match) {
          state.setCategory(
            id: c.categoryId,
            name: c.categoryName,
            commissionRate: c.commissionRate,
            slug: c.slug,
          );
          applied = true;
          break;
        }
      }
    }
    if (!applied) return;
    setState(() {});
    if (!_nudgeToastShown) {
      _nudgeToastShown = true;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text(
            'Request match ready — post the listing and the nudge is sent automatically.'),
      ));
    }
  }

  /// Web parity `app/sell/page.tsx`: `phoneToUse = user.whatsAppPhoneNumber ||
  /// user.phoneNumber; if (phoneToUse && !formData.whatsappNumber) …` - the
  /// listing's WhatsApp number is a read-only reflection of the seller's own
  /// profile value, never typed here. The `state.whatsappNumber.isEmpty`
  /// check happens at assignment time (not before the fetch starts) so it
  /// never overwrites a value a restored draft already set, whichever finishes first.
  ///
  /// [fromProfile] re-reads after the seller has been to Settings: the
  /// profile is the source of truth, so its number replaces whatever the
  /// wizard was holding — before, a number added there never reached the
  /// open wizard and step 1 kept saying none was found.
  Future<void> _loadWhatsappFromProfile({bool fromProfile = false}) async {
    final token = _auth.token;
    if (token == null) return;
    try {
      final profile = await _api.getUserDetails(token);
      final phone = (profile['whatsAppPhoneNumber'] ?? '').toString().trim();
      if (!mounted || phone.isEmpty) return;
      if (!fromProfile && state.whatsappNumber.isNotEmpty) return;
      if (phone == state.whatsappNumber) return;
      setState(() {
        state.whatsappNumber = phone;
        if (_stepError == kSellMissingWhatsAppError) _stepError = null;
      });
      state.scheduleDraftSave(_kv);
    } catch (_) {
      // Enhancement only - the field simply stays blank on failure.
    }
  }

  /// The one detail step 1 cannot fill by itself: ask for it here, save it
  /// to the profile, and carry on with the listing.
  Future<void> _askForWhatsApp() async {
    final token = _auth.token;
    if (token == null) return;
    final saved = await showWhatsAppSheet(
      context,
      api: _api,
      token: token,
      initial: state.whatsappNumber,
      reason: 'Buyers message you on it about this listing. It is saved to '
          'your profile, so you only do this once.',
    );
    if (saved == null || !mounted) return;
    setState(() {
      state.whatsappNumber = saved;
      if (_stepError == kSellMissingWhatsAppError) _stepError = null;
    });
    _changed();
  }

  /// Back from Profile Settings: pick up whatever was changed there.
  void _returnedFromSettings() {
    unawaited(_loadWhatsappFromProfile(fromProfile: true));
  }

  Future<void> _refreshCommissionRates() async {
    final loaded =
        await _api.fetchPlatformCommissionSettings(token: _auth.token);
    if (!loaded || !mounted) return;
    final previousAmount =
        state.pricingForward ? state.sellerPayout : state.price;
    setState(() {
      state.rates = currentCommissionRates;
      if (previousAmount > 0) {
        state.setPricingAmount(previousAmount, forward: state.pricingForward);
      }
    });
  }

  bool _userEdited = false;

  void _changed() {
    _userEdited = true; // suppress any pending draft restore (C2 race)
    state.scheduleDraftSave(_kv);
    if (mounted) setState(() {});
  }

  Future<void> _goStep(int n) async {
    // Free jump from Review; forward moves validate the current step first.
    if (n > _step) {
      final err = state.validateStep(_step);
      if (err != null) {
        setState(() => _stepError = err);
        if (err == kSellMissingWhatsAppError) {
          // Everything else on the step is fine: ask for the number now.
          unawaited(_askForWhatsApp());
          return;
        }
        // The banner renders at the top of the form and the button that
        // failed is at the bottom, so without this the seller taps Next and
        // nothing appears to happen.
        scrollToStart(_formScroll);
        return;
      }
    }
    await state.saveDraft(_kv);
    if (!mounted) return;
    setState(() {
      _step = n.clamp(1, 4);
      _stepError = null;
    });
    // A new step starts at its beginning, not at the offset the previous one
    // happened to be left at.
    scrollToStart(_formScroll);
  }

  // ---- publish sequence (SELL_FLOW_SPEC §4) ---------------------------------

  Future<void> _publish() async {
    for (final s in [1, 2, 3]) {
      final err = state.validateStep(s);
      if (err != null) {
        setState(() => _stepError = err);
        if (err == kSellMissingWhatsAppError) {
          unawaited(_askForWhatsApp());
          return;
        }
        scrollToStart(_formScroll);
        return;
      }
    }
    // Web parity "Add at least one choice" publish guard: the seller
    // switched choices on but left every attribute empty.
    if (state.choiceConfiguration.hasChoices &&
        state.preparedChoiceConfiguration.attributes.isEmpty) {
      setState(() => _publishError =
          'Select available values or turn off product choices before publishing.');
      scrollToStart(_formScroll);
      return;
    }
    setState(() {
      _publishing = true;
      _publishError = null;
      _publishStage = 'Creating your listing…';
      _uploadedImages = 0;
      _totalImages = state.images.length;
    });
    final messenger = ScaffoldMessenger.of(context);
    try {
      final productJson = state.buildProductJson();
      final coverIndex = state.images.indexWhere((im) => im.isCover);
      final effectiveCoverIndex = coverIndex < 0 ? 0 : coverIndex;
      final cover = state.images[effectiveCoverIndex];
      // Original-state.images-index order the images end up in on the
      // server: cover first, then the rest in their existing order — needed
      // to resolve any choice value's authoring-time imageIndex afterwards.
      final restOriginalIndices = [
        for (var i = 0; i < state.images.length; i++)
          if (i != effectiveCoverIndex) i,
      ];
      final rest = [
        for (final i in restOriginalIndices)
          PendingImageRef(
              bytes: state.images[i].bytes, filename: state.images[i].name),
      ];

      // 1. post-product with the MAIN image only.
      final created = await _api.createListingMultipart(
          _auth.token!, productJson,
          mainImage: PendingImageRef(bytes: cover.bytes, filename: cover.name));

      final productId = (created['productId'] as num?)?.toInt() ??
          (created['data'] is Map
              ? ((created['data'] as Map)['productId'] as num?)?.toInt()
              : null);

      // SELLWI-09: a missing/zero product id means the backend never confirmed
      // the product. Web throws 'Product creation failed: No product ID
      // returned' into the publish-failed path (app/sell/page.tsx old
      // 1010-1014; today it toasts and sends the seller to check My Listings).
      // The mobile mirror reports failure and KEEPS the draft — never the old
      // 'Listing created.' + clearDraft + pop on a product that doesn't exist.
      if (productId == null || productId == 0) {
        if (!mounted) return;
        setState(() {
          _publishing = false;
          _publishStage = null;
          _publishError = 'Product creation failed: No product ID returned';
        });
        scrollToStart(_formScroll);
        return;
      }

      if (mounted) {
        setState(() {
          _uploadedImages = 1;
          _publishStage = rest.isEmpty
              ? 'Saving listing details…'
              : 'Uploading photos · 1 of $_totalImages';
        });
      }

      // 2. remaining images in batches of 5.
      var batchFailed = false;
      var quantityFailed = false;
      var choicesFailed = false;
      for (var i = 0; i < rest.length; i += 5) {
        final batch = rest.sublist(i, (i + 5).clamp(0, rest.length));
        try {
          await _api.addProductImages(_auth.token!, productId, batch);
          if (mounted) {
            setState(() {
              _uploadedImages =
                  (_uploadedImages + batch.length).clamp(0, _totalImages);
              _publishStage =
                  'Uploading photos · $_uploadedImages of $_totalImages';
            });
          }
        } on ApiException {
          batchFailed = true;
        }
      }
      // 4. quantity follow-up PATCH when ≠ 1 (backend workaround kept).
      if ((productJson['productQuantity'] as num?)?.toInt() != 1) {
        if (mounted) {
          setState(() => _publishStage = 'Saving stock information…');
        }
        try {
          await _api.updateListingQuantity(
              _auth.token!, productId, productJson['productQuantity'] as int);
        } on ApiException {
          quantityFailed = true;
        }
      }
      // 5. choice-value images (web parity: create-time payload never
      // carries images since the server URLs don't exist yet; once every
      // image is uploaded, re-fetch the saved order and PATCH the real
      // URLs onto whichever choice values referenced a pending image).
      if (hasVisualChoiceImages(state.preparedChoiceConfiguration)) {
        if (mounted) setState(() => _publishStage = 'Saving product choices…');
        try {
          final detail =
              await _api.fetchProductDetail(productId, token: _auth.token);
          final serverUrls = detail.productImages;
          final clientOrder = [effectiveCoverIndex, ...restOriginalIndices];
          if (serverUrls.length >= clientOrder.length) {
            final indexToUrl = <int, String>{
              for (var k = 0; k < clientOrder.length; k++)
                clientOrder[k]: serverUrls[k],
            };
            final resolved = resolveChoiceImageIndices(
                state.preparedChoiceConfiguration, indexToUrl);
            await _api.updateListing(_auth.token!, productId,
                {'choiceConfiguration': resolved.toJson()});
          }
        } catch (_) {
          choicesFailed = true;
        }
      }

      // 6. property photo groups (web 2026-10 organizeProductImages). Only
      // when the seller grouped something; the server keeps upload order
      // otherwise.
      var groupsFailed = false;
      if (state.groupsPhotos && state.photoGroups.isNotEmpty) {
        if (mounted) setState(() => _publishStage = 'Saving photo groups…');
        try {
          final detail =
              await _api.fetchProductDetail(productId, token: _auth.token);
          final clientOrder = [effectiveCoverIndex, ...restOriginalIndices];
          final refs = detail.imageRefs;
          if (refs.length >= clientOrder.length) {
            await _api.organizeProductImages(_auth.token!, productId, [
              for (var k = 0; k < clientOrder.length; k++)
                (
                  imageId: refs[k].imageId,
                  groupName: state.images[clientOrder[k]].groupName,
                ),
            ]);
          } else {
            groupsFailed = true;
          }
        } catch (_) {
          groupsFailed = true;
        }
      }

      _published = true;
      state.cancelPendingDraftSave();
      await SellFormState.clearDraft(_kv);
      // Home's rails and My Listings were loaded before this listing existed.
      ListingEvents.instance.changed();
      if (!mounted) return;
      // The listing is live: remind a seller still missing payout details or
      // working hours, over whichever page the wizard hands over to.
      unawaited(AccountSetupNudge.afterListing(
          Navigator.of(context, rootNavigator: true), _api, _auth.token!));
      final incomplete = <String>[
        if (batchFailed) 'some photos',
        if (quantityFailed) 'stock quantity',
        if (choicesFailed) 'choice photos',
        if (groupsFailed) 'photo groups',
      ];
      messenger.showSnackBar(SnackBar(
        duration: Duration(seconds: incomplete.isEmpty ? 4 : 10),
        content: Text(incomplete.isEmpty
            ? 'Listing published.'
            : 'Listing published, but ${incomplete.join(', ')} could not be saved. Open it from My Listings to finish.'),
      ));

      // SELLWI-02: a pending request nudge auto-sends now the listing is live
      // (web page.tsx:1116-1142). Both nudge outcomes clear the intent; the
      // listing itself is already live either way.
      final intent = _nudgeIntent;
      if (intent != null) {
        var sent = false;
        try {
          await _api.nudgeRequest(
            _auth.token!,
            intent.requestId,
            message: intent.message,
            nudgeType: intent.nudgeType ?? 'PRODUCT_MATCH',
            productId: productId,
          );
          sent = true;
        } catch (_) {/* listing IS live; the nudge just didn't send */}
        await _kv.remove(PendingRequestNudgeIntent.kvKey);
        if (!mounted) return;
        messenger.showSnackBar(SnackBar(
          content: Text(sent
              ? 'Nudge sent — your new listing was attached and sent to the requester.'
              : 'Listing posted, but the nudge could not be sent automatically. You can nudge the request manually.'),
        ));
        _exitAfterPublish(intent.returnTo?.isNotEmpty == true
            ? intent.returnTo!
            : '/request/${intent.requestId}');
        return;
      }

      _exitAfterPublish('/expat/dashboard?tab=selling&sub=listings');
    } on ApiException catch (e) {
      // ignore: discarded_futures
      AuthStore.instance?.handleUnauthorized();
      setState(() {
        _publishing = false;
        _publishStage = null;
        _publishError = e.message;
      });
      scrollToStart(_formScroll);
    } catch (e) {
      setState(() {
        _publishing = false;
        _publishStage = null;
        _publishError = 'Network error — your draft is saved. Try again.';
      });
      scrollToStart(_formScroll);
    }
  }

  /// Leaves the wizard after a successful publish. A request-nudge redirect
  /// targets `/request/{id}` (web `returnTo || /request/{id}`) through the
  /// router when one is present; otherwise the legacy pop-to-root. The
  /// try/catch keeps plain-Navigator test hosts (no GoRouter ancestor) on the
  /// pop path instead of throwing on `context.go`.
  void _exitAfterPublish(String? redirectPath) {
    if (redirectPath != null && redirectPath.isNotEmpty) {
      try {
        context.go(redirectPath);
        return;
      } catch (_) {
        // No GoRouter in the tree — fall through to the plain navigator pop.
      }
    }
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  // ---- image picking + compression (web canvas pipeline parity) --------------
  // AU-040 D1 fix: bytes end-to-end. compressWithFile throws UnimplementedError
  // on web ("method not support web") and dart:io has no files there, so the
  // old path produced paths no widget could paint. We now read bytes and
  // compress with compressWithList (canvas-backed, works on web + IO), keeping
  // PendingImage as pure bytes rendered via Image.memory.

  Future<void> _pickImages({ImageSource source = ImageSource.gallery}) async {
    final picker = ImagePicker();
    final List<XFile> picked;
    if (source == ImageSource.camera) {
      final image = await picker.pickImage(source: source, imageQuality: 100);
      picked = image == null ? const <XFile>[] : <XFile>[image];
    } else {
      picked = await picker.pickMultiImage(imageQuality: 100);
    }
    if (picked.isEmpty) return;
    // SELLWI-16: web caps at 30 images (the backend limit) — extra ones are
    // silently dropped at publish with a toast (app/sell/page.tsx:790-799) —
    // and refuses a cumulative compressed size over 100MB with its own toast
    // (page.tsx:553-558). The wizard enforces both up front so a publish never
    // exceeds the backend path.
    const maxBatch = 100 * 1024 * 1024; // 100 MB hard cap
    const maxImages = 30; // backend MAX_IMAGES
    final room = maxImages - state.images.length;
    if (room <= 0) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Too many photos — Backend allows up to 30 images. Extra images will be ignored.'),
        ));
      }
      return;
    }
    var total = 0;
    final kept = <PendingImage>[];
    String? rejectedName;
    String? unsupportedName;
    var tooMany = false;
    var overSize = false;
    for (final x in picked) {
      if (kept.length >= room) {
        tooMany = true;
        break;
      }
      // The SOURCE cap is 30MB, not the backend's 10MB: compression below
      // takes a 25MB camera original to a few hundred KB, so refusing it here
      // threw away photos that would have uploaded comfortably. What actually
      // has to clear 10MB is the COMPRESSED result, checked further down.
      if (await x.length() > kMaxSourceImageBytes) {
        rejectedName = x.name;
        continue;
      }
      Uint8List out;
      var name = x.name;
      try {
        final raw = await x.readAsBytes();
        out = await FlutterImageCompress.compressWithList(raw,
            minHeight: 1440,
            minWidth: 1440,
            quality: 82,
            format: CompressFormat.webp);
      } catch (_) {
        try {
          out = await x.readAsBytes();
        } catch (_) {
          continue;
        }
      }
      if (out.isEmpty) continue;
      // The part is validated on its Content-Type, which we read back off the
      // bytes — so the name has to describe what we are actually sending
      // (web does the same: the compressor returns `${baseName}.webp`).
      final mime = sniffImageMime(out);
      if (mime == null || !kAllowedUploadMimeTypes.contains(mime)) {
        // Compression fell through and left us something the backend will
        // refuse (a HEIC original, say). Better to say so now than to have
        // the publish fail on the last step.
        unsupportedName = x.name;
        continue;
      }
      name = renameForMime(name, mime);
      if (out.length > kMaxUploadImageBytes) {
        rejectedName = x.name;
        continue;
      }
      total += out.length;
      if (total > maxBatch) {
        overSize = true;
        break;
      }
      kept.add(PendingImage(name: name, bytes: out));
    }
    _changed();
    for (final im in kept) {
      state.addImage(im.name, im.bytes);
    }
    if (!mounted) return;
    if (tooMany) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text(
            'Too many photos — Backend allows up to 30 images. Extra images will be ignored.'),
      ));
    } else if (rejectedName != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
            '$rejectedName is over ${formatBytes(kMaxSourceImageBytes)} and was skipped.'),
      ));
    } else if (unsupportedName != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
            '$unsupportedName is not a JPEG, PNG or WebP photo and was skipped.'),
      ));
    }
    if (overSize) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
            'Total file size would exceed the 100MB upload limit. Please use smaller images or fewer images.'),
      ));
    }
  }

  Future<void> _chooseImages() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Align(
              alignment: Alignment.centerLeft,
              child: Text('Add product photos',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            ),
            const SizedBox(height: 12),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              subtitle: const Text('Use your camera now'),
              onTap: () => Navigator.pop(sheetContext, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              subtitle: const Text('Select one or several photos'),
              onTap: () => Navigator.pop(sheetContext, ImageSource.gallery),
            ),
          ]),
        ),
      ),
    );
    if (source != null && mounted) await _pickImages(source: source);
  }

  // ---- build ----------------------------------------------------------------

  Future<void> _handleSystemBack() async {
    if (_publishing) return;
    if (_step > 1) {
      await _goStep(_step - 1);
      return;
    }
    if (state.images.isNotEmpty) {
      final leave = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Leave this listing?'),
          content: const Text(
              'Your written draft is saved, but selected photos cannot be restored when you leave.'),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Keep editing')),
            FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Leave')),
          ],
        ),
      );
      if (leave != true || !mounted) return;
    }
    final router = GoRouter.maybeOf(context);
    if (router != null) {
      // Sell is a primary bottom-navigation destination. Even when GoRouter
      // reports a poppable shell route, popping it can remove the Android app
      // route. Step one therefore has one deterministic parent: Home.
      router.go('/');
      return;
    }
    setState(() => _allowExit = true);
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _allowExit,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _handleSystemBack();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: _step > 1 ? 'Previous step' : 'Back to home',
            onPressed: _publishing ? null : _handleSystemBack,
            icon: const Icon(Icons.arrow_back_rounded),
          ),
          title: const Text('Sell an item'),
        ),
        body: Theme(
          data: Theme.of(context).copyWith(
            inputDecorationTheme: InputDecorationTheme(
              filled: true,
              fillColor: AppPalette.of(context).background,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: AppPalette.of(context).border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: AppPalette.of(context).border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide:
                    const BorderSide(color: AppColors.brandBlue, width: 1.6),
              ),
            ),
          ),
          child: Form(
            key: _form,
            child: Column(children: [
              _ProgressHeader(step: _step, titles: _stepTitles),
              Expanded(
                child: _restoringDraft || _loadingCat
                    ? const SkeletonPage()
                    // AU-040 verifier fix: rebuild the form from scratch once the
                    // draft restore settles — TextFormField.initialValue is only
                    // applied at field creation, so a late restore otherwise leaves
                    // the visible field empty while state.title already holds the
                    // restored draft.
                    : ListView(
                        controller: _formScroll,
                        padding: const EdgeInsets.all(16),
                        children: [
                          KeyedSubtree(
                            key: ValueKey(
                                'sell-form-restored-$_draftRestored-$_restoreTick'),
                            // Stretch, because these were ListView children
                            // a moment ago and a Column would otherwise let
                            // every card shrink to its own width.
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  if (_stepError != null) ...[
                                    _SellErrorBanner(message: _stepError!),
                                    const SizedBox(height: 12),
                                  ],
                                  if (_publishError != null) ...[
                                    _SellErrorBanner(message: _publishError!),
                                    const SizedBox(height: 12),
                                  ],
                                  AnimatedSwitcher(
                                    duration: const Duration(milliseconds: 220),
                                    switchInCurve: Curves.easeOut,
                                    switchOutCurve: Curves.easeIn,
                                    transitionBuilder: (child, anim) =>
                                        FadeTransition(
                                      opacity: anim,
                                      child: SlideTransition(
                                        position: Tween<Offset>(
                                                begin: const Offset(0.03, 0),
                                                end: Offset.zero)
                                            .animate(anim),
                                        child: child,
                                      ),
                                    ),
                                    child: KeyedSubtree(
                                        key: ValueKey('sell-step-$_step'),
                                        child: _body()),
                                  ),
                                  if (_publishing && _publishStage != null) ...[
                                    const SizedBox(height: 12),
                                    _PublishingProgress(
                                      label: _publishStage!,
                                      value: _totalImages <= 0
                                          ? null
                                          : (_uploadedImages / _totalImages)
                                              .clamp(0, 1),
                                    ),
                                  ],
                                  const SizedBox(height: 24),
                                ]),
                          ),
                        ],
                      ),
              ),
              _BottomBar(
                step: _step,
                publishing: _publishing,
                onBack: () => _goStep(_step - 1),
                onNext: () => _goStep(_step + 1),
                onPublish: _publish,
              ),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _body() {
    switch (_step) {
      case 1:
        return _SellStepSurface(
          step: 1,
          title: 'Basic Item Details',
          onClearAll: _clearAll,
          child: _StepDetails(
              state: state,
              categories: _categories,
              onChanged: _changed,
              api: _api,
              onEditWhatsApp: _askForWhatsApp,
              onReturnedFromSettings: _returnedFromSettings),
        );
      case 2:
        return _SellStepSurface(
          step: 2,
          title: 'Photos & Description',
          onClearAll: _clearAll,
          child: _StepPhotos(
              state: state,
              onChanged: _changed,
              onPick: _chooseImages,
              api: _api),
        );
      case 3:
        return _SellStepSurface(
          step: 3,
          title: 'Pricing & Options',
          onClearAll: _clearAll,
          child: _StepPricing(state: state, onChanged: _changed),
        );
      default:
        return _SellStepSurface(
          step: 4,
          title: 'Review & Publish',
          child: _StepReview(
              state: state, onEdit: (n) => _goStep(n), onClearAll: _clearAll),
        );
    }
  }

  Future<void> _clearAll() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Clear all?'),
        content: const Text('This wipes every field of this draft.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(d, false),
              child: const Text('Keep editing')),
          FilledButton(
              onPressed: () => Navigator.pop(d, true),
              child: const Text('Clear all')),
        ],
      ),
    );
    if (ok != true) return;
    await SellFormState.clearDraft(_kv);
    setState(() {
      state.title = '';
      state.description = '';
      state.images.clear();
      state.setCategory(id: 0, name: '', commissionRate: null);
      state.categoryId = null;
      state.categoryCommissionRate = null;
      state.price = 0;
      state.sellerPayout = 0;
      state.originalPrice = 0;
      state.selectedAddressId = null;
      state.latitude = null;
      state.longitude = null;
      state.transportMode = null;
      state.feeBands = null;
      state.transportRequirement = TransportRequirement.required;
      state.choiceConfiguration = ProductChoiceConfiguration.empty;
      state.rentalConfiguration = const RentalConfiguration();
      // SELLWI-17: web's clear resets the WHOLE form (INITIAL_FORM_DATA),
      // including quantity, item age and the profile-derived WhatsApp field.
      state.quantity = 1;
      state.itemAge = '';
      state.whatsappNumber = '';
      _step = 1;
    });
    // WhatsApp is a read-only reflection of the seller profile, so wipe-then-
    // refill (web INITIAL clears it and the profile effect re-fills on load).
    // ignore: discarded_futures
    _loadWhatsappFromProfile();
    _changed();
  }
}

// ---- shared chrome ----------------------------------------------------------

/// The step card — web `app/sell/page.tsx:1422`: a numbered circle, the
/// step's own title and a red "Clear all", over the fields.
///
/// Mobile used to show a blue rounded-square icon with copy it had invented
/// ("What are you selling?"), and offered Clear all only on the review step.
class _SellStepSurface extends StatelessWidget {
  const _SellStepSurface({
    required this.step,
    required this.title,
    required this.child,
    this.onClearAll,
  });

  final int step;
  final String title;
  final Widget child;
  final VoidCallback? onClearAll;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: palette.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A172554),
            blurRadius: 18,
            offset: Offset(0, 7),
          ),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: palette.border)),
          ),
          child: Row(children: [
            Container(
              width: 32,
              height: 32,
              decoration: const BoxDecoration(
                  color: AppColors.brandBlue, shape: BoxShape.circle),
              alignment: Alignment.center,
              child: Text('$step',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w700)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 17, fontWeight: FontWeight.w800)),
            ),
            if (onClearAll != null)
              TextButton(
                onPressed: onClearAll,
                style: TextButton.styleFrom(
                    foregroundColor: const Color(0xFFDC2626),
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 10)),
                child: const Text('Clear all',
                    style:
                        TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
              ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 18),
          child: child,
        ),
      ]),
    );
  }
}

/// The page heading and the step card above the form — web
/// `app/sell/page.tsx:1208-1240`, phone layout.
///
/// Mobile used a row of four numbered dots. The desktop's phone layout is a
/// single card: "STEP n OF 4", the step's name, the percentage and a
/// progress bar.
class _ProgressHeader extends StatelessWidget {
  final int step;
  final List<String> titles;
  const _ProgressHeader({required this.step, required this.titles});

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final progress = step / titles.length;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      color: palette.background,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const SizedBox(
          width: double.infinity,
          child: Text("List Your Item - it's free",
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -.4)),
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: palette.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: palette.border),
          ),
          child: Semantics(
            label: 'Step $step of ${titles.length}: ${titles[step - 1]}',
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('STEP $step OF ${titles.length}',
                            style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                letterSpacing: .6,
                                color: AppPalette.of(context).accentInk)),
                        const SizedBox(height: 2),
                        Text(titles[step - 1],
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 14, fontWeight: FontWeight.w700)),
                      ]),
                ),
                Text('${(progress * 100).round()}%',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: palette.textSecondary)),
              ]),
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 6,
                  backgroundColor: palette.surfaceMuted,
                  valueColor: const AlwaysStoppedAnimation(AppColors.brandBlue),
                ),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _BottomBar extends StatelessWidget {
  final int step;
  final bool publishing;
  final VoidCallback onBack;
  final VoidCallback? onNext;
  final VoidCallback onPublish;
  const _BottomBar(
      {required this.step,
      required this.publishing,
      required this.onBack,
      this.onNext,
      required this.onPublish});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 12,
              offset: const Offset(0, -3)),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: Row(children: [
            if (step > 1)
              OutlinedButton(
                onPressed: onBack,
                style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 20, vertical: 14)),
                child: const Text('Back'),
              ),
            if (step > 1) const SizedBox(width: 10),
            Expanded(
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brandBlue,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: publishing ? null : (step < 4 ? onNext : onPublish),
                child: publishing
                    ? SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppPalette.of(context).surface))
                    : Row(mainAxisSize: MainAxisSize.min, children: [
                        Text(step < 4 ? 'Continue' : 'Publish listing',
                            style:
                                const TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(width: 6),
                        Icon(
                            step < 4
                                ? Icons.arrow_forward_rounded
                                : Icons.check_circle_outline,
                            size: 18),
                      ]),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _PublishingProgress extends StatelessWidget {
  const _PublishingProgress({required this.label, this.value});
  final String label;
  final double? value;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppPalette.of(context).infoFill,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppPalette.of(context).infoBorder),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2.2),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(label,
                  style: TextStyle(
                      fontWeight: FontWeight.w700, color: AppPalette.of(context).accentInk)),
            ),
          ]),
          const SizedBox(height: 10),
          LinearProgressIndicator(value: value, minHeight: 5),
          const SizedBox(height: 6),
          Text('Keep the app open until publishing finishes.',
              style: TextStyle(
                  fontSize: 11, color: AppPalette.of(context).textSecondary)),
        ]),
      );
}

class _SellErrorBanner extends StatelessWidget {
  const _SellErrorBanner({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppPalette.of(context).dangerFill,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppPalette.of(context).dangerBorder),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.error_outline,
                size: 20, color: AppPalette.of(context).dangerText),
            const SizedBox(width: 9),
            Expanded(
              child: Text(message,
                  style: TextStyle(
                      color: AppPalette.of(context).dangerText,
                      fontWeight: FontWeight.w600,
                      height: 1.35)),
            ),
          ]),
        ),
      );
}

// ---- Step 1 -----------------------------------------------------------------

/// A field label above its input, the way the web writes every label on this
/// page (`text-sm sm:text-base font-semibold text-neutral-800`). Mobile used
/// floating `labelText` decorations, which read differently and left no room
/// for the web's helper line.
class _SellFieldLabel extends StatelessWidget {
  const _SellFieldLabel(this.text, {this.top = 16});
  final String text;
  final double top;

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.only(top: top, bottom: 8),
        child: Text(text,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
      );
}

/// The small grey line under a field (web's `text-xs text-neutral-500`).
class _SellFieldHint extends StatelessWidget {
  const _SellFieldHint(this.text, {this.link, this.onTap});
  final String text;

  /// Trailing link text, rendered in brand blue.
  final String? link;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final style =
        TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary);
    if (link == null) {
      return Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(text, style: style));
    }
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: InkWell(
        onTap: onTap,
        child: Text.rich(
          TextSpan(text: '$text ', children: [
            TextSpan(
                text: link,
                style: TextStyle(
                    color: AppPalette.of(context).accentInk, fontWeight: FontWeight.w700)),
          ]),
          style: style,
        ),
      ),
    );
  }
}

class _StepDetails extends StatefulWidget {
  final SellFormState state;
  final List<Category> categories;
  final VoidCallback onChanged;
  final ApiClient api;

  /// Opens the add/change WhatsApp sheet in place.
  final VoidCallback? onEditWhatsApp;

  /// Called once the seller comes back from Profile Settings.
  final VoidCallback? onReturnedFromSettings;
  const _StepDetails(
      {required this.state,
      required this.categories,
      required this.onChanged,
      required this.api,
      this.onEditWhatsApp,
      this.onReturnedFromSettings});

  @override
  State<_StepDetails> createState() => _StepDetailsState();
}

class _StepDetailsState extends State<_StepDetails> {
  // AU-040 C2 (web-proven): initialValue only applies at field creation, and
  // on the web the restored draft can land AFTER the field was created with
  // the empty default. A controller synced from state in build keeps the
  // visible field in lockstep with state.title wherever the restore lands.
  late final TextEditingController _titleCtrl =
      TextEditingController(text: widget.state.title);

  /// Bumped after a trip to Profile Settings so the address list re-reads.
  int _addressReload = 0;

  Future<void> _openSettings() async {
    await context.push('/account/settings?returnTo=/sell');
    if (!mounted) return;
    setState(() => _addressReload++);
    widget.onReturnedFromSettings?.call();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final palette = AppPalette.of(context);
    // SELLWI-20: web normalizes the category list before rendering — dedupe,
    // drop a 'jobs' bucket, sort A-Z and pin 'Other' last
    // (app/sell/page.tsx:1554-1579).
    final cats = _normalizedCategories(widget.categories);
    final subs = state.categoryId == null
        ? const <Subcategory>[]
        : cats
            .where((c) => c.categoryId == state.categoryId)
            .expand((c) => c.subcategories)
            .toList();
    if (_titleCtrl.text != state.title && state.title.isNotEmpty) {
      // Keep caret at end when syncing a programmatic change (draft restore).
      _titleCtrl.text = state.title;
    }
    final phone = splitPhoneForDisplay(state.whatsappNumber);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const _SellFieldLabel('Item Title *', top: 0),
      TextFormField(
        controller: _titleCtrl,
        decoration: const InputDecoration(
            hintText: 'e.g., MacBook Pro 14″ M2', border: OutlineInputBorder()),
        // AU-040 verifier fix: title keystrokes now trigger the debounced
        // draft autosave + rebuild (previously only category changes saved).
        onChanged: (v) {
          state.setTitle(v);
          widget.onChanged();
        },
      ),
      const _SellFieldHint('Include model and key features'),
      const _SellFieldLabel('Category *'),
      DropdownButtonFormField<int?>(
        value: state.categoryId,
        isExpanded: true,
        decoration: const InputDecoration(
            hintText: 'Select category', border: OutlineInputBorder()),
        items: [
          for (final c in cats)
            DropdownMenuItem(
                value: c.categoryId,
                child: Text(c.categoryName, overflow: TextOverflow.ellipsis))
        ],
        onChanged: (id) {
          final c = cats.where((x) => x.categoryId == id).firstOrNull;
          if (c == null) return;
          state.setCategory(
              id: c.categoryId,
              name: c.categoryName,
              commissionRate: c.commissionRate,
              slug: c.slug);
          widget.onChanged();
        },
        validator: (_) =>
            state.categoryId == null ? 'Choose a category.' : null,
      ),
      // Always rendered, like web (disabled until a category is picked). The
      // backend rejects a listing with no subcategory outright, so hiding
      // this field would leave a required choice with nowhere to make it.
      const _SellFieldLabel('Subcategory *'),
      DropdownButtonFormField<int?>(
        value: state.subcategoryId,
        isExpanded: true,
        decoration: InputDecoration(
          border: const OutlineInputBorder(),
          hintText: state.categoryId == null
              ? 'Choose category first'
              : 'Select subcategory',
        ),
        items: [
          for (final s in subs)
            DropdownMenuItem(
                value: s.subcategoryId,
                child: Text(s.subcategoryName, overflow: TextOverflow.ellipsis))
        ],
        onChanged: (v) {
          // The slug travels with the id: it is what decides whether this
          // listing is a rental, and at what rate period. The name is kept
          // too — the review step shows the human subcategory name.
          final picked = subs.where((s) => s.subcategoryId == v).firstOrNull;
          state.setSubcategory(v,
              slug: picked?.slug, name: picked?.subcategoryName);
          widget.onChanged();
        },
      ),
      _RentalPurposeEditor(state: state, onChanged: widget.onChanged),
      const SizedBox(height: 20),
      // Web `app/sell/page.tsx:1650`: the tip and the saved-address picker
      // share one tinted box.
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: palette.background,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: palette.border),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: _openSettings,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(
                      text: 'Tip: ',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                  TextSpan(text: 'Update your defaults in '),
                  TextSpan(
                      text: 'Profile Settings',
                      style: TextStyle(
                          color: AppPalette.of(context).accentInk,
                          fontWeight: FontWeight.w700)),
                  TextSpan(text: '.'),
                ]),
                style: TextStyle(
                    fontSize: 12.5, height: 1.35, color: palette.textSecondary),
              ),
            ),
          ),
          const SizedBox(height: 12),
          const Text('Select From Saved Addresses',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          // Pickup address picker — saved addresses only; coordinates come
          // along.
          _AddressPicker(
              state: state,
              onChanged: widget.onChanged,
              api: widget.api,
              reloadSignal: _addressReload),
        ]),
      ),
      const _SellFieldLabel('WhatsApp Number *'),
      // No number on the profile yet: say so plainly and add it in place,
      // instead of an empty read-only box and an error at the end of the step.
      if (state.whatsappNumber.trim().isEmpty)
        _MissingWhatsAppCard(onAdd: widget.onEditWhatsApp)
      else ...[
        // Web renders a disabled PhoneInput: a country box holding the dial
        // code, then the national digits. It is never typed here — the value
        // is the seller's profile number.
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 15),
            decoration: BoxDecoration(
              color: palette.background,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: palette.border),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(phone.flag, style: const TextStyle(fontSize: 15)),
              const SizedBox(width: 6),
              Text(phone.dialCode,
                  style:
                      const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
            ]),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: TextFormField(
              // Web parity: only a read-only reflection of the profile value,
              // never typed here - `initialValue` is applied once at field
              // creation, so a fresh key forces a rebuild once the async
              // profile fetch resolves (same AU-040 gotcha the title field
              // already works around).
              key: ValueKey('sell-whatsapp-${state.whatsappNumber}'),
              initialValue: phone.nationalNumber,
              readOnly: true,
              decoration: const InputDecoration(
                  hintText: 'No number set', border: OutlineInputBorder()),
            ),
          ),
        ]),
        _SellFieldHint(
          'This number is pulled from your profile.',
          link: 'Change number',
          onTap: widget.onEditWhatsApp,
        ),
      ],
    ]);
  }
}

class _AddressPicker extends StatefulWidget {
  final SellFormState state;
  final VoidCallback onChanged;
  final ApiClient api;

  /// A change re-reads the saved addresses.
  final int reloadSignal;
  const _AddressPicker(
      {required this.state,
      required this.onChanged,
      required this.api,
      this.reloadSignal = 0});

  @override
  State<_AddressPicker> createState() => _AddressPickerState();
}

class _AddressPickerState extends State<_AddressPicker> {
  bool _preselectScheduled = false;

  /// An address just pinned from here; its new coordinates replace the
  /// pin-less ones the listing was holding.
  int? _reapplyId;
  late Future<List<Map<String, dynamic>>> _addressesFuture;

  @override
  void initState() {
    super.initState();
    _addressesFuture = _loadAddresses();
  }

  Future<List<Map<String, dynamic>>> _loadAddresses() {
    final token = AuthStore.instance?.token;
    return (token == null || token.isEmpty)
        ? Future.value(const <Map<String, dynamic>>[])
        : widget.api.getAddresses(token);
  }

  void _retry() => setState(() => _addressesFuture = _loadAddresses());

  @override
  void didUpdateWidget(covariant _AddressPicker oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.reloadSignal != widget.reloadSignal) _retry();
  }

  /// Adds an address (or pins [existing]) in a sheet over the wizard, then
  /// re-reads the list so it is selectable straight away. The seller never
  /// leaves the listing to do it.
  Future<void> _addAddress(BuildContext context,
      {Map<String, dynamic>? existing, bool first = false}) async {
    final token = AuthStore.instance?.token;
    if (token == null || token.isEmpty) return;
    final saved = await showAddressEditorSheet(context,
        api: widget.api, token: token, existing: existing, makeDefault: first);
    if (!mounted) return;
    if (saved && existing != null) {
      // Re-apply the chosen address once its pinned version arrives.
      _reapplyId = (existing['addressId'] as num?)?.toInt();
    }
    _retry();
    widget.onChanged();
  }

  /// SELLWI-21: web prefills the pickup address with `addresses.find(isDefault)
  /// || addresses[0]` and selects it (app/sell/page.tsx:440-448, 482-486). We
  /// do the same once the saved addresses arrive and the seller has not already
  /// chosen/drafted one. Deferred to a post-frame so onChanged() never fires
  /// during this widget's own build.
  /// A restored draft can name an address this account does not have (it
  /// was written elsewhere, or the address was deleted). Its pin would then
  /// pass for "location set", so the selection is dropped and the seller
  /// picks one of their own.
  bool _dropForeignAddress(List<Map<String, dynamic>> rows) {
    final id = widget.state.selectedAddressId;
    if (id == null) return false;
    if (rows.any((a) => (a['addressId'] as num?)?.toInt() == id)) return false;
    widget.state
      ..selectedAddressId = null
      ..location = ''
      ..street = ''
      ..latitude = null
      ..longitude = null
      ..placeName = ''
      ..neighbourhood = '';
    return true;
  }

  void _applyDefaultPreselect(List<Map<String, dynamic>> rows) {
    final dropped = _dropForeignAddress(rows);
    if (widget.state.selectedAddressId != null || rows.isEmpty) {
      if (dropped) widget.onChanged();
      return;
    }
    Map<String, dynamic>? pick;
    for (final a in rows) {
      // The backend publishes the flag as `default` (Lombok's isDefault()
      // getter on a primitive boolean); reading only `isDefault` never
      // matched, so the seller's default pickup address was never the one
      // preselected.
      if (savedAddressIsDefault(a)) {
        pick = a;
        break;
      }
    }
    pick ??= rows.first;
    final lat = (pick['latitude'] as num?)?.toDouble();
    final lng = (pick['longitude'] as num?)?.toDouble();
    widget.state.setLocationFromAddress(
      addressId: (pick['addressId'] as num).toInt(),
      region: (pick['region'] as String?) ?? '',
      country: (pick['country'] as String?) ?? 'Tanzania',
      streetName: (pick['street'] as String?) ?? '',
      lat: lat,
      lng: lng,
      place: pick['placeName'] as String?,
      hood: pick['neighbourhood'] as String?,
    );
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _addressesFuture,
      builder: (context, snap) {
        final rows = snap.data ?? const [];
        final chosenId = widget.state.selectedAddressId;
        final foreign = chosenId != null &&
            !rows.any((a) => (a['addressId'] as num?)?.toInt() == chosenId);
        if (snap.connectionState == ConnectionState.done &&
            !snap.hasError &&
            (foreign || (rows.isNotEmpty && chosenId == null)) &&
            !_preselectScheduled) {
          _preselectScheduled = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            _preselectScheduled = false;
            if (!mounted) return;
            _applyDefaultPreselect(rows);
          });
        }
        final reapply = _reapplyId;
        if (reapply != null && snap.connectionState == ConnectionState.done) {
          final a = rows.where((x) => x['addressId'] == reapply).firstOrNull;
          _reapplyId = null;
          if (a != null) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              widget.state.setLocationFromAddress(
                addressId: reapply,
                region: (a['region'] as String?) ?? '',
                country: (a['country'] as String?) ?? 'Tanzania',
                streetName: (a['street'] as String?) ?? '',
                lat: (a['latitude'] as num?)?.toDouble(),
                lng: (a['longitude'] as num?)?.toDouble(),
                place: a['placeName'] as String?,
                hood: a['neighbourhood'] as String?,
              );
              widget.onChanged();
            });
          }
        }
        if (snap.connectionState == ConnectionState.waiting && !snap.hasData) {
          return const SkeletonBox(height: 56, radius: 14);
        }
        if (snap.hasError) {
          return _AddressStateCard(
            icon: Icons.cloud_off_outlined,
            title: 'Could not load pickup addresses',
            message:
                'Check your connection and try again. Your listing draft is safe.',
            actionLabel: 'Retry',
            onAction: _retry,
          );
        }
        if (rows.isEmpty) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                  'No saved addresses yet. Buyers collect from — or are '
                  'delivered from — this address.',
                  style: TextStyle(fontSize: 13)),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                key: const ValueKey('sell-add-address'),
                onPressed: () => _addAddress(context, first: true),
                icon: const Icon(Icons.add_location_alt_outlined, size: 18),
                label: const Text('Add an address'),
              ),
            ],
          );
        }

        final selected = rows
            .where((a) => a['addressId'] == widget.state.selectedAddressId)
            .firstOrNull;
        final needsPin = selected != null && selected['latitude'] == null;

        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Web `SavedAddressSelect`: flag, then the nickname over
          // "street, region, country • Default".
          DropdownButtonFormField<int>(
            value: widget.state.selectedAddressId,
            // Without this the button takes the intrinsic width of its widest
            // entry and a long address runs through the field's border.
            isExpanded: true,
            itemHeight: null,
            decoration: const InputDecoration(
                hintText: 'Choose a saved address...',
                border: OutlineInputBorder()),
            selectedItemBuilder: (context) => [
              for (final a in rows)
                Align(
                  alignment: Alignment.centerLeft,
                  child: Row(children: [
                    Text(_addressFlag(a), style: const TextStyle(fontSize: 15)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(savedAddressPrimaryLabel(a),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w600)),
                    ),
                  ]),
                ),
            ],
            items: [
              for (final a in rows)
                DropdownMenuItem(
                  value: a['addressId'] as int,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(children: [
                      Text(_addressFlag(a),
                          style: const TextStyle(fontSize: 18)),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(savedAddressPrimaryLabel(a),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 14, fontWeight: FontWeight.w600)),
                            Text(savedAddressSecondaryLabel(a),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: 11.5,
                                    color:
                                        AppPalette.of(context).textSecondary)),
                          ],
                        ),
                      ),
                    ]),
                  ),
                ),
            ],
            onChanged: (v) {
              final a = rows.where((x) => x['addressId'] == v).firstOrNull;
              if (a == null) return;
              widget.state.setLocationFromAddress(
                addressId: v!,
                region: (a['region'] as String?) ?? '',
                country: (a['country'] as String?) ?? 'Tanzania',
                streetName: (a['street'] as String?) ?? '',
                lat: (a['latitude'] as num?)?.toDouble(),
                lng: (a['longitude'] as num?)?.toDouble(),
                place: a['placeName'] as String?,
                hood: a['neighbourhood'] as String?,
              );
              widget.onChanged();
            },
          ),
          // Logistics v2 needs a map pin on the pickup address or the
          // listing can never be delivery-quoted. The radio list used to say
          // so per row; with one dropdown it belongs under the choice.
          if (needsPin) ...[
            const SizedBox(height: 8),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.location_off_outlined,
                  size: 16, color: Color(0xFFDC2626)),
              const SizedBox(width: 6),
              const Expanded(
                child: Text(
                    'This address has no map pin yet — add one so '
                    'buyers can be quoted a delivery fee.',
                    style: TextStyle(fontSize: 11.5, color: Color(0xFFDC2626))),
              ),
              TextButton(
                onPressed: () => _addAddress(context, existing: selected),
                style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 8)),
                child: const Text('Add pin'),
              ),
            ]),
          ],
        ]);
      },
    );
  }

  /// The country's flag, from the address's country name. Web renders a
  /// `CountryFlag` here; mobile already carries the same emoji table for the
  /// currency picker.
  String _addressFlag(Map<String, dynamic> a) {
    final country = (a['country'] ?? '').toString().trim().toLowerCase();
    return switch (country) {
      'tanzania' => '🇹🇿',
      'kenya' => '🇰🇪',
      'uganda' => '🇺🇬',
      'rwanda' => '🇷🇼',
      'burundi' => '🇧🇮',
      _ => '📍',
    };
  }
}

/// Step 1 with no WhatsApp number on the profile: one clear action.
class _MissingWhatsAppCard extends StatelessWidget {
  const _MissingWhatsAppCard({this.onAdd});
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Container(
      key: const ValueKey('sell-whatsapp-missing'),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: palette.warningFill,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: palette.warningBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.phone_iphone_rounded, size: 20, color: palette.warningText),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Your profile has no WhatsApp number yet. Buyers need it to '
              'reach you, so add it once and every listing uses it.',
              style: TextStyle(
                  fontSize: 13, height: 1.35, color: palette.warningTextStrong),
            ),
          ),
        ]),
        const SizedBox(height: 10),
        FilledButton.icon(
          key: const ValueKey('sell-add-whatsapp'),
          onPressed: onAdd,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brandBlue,
            minimumSize: const Size.fromHeight(44),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
          ),
          icon: const Icon(Icons.add_rounded, size: 18),
          label: const Text('Add WhatsApp number'),
        ),
      ]),
    );
  }
}

class _AddressStateCard extends StatelessWidget {
  const _AddressStateCard({
    required this.icon,
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });
  final IconData icon;
  final String title;
  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppPalette.of(context).warningFill,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppPalette.of(context).warningBorder),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: AppPalette.of(context).warningText),
          const SizedBox(width: 10),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 3),
              Text(message,
                  style: TextStyle(
                      fontSize: 12,
                      height: 1.35,
                      color: AppPalette.of(context).textSecondary)),
              const SizedBox(height: 8),
              OutlinedButton(onPressed: onAction, child: Text(actionLabel)),
            ]),
          ),
        ]),
      );
}

// ---- Step 2 -----------------------------------------------------------------

class _StepPhotos extends StatelessWidget {
  final SellFormState state;
  final VoidCallback onChanged;
  final Future<void> Function() onPick;
  final ApiClient api;
  const _StepPhotos(
      {required this.state,
      required this.onChanged,
      required this.onPick,
      required this.api});

  Widget _photoTile(BuildContext context, int i) {
    final img = state.images[i];
    return Container(
      width: 96,
      height: 96,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.1),
              blurRadius: 6,
              offset: const Offset(0, 2)),
        ],
      ),
      child: Stack(children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.memory(img.bytes,
              width: 96,
              height: 96,
              fit: BoxFit.cover,
              key: ValueKey('sell-thumb-$i')),
        ),
        if (img.isCover)
          Positioned(
            left: 6,
            top: 6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(
                  color: AppColors.accentGreen,
                  borderRadius: BorderRadius.circular(20)),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.star, size: 10, color: Colors.white),
                SizedBox(width: 3),
                Text('Cover',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.w700)),
              ]),
            ),
          ),
        if (state.groupsPhotos)
          Positioned(
            left: 4,
            right: 4,
            top: img.isCover ? 26 : 4,
            child: Align(
              alignment: Alignment.centerLeft,
              child: InkWell(
                key: ValueKey('sell-photo-group-$i'),
                onTap: () => _editGroup(context, i),
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(20)),
                  child: Text(img.groupName ?? '+ Group',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w700)),
                ),
              ),
            ),
          ),
        Positioned(
          right: 4,
          bottom: 4,
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (state.groupsPhotos && i > 0) ...[
              _photoIconButton(Icons.chevron_left, () {
                state.moveImage(i, i - 1);
                onChanged();
              }),
              const SizedBox(width: 4),
            ],
            if (state.groupsPhotos && i < state.images.length - 1) ...[
              _photoIconButton(Icons.chevron_right, () {
                state.moveImage(i, i + 1);
                onChanged();
              }),
              const SizedBox(width: 4),
            ],
            _photoIconButton(Icons.star_border, () {
              state.makeCover(i);
              onChanged();
            }),
            const SizedBox(width: 4),
            _photoIconButton(Icons.delete_outline, () {
              state.removeImage(i);
              onChanged();
            }),
          ]),
        ),
      ]),
    );
  }

  /// Names a property photo's group (web 2026-10): "Bedroom", "Kitchen"…
  /// Buyers jump between groups on the listing.
  Future<void> _editGroup(BuildContext context, int i) async {
    final controller =
        TextEditingController(text: state.images[i].groupName ?? '');
    final groups = state.photoGroups;
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Photo group'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
            key: const ValueKey('sell-photo-group-field'),
            controller: controller,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
                hintText: 'e.g. Bedroom, Kitchen, Pool',
                border: OutlineInputBorder()),
          ),
          if (groups.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(spacing: 6, runSpacing: 6, children: [
              for (final g in groups)
                ActionChip(
                    label: Text(g),
                    onPressed: () => Navigator.pop(ctx, g)),
            ]),
          ],
        ]),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, ''),
              child: const Text('No group')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, controller.text),
              child: const Text('Save')),
        ],
      ),
    );
    controller.dispose();
    if (result == null) return;
    state.setImageGroup(i, result);
    onChanged();
  }

  Widget _photoIconButton(IconData icon, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.all(5),
          decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.55),
              shape: BoxShape.circle),
          child: Icon(icon, size: 14, color: Colors.white),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Up to 30 · JPG, PNG or WebP · 10MB each',
          style: TextStyle(
              fontSize: 12, color: AppPalette.of(context).textSecondary)),
      const SizedBox(height: 10),
      Wrap(spacing: 10, runSpacing: 10, children: [
        for (var i = 0; i < state.images.length; i++) _photoTile(context, i),
        InkWell(
          key: const ValueKey('sell-add-photo'),
          onTap: onPick,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(
              color: AppColors.brandBlue.withValues(alpha: 0.05),
              border: Border.all(
                  color: AppColors.brandBlue.withValues(alpha: 0.35),
                  width: 1.4),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.add_a_photo_outlined, color: AppPalette.of(context).accentInk),
                  SizedBox(height: 4),
                  Text('Add',
                      style: TextStyle(
                          color: AppPalette.of(context).accentInk,
                          fontSize: 11,
                          fontWeight: FontWeight.w700)),
                ]),
          ),
        ),
      ]),
      // SELLWI-16: web runs a live 'X.X MB / 100MB' total under the photos
      // (app/sell/page.tsx:1817-1823) — only once at least one image is picked.
      if (state.images.isNotEmpty) ...[
        const SizedBox(height: 8),
        Text(
          'Total size: ${_photosMegabytes(state.images)} MB / 100MB',
          style: TextStyle(
              fontSize: 11, color: AppPalette.of(context).textSecondary),
        ),
      ],
      const SizedBox(height: 14),
      TextFormField(
        initialValue: state.description,
        maxLines: 6,
        maxLength: 2500,
        decoration: const InputDecoration(
            labelText: 'Description *',
            alignLabelWithHint: true,
            border: OutlineInputBorder()),
        onChanged: (v) {
          state.setDescription(v);
          onChanged();
        },
      ),
      if (!state.isRental) ...[
        const SizedBox(height: 8),
        Row(children: [
          const Text('Available quantity'),
          const Spacer(),
          IconButton(
              onPressed: () {
                state.setQuantity(state.quantity - 1);
                onChanged();
              },
              icon: const Icon(Icons.remove_circle_outline)),
          Text('${state.quantity}',
              style: const TextStyle(fontWeight: FontWeight.w800)),
          IconButton(
              onPressed: () {
                state.setQuantity(state.quantity + 1);
                onChanged();
              },
              icon: const Icon(Icons.add_circle_outline)),
        ]),
      ],
      // Rentals are booked by date, so a prep period makes no sense for one
      // (web hides this and the quantity stepper behind the same guard).
      if (!state.isRental) ...[
        const SizedBox(height: 16),
        _ProductionTime(state: state, onChanged: onChanged),
      ],
      const SizedBox(height: 16),
      ProductChoiceEditor(state: state, onChanged: onChanged, api: api),
      // Only meaningful once a non-new condition has been chosen above.
      if (state.showItemAge) ...[
        const SizedBox(height: 16),
        TextFormField(
          key: ValueKey('sell-item-age-${state.categoryId}'),
          initialValue: state.itemAge,
          decoration: const InputDecoration(
            labelText: 'Item Age (optional)',
            hintText: 'e.g. 1 year, 6 months',
            helperText:
                'Helps buyers gauge wear. Added to the item description automatically.',
            helperMaxLines: 2,
            border: OutlineInputBorder(),
          ),
          onChanged: (v) {
            state.setItemAge(v);
            onChanged();
          },
        ),
      ],
    ]);
  }
}

/// Web parity `ProductionTimeSelector`.
class _ProductionTime extends StatelessWidget {
  final SellFormState state;
  final VoidCallback onChanged;
  const _ProductionTime({required this.state, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppPalette.of(context).infoFill,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(Icons.schedule,
                size: 18, color: AppPalette.of(context).accentInk),
          ),
          const SizedBox(width: 10),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Does this item take time to make or prepare?',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              SizedBox(height: 2),
              Text(
                  'Buyers will only choose delivery dates after this preparation period ends.',
                  style: TextStyle(
                      fontSize: 11.5,
                      color: AppPalette.of(context).textSecondary,
                      height: 1.3)),
            ]),
          ),
          Switch(
            value: state.requiresProductionTime,
            onChanged: (v) {
              state.setRequiresProductionTime(v);
              onChanged();
            },
          ),
        ]),
        if (state.requiresProductionTime) ...[
          const Divider(height: 20),
          const Text('Production time in calendar days',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
          const SizedBox(height: 8),
          Row(children: [
            SizedBox(
              width: 120,
              child: TextFormField(
                key: const ValueKey('sell-production-days'),
                initialValue: state.productionTimeDays,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    isDense: true,
                    hintText: 'e.g. 5',
                    border: OutlineInputBorder()),
                onChanged: (v) {
                  state.setProductionTimeDays(v);
                  onChanged();
                },
              ),
            ),
            const SizedBox(width: 8),
            Text('days',
                style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: AppPalette.of(context).textSecondary)),
          ]),
          const SizedBox(height: 6),
          Text(
              'Use 1–365 calendar days. You can finish early, but an existing order keeps the '
              'time promised when it was placed.',
              style: TextStyle(
                  fontSize: 11,
                  color: AppPalette.of(context).textSecondary,
                  height: 1.3)),
        ],
      ]),
    );
  }
}

// ---- Step 3 -----------------------------------------------------------------

class _StepPricing extends StatefulWidget {
  final SellFormState state;
  final VoidCallback onChanged;
  const _StepPricing({required this.state, required this.onChanged});

  @override
  State<_StepPricing> createState() => _StepPricingState();
}

class _StepPricingState extends State<_StepPricing> {
  // Hoisted controllers (same pattern as _StepDetails): controllers created in
  // build() are replaced on every rebuild, which resets the caret and makes a
  // programmatic value read race the field. Sync from state in build instead.
  late final TextEditingController _payoutCtrl = TextEditingController(
      text: widget.state.sellerPayout > 0
          ? _fmtNum(widget.state.sellerPayout)
          : '');
  late final TextEditingController _priceCtrl = TextEditingController(
      text: widget.state.price > 0 ? _fmtNum(widget.state.price) : '');
  final _payoutFocus = FocusNode();
  final _priceFocus = FocusNode();

  @override
  void dispose() {
    _payoutCtrl.dispose();
    _priceCtrl.dispose();
    _payoutFocus.dispose();
    _priceFocus.dispose();
    super.dispose();
  }

  /// Payout and price are bidirectionally linked (editing either recomputes
  /// the other), and both controllers must be re-synced from `state`
  /// whenever the *other* field's edit changed them. Setting `.text`
  /// synchronously inside `build()` is unsafe here: a `TextFormField` is a
  /// registered `FormField` of the ancestor `Form`, and the ancestor `Form`
  /// calls its own internal `setState` whenever ANY registered field's value
  /// changes — regardless of this widget's own `onChanged` callback. That
  /// call landing while `_StepPricingState.build()` is still running throws
  /// "setState() called during build". This was real and reproducible:
  /// typing the very first payout (price goes 0 -> nonzero) threw here, and
  /// the resulting broken frame is what made the whole Pricing step —
  /// transport picker included — look stuck. Deferring the write to a
  /// post-frame callback keeps the sync but moves it outside the build phase.
  void _syncControllersAfterFrame(SellFormState state) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final payoutText =
          state.sellerPayout > 0 ? _fmtNum(state.sellerPayout) : '';
      if (_payoutCtrl.text != payoutText && !_payoutFocus.hasFocus) {
        _payoutCtrl.text = payoutText;
      }
      final priceText = state.price > 0 ? _fmtNum(state.price) : '';
      if (_priceCtrl.text != priceText && !_priceFocus.hasFocus) {
        _priceCtrl.text = priceText;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final b = state.sellerPayout > 0 && state.price > 0
        ? state.calc.breakdown(
            sellerPayout: state.sellerPayout,
            price: state.price,
            categoryRate: state.effectiveCategoryRate)
        : null;
    // Web `hasPrice`: rows render real amounts only once both values clear the
    // TSh 1,000 floor, else '-' placeholders (commission-calculator.tsx:66).
    // The floor is in TZS, so the typed amounts are converted first — a
    // dollar-priced listing was otherwise stuck on placeholders.
    final hasPrice = b != null &&
        meetsListingFloor(b.sellerPayout, state.currency) &&
        meetsListingFloor(b.price, state.currency);
    final pricedChoices = hasPricedChoices(state.choiceConfiguration);
    final defaultChoice = getDefaultChoicePrice(state.choiceConfiguration);
    final defaultChoiceLabel = defaultChoice == null
        ? null
        : '${defaultChoice.attributeName}: ${defaultChoice.valueLabel}';
    _syncControllersAfterFrame(state);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: EdgeInsets.only(bottom: 10),
        child: Row(children: [
          Icon(Icons.sell_outlined, size: 18, color: AppPalette.of(context).accentInk),
          SizedBox(width: 8),
          Text('Set your price',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        ]),
      ),
      DropdownButtonFormField<String>(
        key: const ValueKey('sell-currency'),
        value: state.currency,
        isExpanded: true,
        decoration: const InputDecoration(
            labelText: 'Currency', border: OutlineInputBorder()),
        items: [
          for (final c in kCurrencies)
            DropdownMenuItem(
                value: c.code, child: Text('${c.code} — ${c.name}')),
        ],
        // Switching re-denominates everything already typed, so the amount
        // the listing actually represents does not silently change.
        onChanged: (code) {
          if (code == null) return;
          state.setCurrency(code);
          widget.onChanged();
        },
      ),
      const SizedBox(height: 12),
      Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: BorderSide(color: AppPalette.of(context).border)),
          child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(children: [
                // SELLWI-14: web leads the breakdown with the category header and an
                // 'Automatic pricing' badge (commission-calculator.tsx:71-83).
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppPalette.of(context).background,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppPalette.of(context).border),
                  ),
                  child: Row(children: [
                    Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              state.categoryName.isEmpty
                                  ? 'Select a category'
                                  : state.categoryName,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 13.5),
                            ),
                            const SizedBox(height: 2),
                            Text(
                                'Commission is determined automatically from the listing category.',
                                style: TextStyle(
                                    fontSize: 11,
                                    color:
                                        AppPalette.of(context).textSecondary)),
                          ]),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppPalette.of(context).surface,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                            color: AppPalette.of(context).borderStrong),
                      ),
                      child: const Text('Automatic pricing',
                          style: TextStyle(
                              fontSize: 12, fontWeight: FontWeight.w700)),
                    ),
                  ]),
                ),
                const SizedBox(height: 12),
                if (pricedChoices) ...[
                  // Web parity: once per-choice pricing is on, the choice IS the
                  // price - editing a base amount here would silently disagree with
                  // it, so both fields become read-only displays.
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppPalette.of(context).infoFill,
                      borderRadius: BorderRadius.circular(10),
                      border:
                          Border.all(color: AppPalette.of(context).infoBorder),
                    ),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('DEFAULT CHOICE PRICE',
                              style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: AppPalette.of(context).accentInk)),
                          const SizedBox(height: 3),
                          Text(
                              defaultChoiceLabel ??
                                  'First available priced choice',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 13)),
                          const SizedBox(height: 3),
                          Text(
                              'This amount was set with the product choices. Review it here; edit the choice '
                              'to change it.',
                              style: TextStyle(
                                  fontSize: 11,
                                  color: AppPalette.of(context).textSecondary,
                                  height: 1.3)),
                        ]),
                  ),
                  const SizedBox(height: 10),
                  _readOnlyMoney(context, 'You receive', state.sellerPayout,
                      state.currency),
                  const SizedBox(height: 8),
                  _readOnlyMoney(context, 'Final buyer price', state.price,
                      state.currency),
                ] else ...[
                  TextFormField(
                    key: const ValueKey('sell-payout-input'),
                    controller: _payoutCtrl,
                    focusNode: _payoutFocus,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                        labelText: 'You receive (${state.currency})',
                        border: const OutlineInputBorder()),
                    onChanged: (v) {
                      final d = double.tryParse(v.replaceAll(',', ''));
                      if (d != null) {
                        state.setPricingAmount(d, forward: true);
                        widget.onChanged();
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    key: const ValueKey('sell-price-input'),
                    controller: _priceCtrl,
                    focusNode: _priceFocus,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                        labelText: 'Final buyer price (${state.currency})',
                        border: const OutlineInputBorder()),
                    onChanged: (v) {
                      final d = double.tryParse(v.replaceAll(',', ''));
                      if (d != null) {
                        state.setPricingAmount(d, forward: false);
                        widget.onChanged();
                      }
                    },
                  ),
                ],
                const Divider(),
                // SELLWI-14 rows (web commission-calculator.tsx:165-187): three rows —
                // product value / commission (red) / final total (emerald) — with '-'
                // placeholders until both amounts clear the TSh 1,000 floor (`hasPrice`).
                // VAT and Selcom rows are hidden, exactly like web.
                _moneyRow(
                    'Your product value', hasPrice ? b.sellerPayout : null),
                _moneyRow('GloboExpats commission',
                    hasPrice ? b.sellerFacingCommissionAmount : null,
                    valueColor: const Color(0xFFDC2626)),
                const Divider(),
                _moneyRow('Final Total Asking Price', hasPrice ? b.price : null,
                    bold: true, valueColor: const Color(0xFF059669)),
                const SizedBox(height: 8),
                // Terms footnote (web commission-calculator.tsx:189-201).
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Padding(
                    padding: EdgeInsets.only(top: 1),
                    child: Icon(Icons.info_outline,
                        size: 14, color: AppPalette.of(context).textMuted),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        style: TextStyle(
                            fontSize: 11,
                            height: 1.4,
                            color: AppPalette.of(context).textSecondary),
                        children: [
                          TextSpan(
                              text: pricedChoices
                                  ? 'Choice prices use the same category commission and are shown to buyers automatically. '
                                  : 'The final asking price is rounded automatically and shown to buyers. '),
                          const TextSpan(text: 'See our '),
                          WidgetSpan(
                            alignment: PlaceholderAlignment.baseline,
                            baseline: TextBaseline.alphabetic,
                            child: GestureDetector(
                              onTap: () {
                                try {
                                  context.push('/terms');
                                } catch (_) {
                                  /* plain-Navigator test hosts have no /terms route */
                                }
                              },
                              child: Text('Terms of Service',
                                  style: TextStyle(
                                      color: AppPalette.of(context).accentInk,
                                      fontWeight: FontWeight.w600,
                                      decoration: TextDecoration.underline,
                                      fontSize: 11)),
                            ),
                          ),
                          const TextSpan(text: ' for details.'),
                        ],
                      ),
                    ),
                  ),
                ]),
              ]))),
      // SELLWI-15: web tells a non-TZS seller the backend still stores the price
      // as TZS at the displayed rate (app/sell/page.tsx:2131-2146).
      if (state.currency != 'TZS' && state.price > 0) ...[
        const SizedBox(height: 12),
        Text.rich(
          TextSpan(
            style: TextStyle(
                fontSize: 12, color: AppPalette.of(context).textSecondary),
            children: [
              const TextSpan(text: 'Final asking price is stored as '),
              TextSpan(
                text:
                    'TSh ${_intWithCommas(toTzs(state.price, state.currency).round())}',
                style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: AppPalette.of(context).textPrimary),
              ),
              const TextSpan(text: ' in TZS at the displayed rate.'),
            ],
          ),
        ),
      ],
      if (pricedChoices) ...[
        const SizedBox(height: 12),
        _ChoicePriceRows(state: state),
      ],
      const SizedBox(height: 16),
      _TransportRequirementCards(
        // Web locks the choice to EXEMPT for a rental or real estate rather
        // than showing an option that silently does nothing.
        locked: state.isRental || state.categorySlug.contains('real-estate'),
        selected: state.effectiveTransport,
        onSelected: (r) {
          state.setTransportRequirement(r);
          widget.onChanged();
        },
      ),
      if (state.effectiveTransport != TransportRequirement.exempt) ...[
        const SizedBox(height: 16),
        Text('Choose the smallest vehicle that can safely carry this product.',
            style: TextStyle(
                fontSize: 12, color: AppPalette.of(context).textSecondary)),
        const SizedBox(height: 10),
        TransportModeGrid(
          selected: state.transportMode,
          onSelected: (m) {
            state.setTransportMode(m);
            widget.onChanged();
          },
        ),
        if (state.transportMode != null) ...[
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppPalette.of(context).successFill,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppPalette.of(context).successBorder),
            ),
            child: Row(children: [
              const Icon(Icons.check_circle,
                  size: 16, color: Color(0xFF059669)),
              const SizedBox(width: 8),
              Expanded(
                child: RichText(
                  text: TextSpan(
                    style:
                        TextStyle(fontSize: 12, color: AppPalette.of(context).successTextStrong),
                    children: [
                      TextSpan(
                          text: '${state.transportMode!.label} ',
                          style: const TextStyle(fontWeight: FontWeight.w800)),
                      const TextSpan(
                          text:
                              'selected. The delivery fee is calculated automatically at checkout.'),
                    ],
                  ),
                ),
              ),
            ]),
          ),
        ],
        if (state.feeBands != null) ...[
          const SizedBox(height: 8),
          Text(state.transportMode!.bannerCopy,
              style: TextStyle(
                  fontSize: 12, color: AppPalette.of(context).textSecondary)),
        ],
      ],
    ]);
  }

  Widget _moneyRow(String label, double? v,
          {bool bold = false, Color? valueColor}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [
          Text(label,
              style: TextStyle(
                  fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
                  fontSize: 13)),
          const Spacer(),
          Text(v == null ? '-' : 'TSh ${_fmtNum(v)}',
              style: TextStyle(
                  fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
                  fontSize: 13,
                  color: valueColor)),
        ]),
      );
}

String _fmtNum(double v) =>
    v.roundToDouble() == v ? v.toInt().toString() : v.toStringAsFixed(2);

/// Web parity for the Step-1 category picker (app/sell/page.tsx:1554-1579):
/// categories are deduped by name+id, a 'jobs' bucket is filtered out, the
/// rest sort A-Z and 'Other' is pinned to the bottom.
List<Category> _normalizedCategories(List<Category> raw) {
  final seen = <String>{};
  final out = <Category>[];
  for (final c in raw) {
    final name = c.categoryName.trim();
    if (name.isEmpty || name.toLowerCase() == 'jobs') continue;
    if (!seen.add('${name.toLowerCase()}|${c.categoryId}')) continue;
    out.add(c);
  }
  out.sort((a, b) {
    final an = a.categoryName.toLowerCase();
    final bn = b.categoryName.toLowerCase();
    if (an == 'other') return 1;
    if (bn == 'other') return -1;
    return an.compareTo(bn);
  });
  return out;
}

/// Web parity `Total size: X.X MB / 100MB` (app/sell/page.tsx:1819-1821) — one
/// decimal, like the reference `.toFixed(1)`.
String _photosMegabytes(List<PendingImage> images) {
  final mb =
      images.fold<int>(0, (sum, im) => sum + im.bytes.length) / 1024 / 1024;
  return mb.toStringAsFixed(1);
}

/// `toLocaleString()` for a whole number — thousands separators every 3 digits.
String _intWithCommas(num v) {
  final s = v.round().toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
    buf.write(s[i]);
  }
  return buf.toString();
}

/// Read-only money display used when per-choice pricing owns the price.
Widget _readOnlyMoney(
        BuildContext context, String label, double amount, String currency) =>
    Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surfaceMuted,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label,
            style: TextStyle(
                fontSize: 11, color: AppPalette.of(context).textSecondary)),
        const SizedBox(height: 2),
        Text(formatMoney(amount, currency),
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
      ]),
    );

/// Web parity `TransportRequirementSelector` — a two-card grid. When [locked]
/// only the EXEMPT card is offered, matching web's filtered option list.
class _TransportRequirementCards extends StatelessWidget {
  final bool locked;
  final TransportRequirement selected;
  final ValueChanged<TransportRequirement> onSelected;
  const _TransportRequirementCards(
      {required this.locked, required this.selected, required this.onSelected});

  @override
  Widget build(BuildContext context) {
    final options = <(TransportRequirement, String, String, IconData)>[
      (
        TransportRequirement.required,
        'Delivery setup required',
        'Choose a suitable vehicle so buyers can request delivery.',
        Icons.local_shipping_outlined
      ),
      (
        TransportRequirement.exempt,
        'No transport needed',
        'Use for property, digital, or pickup-only listings.',
        Icons.warehouse_outlined
      ),
    ].where((o) => !locked || o.$1 == TransportRequirement.exempt).toList();

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Transport requirement',
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
      const SizedBox(height: 4),
      Text(
          'Choose what buyers should expect at checkout. Real Estate is set to no transport '
          'automatically.',
          style: TextStyle(
              fontSize: 11.5,
              color: AppPalette.of(context).textSecondary,
              height: 1.3)),
      const SizedBox(height: 8),
      for (final o in options)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _requirementCard(context, o.$1, o.$2, o.$3, o.$4),
        ),
    ]);
  }

  Widget _requirementCard(BuildContext context, TransportRequirement value,
      String label, String description, IconData icon) {
    final isSelected = value == selected;
    return Semantics(
      button: true,
      selected: isSelected,
      label: label,
      child: InkWell(
        onTap: locked ? null : () => onSelected(value),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isSelected
                ? AppColors.brandBlue.withValues(alpha: 0.05)
                : AppPalette.of(context).surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected
                  ? AppColors.brandBlue
                  : AppPalette.of(context).border,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppPalette.of(context).surfaceMuted,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon,
                  size: 18, color: AppPalette.of(context).textSecondary),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 13)),
                    const SizedBox(height: 2),
                    Text(description,
                        style: TextStyle(
                            fontSize: 11.5,
                            color: AppPalette.of(context).textSecondary,
                            height: 1.3)),
                  ]),
            ),
            if (isSelected)
              Icon(Icons.check_circle,
                  size: 18, color: AppPalette.of(context).accentInk),
          ]),
        ),
      ),
    );
  }
}

/// Web parity `ChoicePriceRows` — the per-choice commission breakdown shown
/// once per-value pricing is driving the listing price.
class _ChoicePriceRows extends StatelessWidget {
  final SellFormState state;
  const _ChoicePriceRows({required this.state});

  @override
  Widget build(BuildContext context) {
    final config = state.choiceConfiguration;
    final defaultChoice = getDefaultChoicePrice(config);
    final rows = <(ProductChoiceAttribute, ProductChoiceValue)>[
      for (final a in config.attributes)
        if (a.allowDifferentPrices ||
            a.values.any((v) => v.sellerPayoutAdjustment != 0))
          for (final v in getActiveProductChoiceValues(a)) (a, v),
    ];
    if (!config.hasChoices || rows.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Choice price breakdown',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
        const SizedBox(height: 3),
        Text(
            'These amounts came from the product choices. Commission and the final buyer price '
            'are calculated automatically for every value.',
            style: TextStyle(
                fontSize: 11,
                color: AppPalette.of(context).textSecondary,
                height: 1.3)),
        const SizedBox(height: 10),
        if (state.sellerPayout <= 0)
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppPalette.of(context).warningFill,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppPalette.of(context).warningBorder),
            ),
            child: Text(
                'Return to Photos & Description and enter the amount you receive for a priced '
                'choice.',
                style: TextStyle(
                    fontSize: 11.5, color: AppPalette.of(context).warningText)),
          )
        else
          for (final row in rows) _row(context, row.$1, row.$2, defaultChoice),
        const SizedBox(height: 8),
        Text(
            'To change an amount, return to Photos & Description. If more than one choice group '
            'changes the price, GloboExpats combines those differences at checkout.',
            style: TextStyle(
                fontSize: 10.5,
                color: AppPalette.of(context).textSecondary,
                height: 1.3)),
      ]),
    );
  }

  Widget _row(BuildContext context, ProductChoiceAttribute a,
      ProductChoiceValue v, DefaultChoicePrice? defaultChoice) {
    final payout = getChoiceSellerPayout(state.sellerPayout, v)
        .clamp(0, double.infinity)
        .toDouble();
    final b = state.calc.breakdown(
      sellerPayout: payout,
      price: state.calc.priceForPayout(payout, state.effectiveCategoryRate),
      categoryRate: state.effectiveCategoryRate,
    );
    final isDefault = defaultChoice?.definitionId == a.definitionId &&
        defaultChoice?.valueId == v.id;
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppPalette.of(context).infoFill,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text('${a.name}: ${v.label}',
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 12.5)),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: isDefault
                  ? AppPalette.of(context).infoFill
                  : AppPalette.of(context).surfaceMuted,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
                isDefault
                    ? 'Default'
                    : (hasChoicePriceOverride(v)
                        ? 'Custom price'
                        : 'Uses default price'),
                style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: isDefault
                        ? AppPalette.of(context).accentInk
                        : AppPalette.of(context).textSecondary)),
          ),
        ]),
        const SizedBox(height: 6),
        _miniRow(context, 'You receive', formatMoney(payout, state.currency)),
        _miniRow(context, 'GloboExpats commission',
            formatMoney(b.sellerFacingCommissionAmount, state.currency),
            color: const Color(0xFFDC2626)),
        _miniRow(
            context, 'Final buyer price', formatMoney(b.price, state.currency),
            color: AppPalette.of(context).successText, bold: true),
      ]),
    );
  }

  Widget _miniRow(BuildContext context, String label, String value,
          {Color? color, bool bold = false}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 1),
        child: Row(children: [
          Text(label,
              style: TextStyle(
                  fontSize: 11, color: AppPalette.of(context).textSecondary)),
          const Spacer(),
          Text(value,
              style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
                  color: color)),
        ]),
      );
}

/// Web parity `TransportModeSelector` — a two-column radio-card grid with the
/// bundled vehicle artwork, replacing the old plain dropdown.
/// The delivery vehicles as picture cards — shared by the sell wizard and
/// the edit-listing page so both show the same artwork.
class TransportModeGrid extends StatelessWidget {
  final TransportMode? selected;
  final ValueChanged<TransportMode> onSelected;
  const TransportModeGrid(
      {super.key, required this.selected, required this.onSelected});

  static const _modes = TransportMode.values;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _modes.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 0.82,
      ),
      itemBuilder: (context, i) {
        final mode = _modes[i];
        final isSelected = mode == selected;
        return TransportModeCard(
          mode: mode,
          isSelected: isSelected,
          onTap: () => onSelected(mode),
        );
      },
    );
  }
}

class TransportModeCard extends StatelessWidget {
  final TransportMode mode;
  final bool isSelected;
  final VoidCallback onTap;
  const TransportModeCard(
      {required this.mode, required this.isSelected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: isSelected,
      label: mode.label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: isSelected
                ? AppColors.brandBlue.withValues(alpha: 0.05)
                : AppPalette.of(context).surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected
                  ? AppColors.brandBlue
                  : AppPalette.of(context).border,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Stack(children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                height: 64,
                width: double.infinity,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: isSelected
                        ? [
                            AppColors.brandBlue.withValues(alpha: 0.06),
                            AppColors.brandBlue.withValues(alpha: 0.12),
                          ]
                        : [
                            AppPalette.of(context).background,
                            AppPalette.of(context).surfaceMuted
                          ],
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Image.asset(mode.assetPath, fit: BoxFit.contain),
                ),
              ),
              const SizedBox(height: 8),
              Text(mode.label,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 13),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
              const SizedBox(height: 2),
              Text(mode.description,
                  style: TextStyle(
                      fontSize: 11,
                      color: AppPalette.of(context).textSecondary,
                      height: 1.25),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis),
            ]),
            Positioned(
              top: 0,
              right: 0,
              child: Icon(Icons.check_circle,
                  size: 16,
                  color: isSelected
                      ? AppPalette.of(context).accentInk
                      : AppPalette.of(context).borderStrong),
            ),
          ]),
        ),
      ),
    );
  }
}

// ---- Step 4 -----------------------------------------------------------------

class _StepReview extends StatelessWidget {
  final SellFormState state;
  final ValueChanged<int> onEdit;
  final Future<void> Function() onClearAll;
  const _StepReview(
      {required this.state, required this.onEdit, required this.onClearAll});

  @override
  Widget build(BuildContext context) {
    final coverIndex = state.images.indexWhere((im) => im.isCover);
    final cover = state.images.isEmpty
        ? null
        : state.images[coverIndex < 0 ? 0 : coverIndex];
    final configured = state.preparedChoiceConfiguration.attributes
        .where((a) => getActiveProductChoiceValues(a).isNotEmpty)
        .toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Web parity review-step.tsx:128-138 — the 'Ready to Publish!' success
      // header that opens the final step.
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppPalette.of(context).successFill,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppPalette.of(context).successBorder),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppPalette.of(context).successFill,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check_circle,
                color: Color(0xFF059669), size: 22),
          ),
          const SizedBox(width: 10),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Ready to Publish!',
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppPalette.of(context).successText,
                      fontSize: 14)),
              SizedBox(height: 2),
              Text(
                  'Review your listing details below. Tap Edit to make changes.',
                  style: TextStyle(
                      fontSize: 12, color: AppPalette.of(context).successText)),
            ]),
          ),
        ]),
      ),
      const SizedBox(height: 14),
      if (cover != null) ...[
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Stack(children: [
            Image.memory(cover.bytes,
                width: double.infinity, height: 170, fit: BoxFit.cover),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.fromLTRB(14, 20, 14, 10),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: 0.6)
                    ],
                  ),
                ),
                child: Text(
                  state.title.isEmpty ? 'Untitled listing' : state.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 16),
                ),
              ),
            ),
          ]),
        ),
        const SizedBox(height: 14),
      ],
      _SectionCard(
        title: 'Basic details',
        onEdit: () => onEdit(1),
        children: [
          _row(context, 'Item Title', state.title.isEmpty ? '—' : state.title),
          _row(context, 'Category',
              state.categoryName.isEmpty ? '—' : state.categoryName),
          _row(
              context,
              'Subcategory',
              state.subcategoryName.isEmpty
                  ? 'Not selected'
                  : state.subcategoryName),
          _row(context, 'Location',
              state.location.isEmpty ? '—' : state.location),
          if (state.street.trim().isNotEmpty)
            _row(context, 'Street / Area', state.street),
          // SELLWI-13: WhatsApp is a read-only reflection of the profile (web
          // review-step.tsx:180-182) — shown only when one exists.
          if (state.whatsappNumber.trim().isNotEmpty)
            _row(context, 'WhatsApp', state.whatsappNumber),
          // Rentals are single-unit and never prepared in advance, so web hides
          // quantity and production time behind the same guard (183-191).
          if (!state.isRental)
            _row(context, 'Available Quantity', '${state.quantity}'),
          if (!state.isRental && state.requiresProductionTime)
            _row(context, 'Production Time',
                '${state.productionTimeDays} calendar ${state.productionTimeDays == '1' ? 'day' : 'days'}'),
          // SELLWI-13: web lists every configured attribute + its buyer values
          // (review-step.tsx:211-227).
          if (configured.isNotEmpty) ...[
            const SizedBox(height: 6),
            const Divider(height: 1),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('Product attributes and buyer choices',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
            ),
            for (final a in configured)
              _row(
                  context,
                  a.name,
                  getActiveProductChoiceValues(a)
                      .map((v) => v.label)
                      .join(', ')),
          ],
        ],
      ),
      _SectionCard(
        title: 'Photos & description',
        onEdit: () => onEdit(2),
        children: [
          Text('${state.images.length} Photos',
              style:
                  const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          const SizedBox(height: 8),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (var i = 0; i < state.images.length && i < 6; i++)
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: Image.memory(state.images[i].bytes,
                    width: 64, height: 64, fit: BoxFit.cover),
              ),
            if (state.images.length > 6)
              Text('+${state.images.length - 6}',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 10),
          const Text('Description',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          const SizedBox(height: 4),
          Text(
              state.description.isEmpty
                  ? 'No description provided'
                  : (state.description.length > 160
                      ? '${state.description.substring(0, 160)}…'
                      : state.description),
              style: const TextStyle(fontSize: 13)),
        ],
      ),
      _SectionCard(
        title: 'Pricing & delivery',
        onEdit: () => onEdit(3),
        children: [
          _row(context, 'Final asking price',
              formatMoney(state.price, state.currency)),
          _row(context, 'You receive',
              formatMoney(state.sellerPayout, state.currency)),
          if (state.originalPrice > 0)
            _row(context, 'Original price',
                formatMoney(state.originalPrice, state.currency)),
          _row(
              context,
              'Transport',
              state.effectiveTransport == TransportRequirement.exempt
                  ? 'No transport needed'
                  : state.transportMode?.label ?? 'not chosen'),
          // SELLWI-13: delivery tariff box (web review-step.tsx:333-354). The
          // fare figures come from the mode's fee model (delivery_fare.dart);
          // platform-settings baseKm is part of the deferred settings fetch.
          if (state.effectiveTransport != TransportRequirement.exempt &&
              state.transportMode != null) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppPalette.of(context).infoFill,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppPalette.of(context).infoBorder),
              ),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Delivery by ${state.transportMode!.label}',
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                            color: AppPalette.of(context).infoTextStrong)),
                    const SizedBox(height: 4),
                    Text(
                      "The buyer's delivery fee will be calculated automatically from the road "
                      "distance to their saved address. Current tariff: TSh "
                      "${_intWithCommas(state.transportMode!.baseFare)} for the first 1.5 km, then "
                      "TSh ${_intWithCommas(state.transportMode!.ratePerKm)} per additional kilometre.",
                      style: TextStyle(
                          fontSize: 11.5,
                          height: 1.4,
                          color: AppPalette.of(context).accentInk),
                    ),
                  ]),
            ),
          ],
        ],
      ),
      // Web parity review-step.tsx:358-366 — 'Ready to Go Live?' closing panel.
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppPalette.of(context).background,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppPalette.of(context).border),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Ready to Go Live?',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          SizedBox(height: 4),
          Text(
            'Your listing will be published immediately and visible to thousands of '
            'potential buyers in our global expat community. You can edit or remove '
            'your listing at any time from your dashboard.',
            style: TextStyle(
                fontSize: 12.5,
                height: 1.4,
                color: AppPalette.of(context).textSecondary),
          ),
        ]),
      ),
      const SizedBox(height: 8),
      Center(
          child: TextButton(
              onPressed: onClearAll, child: const Text('Clear all'))),
    ]);
  }

  Widget _row(BuildContext context, String k, String v) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(
              width: 110,
              child: Text(k,
                  style: TextStyle(
                      color: AppPalette.of(context).textSecondary,
                      fontSize: 13))),
          Expanded(child: Text(v, style: const TextStyle(fontSize: 13))),
        ]),
      );
}

class _SectionCard extends StatelessWidget {
  final String title;
  final VoidCallback onEdit;
  final List<Widget> children;
  const _SectionCard(
      {required this.title, required this.onEdit, required this.children});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Text(title,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 14)),
                const Spacer(),
                TextButton(onPressed: onEdit, child: const Text('Edit')),
              ]),
              ...children,
            ],
          )),
    );
  }
}

/// Web parity `components/product-choices/rental-listing-editor.tsx`: shown
/// once the chosen category/subcategory can carry a rental (every real-estate
/// subcategory, plus vehicle-for-rent ones). Lets the seller pick a listing
/// purpose — 'For sale' is offered only where the subcategory does not force
/// booking — and the rate period (HOUR/DAY/WEEK/MONTH for vehicle hire,
/// NIGHT/DAY/WEEK/MONTH otherwise).
///
/// The seller never ticks "this is a rental": the subcategory decides whether
/// this editor appears and what it defaults to (`getDefaultRentalConfiguration`),
/// exactly like the reference. A short stay arrives here as a nightly rate.
/// The host's minimum stay for the rate period (web rental-listing-editor
/// "Minimum nights" / "Minimum days" / "Minimum months"). Shared with edit
/// listing. Blank means 1.
class MinimumStayField extends StatefulWidget {
  const MinimumStayField({
    super.key,
    required this.configuration,
    required this.vehicle,
    required this.onChanged,
  });

  final RentalConfiguration configuration;
  final bool vehicle;
  final ValueChanged<int?> onChanged;

  @override
  State<MinimumStayField> createState() => _MinimumStayFieldState();
}

class _MinimumStayFieldState extends State<MinimumStayField> {
  late final String? _kind =
      widget.configuration.minimumKind(vehicle: widget.vehicle);
  late final TextEditingController _text = TextEditingController(
      text: '${switch (_kind) {
            'nights' => widget.configuration.minimumNights,
            'days' => widget.configuration.minimumDays,
            'months' => widget.configuration.minimumMonths,
            _ => null,
          } ?? 1}');

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final max = _kind == 'months' ? 120 : 365;
    return TextFormField(
      key: const ValueKey('minimum-stay-field'),
      controller: _text,
      keyboardType: TextInputType.number,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      decoration: InputDecoration(
        labelText: 'Minimum $_kind',
        helperText: 'Guests must book at least this many $_kind (1-$max).',
        border: const OutlineInputBorder(),
        filled: true,
        fillColor: AppPalette.of(context).surface,
      ),
      onChanged: (v) => widget.onChanged(int.tryParse(v.trim())),
    );
  }
}

class _RentalPurposeEditor extends StatelessWidget {
  final SellFormState state;
  final VoidCallback onChanged;
  const _RentalPurposeEditor({required this.state, required this.onChanged});

  static const _vehicleRateOptions = <String, (String, String)>{
    'HOUR': ('Hourly', 'Best for short local trips'),
    'DAY': ('Daily', 'One or more full days'),
    'WEEK': ('Weekly', 'Seven-day rental periods'),
    'MONTH': ('Monthly', 'Long-term vehicle hire'),
  };

  static const _nonVehiclePeriods = <String, String>{
    'NIGHT': 'Per night',
    'DAY': 'Per day',
    'WEEK': 'Per week',
    'MONTH': 'Per month',
  };

  @override
  Widget build(BuildContext context) {
    // Reference gate: `if (!supportsRentalListing || !subcategorySlug) return null`.
    final capable = state.rentalCapable && state.subcategorySlug.isNotEmpty;
    if (!capable) return const SizedBox.shrink();

    final automatic = state.rentalAutomatic;
    final isRental = state.isRental;
    final isVehicle = state.isVehicleRental;
    final purpose = isRental ? 'FOR_RENT' : 'FOR_SALE';
    // Defensive: DropdownButtonFormField throws when value is not an item.
    final currentPeriod = state.rentalConfiguration.ratePeriod;
    final periodInList = isVehicle
        ? _vehicleRateOptions.containsKey(currentPeriod)
        : _nonVehiclePeriods.containsKey(currentPeriod);
    final safePeriod =
        periodInList ? currentPeriod : (isVehicle ? 'DAY' : 'MONTH');

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            isVehicle ? 'Vehicle rental type' : 'Property listing type',
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
          ),
          const SizedBox(height: 4),
          Text(
            isVehicle
                ? 'Choose the rental period first. Buyers then select available dates from the booking calendar.'
                : 'Choose whether the property is for sale or for rent. For-rent listings use booking dates, period pricing, and the availability calendar.',
            style: TextStyle(
                fontSize: 11.5,
                color: AppPalette.of(context).textSecondary,
                height: 1.35),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: automatic ? 'FOR_RENT' : purpose,
            isDense: true,
            decoration: InputDecoration(
              labelText: 'Listing purpose',
              border: OutlineInputBorder(),
              filled: true,
              fillColor: AppPalette.of(context).surface,
            ),
            items: [
              if (!automatic)
                const DropdownMenuItem(
                    value: 'FOR_SALE', child: Text('For sale')),
              const DropdownMenuItem(
                  value: 'FOR_RENT', child: Text('For rent')),
            ],
            onChanged: (v) {
              if (v == null || v == (automatic ? 'FOR_RENT' : purpose)) return;
              if (v == 'FOR_SALE') {
                // Reference onChange(null): back to an ordinary sale.
                state.setRental(const RentalConfiguration());
              } else {
                // Reference `rentalConfigurationForType('FOR_RENT', value?.ratePeriod
                // || automatic?.ratePeriod || 'MONTH')`. When the seller is opting an
                // ordinary property into booking there is no current value, so the
                // reference starts it at a MONTHLY rate.
                state.setRental(RentalConfiguration(
                  enabled: true,
                  listingType: 'FOR_RENT',
                  ratePeriod: isRental ? safePeriod : 'MONTH',
                ));
              }
              onChanged();
            },
          ),
          if (automatic)
            Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text(
                'This subcategory uses booking automatically.',
                style: TextStyle(fontSize: 11.5, color: AppPalette.of(context).accentInk),
              ),
            ),
          if (isRental && isVehicle) ...[
            const SizedBox(height: 14),
            const Text('Choose the rental period',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
            const SizedBox(height: 8),
            for (final pair in _pairUp(_vehicleRateOptions.entries.toList()))
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                          child: _vehicleRateTile(context, pair.$1, isRental)),
                      if (pair.$2 != null) ...[
                        const SizedBox(width: 8),
                        Expanded(
                            child:
                                _vehicleRateTile(context, pair.$2!, isRental)),
                      ],
                    ]),
              ),
          ] else if (isRental) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: safePeriod,
              isDense: true,
              decoration: InputDecoration(
                labelText: 'Charge buyers',
                border: OutlineInputBorder(),
                filled: true,
                fillColor: AppPalette.of(context).surface,
              ),
              items: [
                for (final entry in _nonVehiclePeriods.entries)
                  DropdownMenuItem(value: entry.key, child: Text(entry.value)),
              ],
              onChanged: (v) {
                if (v == null) return;
                state.setRatePeriod(v);
                onChanged();
              },
            ),
          ],
          if (isRental &&
              state.rentalConfiguration.minimumKind(vehicle: isVehicle) !=
                  null) ...[
            const SizedBox(height: 12),
            MinimumStayField(
              key: ValueKey(
                  'minimum-${state.rentalConfiguration.minimumKind(vehicle: isVehicle)}'),
              configuration: state.rentalConfiguration,
              vehicle: isVehicle,
              onChanged: (v) {
                state.setMinimumStay(v);
                onChanged();
              },
            ),
          ],
          if (isRental)
            Padding(
              padding: EdgeInsets.only(top: 10),
              child: Text(
                'The seller payout entered in Pricing is the rate for one selected '
                'period. GloboExpats adds the category commission automatically.',
                style: TextStyle(
                    fontSize: 10.5,
                    color: AppPalette.of(context).textSecondary,
                    height: 1.35),
              ),
            ),
        ],
      ),
    );
  }

  /// Rows of (tile, tile?) so a 4-option grid reads two per line.
  static List<
      (
        MapEntry<String, (String, String)>,
        MapEntry<String, (String, String)>?
      )> _pairUp(List<MapEntry<String, (String, String)>> options) {
    final out = <(
      MapEntry<String, (String, String)>,
      MapEntry<String, (String, String)>?
    )>[];
    for (var i = 0; i < options.length; i += 2) {
      out.add((
        options[i],
        i + 1 < options.length ? options[i + 1] : null,
      ));
    }
    return out;
  }

  Widget _vehicleRateTile(BuildContext context,
      MapEntry<String, (String, String)> option, bool active) {
    final selected = state.rentalConfiguration.ratePeriod == option.key;
    return Semantics(
      button: true,
      selected: selected,
      label: option.value.$1,
      child: InkWell(
        onTap: () {
          if (selected) return;
          state.setRatePeriod(option.key);
          onChanged();
        },
        borderRadius: BorderRadius.circular(12),
        child: Container(
          constraints: const BoxConstraints(minHeight: 64),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.brandBlue.withValues(alpha: 0.05)
                : AppPalette.of(context).surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected
                  ? AppColors.brandBlue
                  : AppPalette.of(context).border,
              width: selected ? 2 : 1,
            ),
          ),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(option.value.$1,
                style:
                    const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            const SizedBox(height: 2),
            Text(option.value.$2,
                style: TextStyle(
                    fontSize: 10.5,
                    color: AppPalette.of(context).textSecondary,
                    height: 1.25)),
          ]),
        ),
      ),
    );
  }
}
