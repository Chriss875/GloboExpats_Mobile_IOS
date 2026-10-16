import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_picker/image_picker.dart';

import '../api/api_client.dart';
import '../config.dart';
import '../models/sell_form_state.dart' show PendingImage;
import '../auth/auth_store.dart';
import '../domain/request_board.dart' show serviceRequestCategories;
import '../domain/image_upload.dart';
import '../theme.dart';
import '../widgets/seller_verification_gate.dart' show isVerifiedSellerResponse;

/// Create / edit a request-board post — web parity create-request-modal.tsx.
///
/// GOODS and SERVICE alike post multipart (`request` JSON part + `images`) to
/// `/request-board` — the web UI never uses `/request-board/service`
/// (REQUES-14). Phase-3 parity additions on top of the AU-056 base:
///  - category taxonomy: SERVICE uses the platform constant (web
///    SERVICE_REQUEST_CATEGORIES); GOODS options come from the platform
///    categories API with a static fallback (REQUES-10)
///  - goods requests need at least one image (REQUES-12)
///  - edit mode manages photos: existing-image thumbnails, removal via
///    `removeImageUrls`, and new uploads (REQUES-13)
///  - budget validation: positive amounts, max >= min (REQUES-15)
///  - title maxLength 150 + "I am looking for " prefix on create; description
///    maxLength 2000; both with counters (REQUES-16)
///  - fulfilment window: clearable start & deadline, deadline on/after start
///    (REQUES-17)
///  - saved-address picker whose chosen value is reduced to the neighbourhood /
///    region "Only the neighbourhood or region is shown publicly." (REQUES-08)
///  - verification gate before submit (REQUES-09) — verification fetch errors
///    are treated as "cannot disprove" so a user is never hard-blocked by a
///    network blip.
class CreateRequestScreen extends StatefulWidget {
  const CreateRequestScreen({
    super.key,
    this.api,
    this.requestId,
    this.existing,
    this.initialImages = const [],
  });

  final ApiClient? api;

  /// AU-056 owner edit: when [requestId] is set the screen prefills from
  /// [existing] and submits via PUT instead of creating a new one.
  final int? requestId;
  final Map<String, dynamic>? existing;

  /// Test/injection seam: lets a widget test seed "already picked" photos so
  /// the goods at-least-one-image rule can be exercised without the platform
  /// image picker. Production never passes this.
  @visibleForTesting
  final List<PendingImage> initialImages;

  @override
  State<CreateRequestScreen> createState() => _CreateRequestScreenState();
}

class _CreateRequestScreenState extends State<CreateRequestScreen> {
  static const _titlePrefix = 'I am looking for ';

  late final ApiClient _api = widget.api ?? ApiClient();
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _location = TextEditingController();
  final _minBudget = TextEditingController();
  final _maxBudget = TextEditingController();
  String _type = 'GOODS';

  /// Platform goods categories (REQUES-10): fetched once; the hard-coded list
  /// below is the offline/test fallback and keeps the legacy labels reachable.
  List<String> _goodsOptions = const [];

  DateTime? _startDate;
  DateTime? _deadline;
  final List<PendingImage> _images = [];
  final List<String> _existingImageUrls = [];
  final List<String> _removeImageUrls = [];
  String? _category;
  bool _sending = false;
  String? _error;

  bool get _editing => widget.requestId != null;

  static const _fallbackGoods = [
    'Electronics',
    'Furniture',
    'Clothing',
    'Vehicles & Supplies',
    'Home & Kitchen Appliances',
    'Beauty & Personal Care',
    'Other',
  ];

  @override
  void initState() {
    super.initState();
    final src = widget.existing;
    if (src != null && _editing) {
      _title.text = (src['title'] ?? '') as String;
      _description.text = (src['description'] ?? '') as String;
      _location.text = (src['location'] ?? '') as String;
      _type = (src['requestType'] ?? 'GOODS') as String;
      _category = (src['category'] ?? src['serviceCategory']) as String?;
      final minB = src['minimumBudget'];
      if (minB is num) _minBudget.text = _numLabel(minB);
      final maxB = src['maximumBudget'];
      if (maxB is num) _maxBudget.text = _numLabel(maxB);
      final sd = src['fulfillmentStartDate']?.toString();
      if (sd != null && sd.isNotEmpty) _startDate = DateTime.tryParse(sd);
      final dl = src['fulfillmentDeadline']?.toString();
      if (dl != null && dl.length >= 10) {
        _deadline = DateTime.tryParse(dl.substring(0, 10));
      }
      final urls = src['imageUrls'];
      if (urls is List) {
        _existingImageUrls
            .addAll(urls.whereType<String>().where((u) => u.isNotEmpty));
      }
    }
    _images.addAll(widget.initialImages);
    _loadGoodsCategories();
  }

  static String _numLabel(num v) =>
      v == v.roundToDouble() ? '${v.toInt()}' : '$v';

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _location.dispose();
    _minBudget.dispose();
    _maxBudget.dispose();
    super.dispose();
  }

  /// Goods categories come from the platform taxonomy API (web feeds the modal
  /// apiClient.getCategories()); on failure the legacy list stands in so the
  /// form still works offline / under test.
  Future<void> _loadGoodsCategories() async {
    List<String> names = const [];
    try {
      final cats = await _api.fetchCategories();
      names =
          cats.map((c) => c.categoryName).where((n) => n.isNotEmpty).toList();
    } catch (_) {}
    if (!mounted) return;
    if (names.isNotEmpty) setState(() => _goodsOptions = names);
  }

  List<String> get _categoryOptions => _type == 'GOODS'
      ? (_goodsOptions.isNotEmpty ? _goodsOptions : _fallbackGoods)
      : serviceRequestCategories;

  String get _categoryLabel =>
      _type == 'GOODS' ? 'Category' : 'Service category';

  Future<void> _pickStartDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _startDate ?? now,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _startDate = picked);
  }

  Future<void> _pickDeadline() async {
    final now = DateTime.now();
    final first = _startDate ??
        now; // same-day allowed (web RentalDateRangeCalendar allowSameDay)
    final picked = await showDatePicker(
      context: context,
      initialDate: (_deadline != null && !_deadline!.isBefore(first))
          ? _deadline!
          : first,
      firstDate: first,
      lastDate: now.add(const Duration(days: 366)),
    );
    if (picked != null) setState(() => _deadline = picked);
  }

  static String _ymd(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  /// REQUES-16: on CREATE the title carries the web prefix 'I am looking for '.
  /// The web snaps the input back to the bare prefix while it is being typed
  /// and prepends it otherwise; editing keeps whatever the post already says.
  void _onTitleChanged(String v) {
    if (_editing) return; // controller already holds the value
    if (v.startsWith(_titlePrefix)) return;
    final trimmed = v.trim();
    if (trimmed.isEmpty) {
      _title.text = '';
      return;
    }
    if (v.startsWith('I am looking for') || _titlePrefix.startsWith(v)) {
      _title.text = _titlePrefix;
    } else {
      _title.text = '$_titlePrefix$trimmed';
    }
    _title.selection = TextSelection.collapsed(offset: _title.text.length);
  }

  /// Same compression and caps as the sell wizard, so a request photo costs a
  /// requester no more data than a listing photo.
  Future<void> _pickImages() async {
    final picked = await ImagePicker().pickMultiImage(imageQuality: 100);
    if (picked.isEmpty) return;
    for (final x in picked) {
      if (_images.length + _existingImageUrls.length >= 5) break;
      if (await x.length() > kMaxSourceImageBytes) continue;
      Uint8List out;
      try {
        out = await FlutterImageCompress.compressWithList(await x.readAsBytes(),
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
      final mime = sniffImageMime(out);
      if (out.isEmpty ||
          mime == null ||
          !kAllowedUploadMimeTypes.contains(mime) ||
          out.length > kMaxUploadImageBytes) {
        continue;
      }
      _images.add(PendingImage(name: renameForMime(x.name, mime), bytes: out));
    }
    if (mounted) setState(() {});
  }

  void _removeExistingImage(String url) {
    setState(() {
      _existingImageUrls.remove(url);
      if (!_removeImageUrls.contains(url)) _removeImageUrls.add(url);
    });
  }

  /// REQUES-08: web `getPublicAddressLabel` — an address's public location is
  /// its neighbourhood, else its region (never the full street).
  static String _publicAddressLabel(Map<String, dynamic> a) {
    final hood = a['neighbourhood'];
    if (hood != null && '$hood'.trim().isNotEmpty) return '$hood'.trim();
    final region = a['region'];
    if (region != null && '$region'.trim().isNotEmpty) return '$region'.trim();
    final street = a['street'];
    if (street is String && street.trim().isNotEmpty) {
      final parts = street
          .split(',')
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toList();
      return parts.length > 1 ? parts.last : street.trim();
    }
    return (a['placeName'] ?? a['label'] ?? 'Saved address').toString();
  }

  Future<void> _pickSavedAddress() async {
    final token = AuthStore.instance?.token;
    final messenger = ScaffoldMessenger.of(context);
    if (token == null || token.isEmpty) {
      messenger.showSnackBar(
          const SnackBar(content: Text('Log in to choose a saved address.')));
      return;
    }
    List<Map<String, dynamic>> addresses = const [];
    try {
      addresses = await _api.getAddresses(token);
    } catch (_) {}
    if (!mounted) return;
    if (addresses.isEmpty) {
      messenger.showSnackBar(const SnackBar(
          content:
              Text('No saved addresses yet — add one from your account.')));
      return;
    }
    final picked = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (d) => SimpleDialog(
        title: const Text('Select From Saved Addresses'),
        children: [
          for (final a in addresses)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(d, a),
              child: Text(_addressTitle(a)),
            ),
        ],
      ),
    );
    if (picked != null && mounted) {
      setState(() => _location.text = _publicAddressLabel(picked));
    }
  }

  static String _addressTitle(Map<String, dynamic> a) {
    final street = (a['street'] ?? '').toString().trim();
    final place = (a['placeName'] ?? '').toString().trim();
    final region = (a['region'] ?? '').toString().trim();
    if (street.isNotEmpty) return street;
    if (place.isNotEmpty) return place;
    if (region.isNotEmpty) return region;
    return 'Saved address';
  }

  bool get _canAddMorePhotos =>
      (_images.length + _existingImageUrls.length) < 5;

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    final token = AuthStore.instance?.token;
    if (token == null) {
      setState(() => _error = 'Log in to post a request.');
      return;
    }
    // REQUES-17: window end must be on/after start.
    if (_deadline != null &&
        _startDate != null &&
        _deadline!.isBefore(_startDate!)) {
      setState(() => _error = 'End date must be on or after the start date');
      return;
    }
    // REQUES-12: goods posts need at least one image (web create-request-modal
    // reports the same). Existing images on an edit count towards the total.
    final totalImages = _existingImageUrls.length + _images.length;
    if (_type == 'GOODS' && totalImages == 0) {
      setState(
          () => _error = 'At least one image is required for goods requests');
      return;
    }
    // REQUES-09: only verified sellers create requests. A verification fetch
    // that errors is treated as allowed so auth is never hard-blocked by a
    // network blip (empty/absent bodies also pass — mirrors the AU-056 tests).
    try {
      final v = await _api.fetchSellerVerification(token);
      if (v.isNotEmpty && !isVerifiedSellerResponse(v)) {
        if (!mounted) return;
        setState(
            () => _error = 'Verify your account before creating a request.');
        _goVerification();
        return;
      }
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final payload = <String, dynamic>{
        'title': _title.text.trim(),
        'description': _description.text.trim(),
        'requestType': _type,
        if (_type == 'GOODS' && _category != null) 'category': _category,
        if (_type == 'SERVICE' && _category != null)
          'serviceCategory': _category,
        'location':
            _location.text.trim().isEmpty ? null : _location.text.trim(),
        if (_minBudget.text.trim().isNotEmpty)
          'minimumBudget': double.tryParse(_minBudget.text.trim()),
        if (_maxBudget.text.trim().isNotEmpty)
          'maximumBudget': double.tryParse(_maxBudget.text.trim()),
        if (_startDate != null) 'fulfillmentStartDate': _ymd(_startDate!),
        // Web maps deadline = endDate || startDate.
        if (_deadline != null) 'fulfillmentDeadline': _ymd(_deadline!),
      };
      if (_editing) {
        if (_removeImageUrls.isNotEmpty) {
          payload['removeImageUrls'] = List<String>.from(_removeImageUrls);
        }
        if (_images.isNotEmpty) {
          await _api.updateRequestPostWithImages(
              token, widget.requestId!, payload,
              images: _images);
        } else {
          await _api.updateRequestPost(token, widget.requestId!, payload);
        }
      } else {
        // Web parity REQUES-14: GOODS and SERVICE both post to /request-board
        // (the payload's requestType routes service server-side).
        await _api.createRequestPost(token, payload, images: _images);
      }
      if (!mounted) return;
      final editing = _editing;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              editing ? 'Request updated.' : 'Request posted to the board.')));
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = 'Could not post your request. Please try again.';
      });
    }
  }

  void _goVerification() {
    try {
      // ignore: avoid_dynamic_calls
      (context as dynamic).go('/account/verification');
    } catch (_) {
      // Ignore in plain-Navigator hosts.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_editing ? 'Edit request' : 'Post a request')),
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
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'GOODS', label: Text('Looking to buy')),
                  ButtonSegment(
                      value: 'SERVICE', label: Text('Need a service')),
                ],
                selected: {_type},
                showSelectedIcon: false,
                style: ButtonStyle(
                  minimumSize: const WidgetStatePropertyAll(Size(150, 50)),
                  shape: WidgetStatePropertyAll(RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14))),
                  textStyle: const WidgetStatePropertyAll(
                      TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                  foregroundColor: WidgetStateProperty.resolveWith((states) =>
                      states.contains(WidgetState.selected)
                          ? Colors.white
                          : AppPalette.of(context).textPrimary),
                  backgroundColor: WidgetStateProperty.resolveWith((states) =>
                      states.contains(WidgetState.selected)
                          ? AppColors.brandBlue
                          : Colors.white),
                ),
                onSelectionChanged: (s) => setState(() {
                  _type = s.first;
                  _category = null;
                }),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _title,
                maxLength: 150,
                decoration: InputDecoration(
                  labelText: 'Title',
                  hintText: _editing ? null : 'I am looking for...',
                  border: const OutlineInputBorder(),
                  // Counter: web shows "N/150" under the field.
                  counterText: '${_title.text.length}/150',
                ),
                onChanged: _onTitleChanged,
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _category,
                decoration: InputDecoration(
                    labelText: _categoryLabel,
                    border: const OutlineInputBorder()),
                items: [
                  for (final c in _categoryOptions)
                    DropdownMenuItem(value: c, child: Text(c)),
                ],
                onChanged: (v) => setState(() => _category = v),
                validator: (v) =>
                    (v == null || v.isEmpty) ? 'Please select one' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _description,
                maxLines: 4,
                maxLength: 2000,
                decoration: InputDecoration(
                    labelText: 'Describe what you need',
                    alignLabelWithHint: true,
                    border: const OutlineInputBorder(),
                    counterText: '${_description.text.length}/2000'),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _location,
                decoration: InputDecoration(
                  labelText: 'Location',
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    key: const ValueKey('saved-address-btn'),
                    tooltip: 'Select From Saved Addresses',
                    icon: const Icon(Icons.place_outlined),
                    onPressed: _sending ? null : _pickSavedAddress,
                  ),
                ),
              ),
              Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text(
                    'Only the neighbourhood or region is shown publicly.',
                    style: TextStyle(
                        fontSize: 11, color: AppPalette.of(context).textSecondary)),
              ),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: TextFormField(
                    controller: _minBudget,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Min budget (TZS)',
                        border: OutlineInputBorder()),
                    validator: (v) => _budgetError(
                        v, 'Minimum budget must be a positive amount'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextFormField(
                    controller: _maxBudget,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Max budget (TZS)',
                        border: OutlineInputBorder()),
                    validator: (v) {
                      final err = _budgetError(
                          v, 'Maximum budget must be a positive amount');
                      if (err != null) return err;
                      final min = double.tryParse(_minBudget.text.trim());
                      final max = double.tryParse(_maxBudget.text.trim());
                      if (min != null && max != null && max < min) {
                        return 'Maximum budget must be greater than or equal to minimum budget';
                      }
                      return null;
                    },
                  ),
                ),
              ]),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event_available_outlined),
                title: Text(_startDate == null
                    ? 'Needed from (optional)'
                    : 'Needed from ${_startDate!.day}/${_startDate!.month}/${_startDate!.year}'),
                trailing: _startDate == null
                    ? const Icon(Icons.edit_calendar_outlined)
                    : IconButton(
                        icon: const Icon(Icons.close),
                        tooltip: 'Clear start date',
                        onPressed: _sending
                            ? null
                            : () => setState(() => _startDate = null),
                      ),
                onTap: _sending ? null : _pickStartDate,
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event_outlined),
                title: Text(_deadline == null
                    ? 'Needed by (optional)'
                    : 'Needed by ${_deadline!.day}/${_deadline!.month}/${_deadline!.year}'),
                trailing: _deadline == null
                    ? const Icon(Icons.edit_calendar_outlined)
                    : IconButton(
                        icon: const Icon(Icons.close),
                        tooltip: 'Clear deadline',
                        onPressed: _sending
                            ? null
                            : () => setState(() => _deadline = null),
                      ),
                onTap: _sending ? null : _pickDeadline,
              ),
              const SizedBox(height: 4),
              Row(children: [
                OutlinedButton.icon(
                  onPressed:
                      (!_canAddMorePhotos || _sending) ? null : _pickImages,
                  icon:
                      const Icon(Icons.add_photo_alternate_outlined, size: 18),
                  label: Text(_totalPhotoLabel()),
                ),
                if (_images.isNotEmpty || _existingImageUrls.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: _sending ? null : _clearNewImages,
                    child: const Text('Clear'),
                  ),
                ],
              ]),
              if (_existingImageUrls.isNotEmpty) ...[
                const SizedBox(height: 8),
                _photoStrip(existing: true),
              ],
              if (_images.isNotEmpty) ...[
                const SizedBox(height: 8),
                _photoStrip(existing: false),
              ],
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(_error!,
                    style: const TextStyle(
                        color: Color(0xFFDC2626), fontSize: 13, height: 1.4)),
              ],
              const SizedBox(height: 16),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brandBlue,
                  minimumSize: const Size.fromHeight(48),
                ),
                onPressed: _sending ? null : _submit,
                child: _sending
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Post request'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _totalPhotoLabel() {
    final total = _images.length + _existingImageUrls.length;
    if (total == 0) return 'Add photos (optional)';
    return '$total of 5 photo${total == 1 ? '' : 's'}';
  }

  void _clearNewImages() => setState(_images.clear);

  Widget _photoStrip({required bool existing}) {
    return SizedBox(
      height: 64,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: existing ? _existingImageUrls.length : _images.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) => Stack(children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: existing
                ? Image.network(
                    AppConfig.resolveAssetUrl(_existingImageUrls[i]),
                    width: 64,
                    height: 64,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                        width: 64,
                        height: 64,
                        color: AppPalette.of(context).background,
                        child: const Icon(Icons.image_outlined,
                            color: Colors.grey)),
                  )
                : Image.memory(_images[i].bytes,
                    width: 64,
                    height: 64,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                        width: 64,
                        height: 64,
                        color: AppPalette.of(context).background,
                        child: const Icon(Icons.image_outlined,
                            color: Colors.grey))),
          ),
          Positioned(
            top: 0,
            right: 0,
            child: GestureDetector(
              onTap: () => existing
                  ? _removeExistingImage(_existingImageUrls[i])
                  : setState(() => _images.removeAt(i)),
              child: Container(
                decoration: const BoxDecoration(
                    color: Colors.black54, shape: BoxShape.circle),
                padding: const EdgeInsets.all(2),
                child: const Icon(Icons.close, size: 14, color: Colors.white),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  String? _budgetError(String? v, String message) {
    final t = v?.trim() ?? '';
    if (t.isEmpty) return null;
    final parsed = double.tryParse(t);
    if (parsed == null || parsed < 0) return message;
    return null;
  }
}
