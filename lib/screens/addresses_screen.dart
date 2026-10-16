import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../config.dart';
import '../services/geocoding_service.dart';
import '../theme.dart';
import '../widgets/account_ui.dart';
import '../widgets/error_text.dart';
import '../widgets/map_location_picker.dart';
import '../widgets/skeleton_loader.dart';

/// Address book (covers the web `/account/addresses`). Full CRUD against the
/// authenticated sandbox API — list, add, edit (PUT /update-address/{id}),
/// delete with confirm (DELETE /delete-address/{id}) and set-default
/// (POST /set-default-address?addressId=). Each address can carry a map pin,
/// set via [MapLocationPicker] (web parity `MapPinPicker`) — search, tap, drag
/// or "use current location", never freehand lat/lng — so it is always in
/// range and never the null island by construction. The coordinates ride the
/// proforma payload and delivery-quote destination.
///
/// The web keeps this same book in two places — its own page at
/// `/account/addresses`, and a "Shipping Addresses" section embedded directly
/// in Profile Information. [AddressBookSection] is the shared body for both:
/// this screen wraps it in a Scaffold, and the Profile screen embeds it
/// directly (`embedded: true`, no AppBar of its own).
class AddressesScreen extends StatelessWidget {
  const AddressesScreen({super.key, this.auth, this.api});
  final AuthStore? auth;
  final ApiClient? api;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Addresses')),
      body: AddressBookSection(auth: auth, api: api),
    );
  }
}

class AddressBookSection extends StatefulWidget {
  const AddressBookSection({
    super.key,
    this.auth,
    this.api,
    this.embedded = false,
  });
  final AuthStore? auth;
  final ApiClient? api;

  /// True when rendered inside Profile Information rather than its own page:
  /// drops the pull-to-refresh (a scroll parent already owns that) and shows
  /// "Add New" as a heading button instead of an AppBar action.
  final bool embedded;

  @override
  State<AddressBookSection> createState() => _AddressBookSectionState();
}

class _AddressBookSectionState extends State<AddressBookSection> {
  // Falls back to a token-less store rather than force-unwrapping the
  // singleton: embedded in Profile Information, this builds even on the
  // signed-out render of that screen (its own fields stay visible with no
  // session either) - `_load()` already turns a missing token into a clean
  // "Not logged in" error rather than a real list.
  late final AuthStore _auth = widget.auth ?? AuthStore.instance ?? AuthStore();
  late final ApiClient _api = widget.api ?? ApiClient();
  late Future<List<Map<String, dynamic>>> _future = _load();

  // A-21: the Profile-embedded book pages 5 per page like web
  // `PROFILE_ADDRESS_PAGE_SIZE = 5` (app/account/settings/page.tsx:96).
  static const int _embeddedPageSize = 5;
  int _addressPage = 0;

  Future<List<Map<String, dynamic>>> _load() {
    final token = _auth.token;
    if (token == null) return Future.error('Not logged in');
    return _api.getAddresses(token);
  }

  void _reload() {
    // Block body, not `=> setState(() => _future = _load())`: that arrow form
    // makes the closure's own value the assignment's result, which is the
    // Future `_load()` returns — and Flutter's setState asserts loudly if its
    // callback hands back a Future. Harmless when nothing awaits after the
    // reload call, but this method is also invoked from async continuations
    // (after the add/edit sheet closes), where it fires for real.
    if (!mounted) return;
    setState(() {
      _future = _load();
    });
  }

  Future<void> _sheet(Map<String, dynamic>? existing) async {
    final token = _auth.token;
    if (token == null) return;
    await showAddressEditorSheet(context,
        api: _api, token: token, existing: existing);
    // Saved or dismissed, the list may be stale either way.
    _reload();
  }

  Future<void> _add() => _sheet(null);

  Future<void> _edit(Map<String, dynamic> a) => _sheet(a);

  Future<void> _delete(Map<String, dynamic> a) async {
    final token = _auth.token;
    if (token == null) return;
    final id = (a['addressId'] as num).toInt();
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Delete address?'),
        content: Text('"${a['label'] ?? a['street'] ?? 'This address'}" will be removed.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            onPressed: () => Navigator.pop(d, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    // Captured before the await below (use_build_context_synchronously).
    // ignore: use_build_context_synchronously
    final messenger = ScaffoldMessenger.of(context);
    try {
      await _api.deleteAddress(token, id);
      messenger.showSnackBar(const SnackBar(content: Text('Address deleted.')));
      _reload();
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      messenger.showSnackBar(SnackBar(content: Text('Could not delete: ${e.message}')));
    } catch (_) {
      messenger.showSnackBar(const SnackBar(content: Text('Could not delete the address.')));
    }
  }

  Future<void> _setDefault(Map<String, dynamic> a) async {
    final token = _auth.token;
    if (token == null) return;
    final id = (a['addressId'] as num).toInt();
    final messenger = ScaffoldMessenger.of(context);
    try {
      await _api.setDefaultAddress(token, id);
      // ACCOUN-14: a new shipping default re-syncs the seller's product
      // locations so fulfilment uses the updated default (web chains
      // sync-location after set-default). Best-effort — never fails the
      // primary action.
      await _api.syncSellerProductLocation(token);
      messenger.showSnackBar(const SnackBar(content: Text('Default address updated.')));
      _reload();
    } on ApiException catch (e) {
      if (e.unauthorized) AuthStore.instance?.handleUnauthorized();
      messenger.showSnackBar(SnackBar(content: Text('Could not set default: ${e.message}')));
    } catch (_) {
      messenger.showSnackBar(const SnackBar(content: Text('Could not set the default address.')));
    }
  }

  Widget _header() {
    final palette = AppPalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: palette.infoFill,
            borderRadius: BorderRadius.circular(11),
          ),
          child: Icon(Icons.place_outlined, size: 19, color: palette.accentInk),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Shipping Addresses',
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: palette.textPrimary)),
              Text('Pickup and delivery points, pinned on the map',
                  style: TextStyle(fontSize: 12, color: palette.textSecondary)),
            ],
          ),
        ),
        FilledButton.icon(
          onPressed: _add,
          icon: const Icon(Icons.add_rounded, size: 17),
          label: const Text('Add New'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brandBlue,
            visualDensity: VisualDensity.compact,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ]),
    );
  }

  Widget _body(BuildContext context, AsyncSnapshot<List<Map<String, dynamic>>> snap) {
    if (snap.connectionState == ConnectionState.waiting) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: FeedSkeleton(),
      );
    }
    if (snap.hasError) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Text('Could not load addresses: ${friendlyApiError(snap.error)}',
            textAlign: TextAlign.center),
      );
    }
    final addrs = snap.data ?? const [];
    if (addrs.isEmpty) {
      return widget.embedded ? _embeddedEmpty() : _standaloneEmpty();
    }
    // A-21: only the embedded Profile book paginates (5/page, web
    // PROFILE_ADDRESS_PAGE_SIZE). The standalone /account/addresses page shows
    // the whole book at once — exactly like the web page it mirrors.
    final pageCount =
        widget.embedded ? (addrs.length / _embeddedPageSize).ceil() : 1;
    final page = _addressPage.clamp(0, pageCount - 1).toInt();
    final start = widget.embedded ? page * _embeddedPageSize : 0;
    final end = widget.embedded
        ? (start + _embeddedPageSize > addrs.length
            ? addrs.length
            : start + _embeddedPageSize)
        : addrs.length;
    final shown = widget.embedded ? addrs.sublist(start, end) : addrs;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final a in shown) ...[
          _AddressCard(
            address: a,
            onEdit: () => _edit(a),
            onDelete: () => _delete(a),
            onSetDefault: () => _setDefault(a),
          ),
          const SizedBox(height: 10),
        ],
        if (widget.embedded && pageCount > 1) _pager(page, pageCount),
      ],
    );
  }

  /// Web `/account/addresses` empty card (page.tsx:505-517): icon, heading,
  /// helper line and the "Add Your First Address" CTA (A-21).
  Widget _standaloneEmpty() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        border: Border.all(color: AppPalette.of(context).border),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          Icon(Icons.place_outlined,
              size: 40, color: AppPalette.of(context).textSecondary),
          const SizedBox(height: 10),
          const Text('No addresses saved',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text('Add your delivery address to check out faster',
              textAlign: TextAlign.center,
              style:
                  TextStyle(fontSize: 13, color: AppPalette.of(context).textSecondary)),
          const SizedBox(height: 14),
          FilledButton.icon(
            key: const ValueKey('address-empty-add'),
            style: FilledButton.styleFrom(
                backgroundColor: AppColors.brandBlue,
                foregroundColor: Colors.white),
            onPressed: _add,
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add Your First Address'),
          ),
        ],
      ),
    );
  }

  /// Web Profile-settings empty state (settings/page.tsx:1110-1121): dashed
  /// box with an "Add Address" outline CTA (A-21).
  Widget _embeddedEmpty() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 12),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        border: Border.all(color: AppPalette.of(context).border),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          Text('No shipping addresses saved',
              style: TextStyle(fontSize: 13, color: AppPalette.of(context).textSecondary)),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            key: const ValueKey('address-empty-add-embedded'),
            style: OutlinedButton.styleFrom(
                visualDensity: VisualDensity.compact,
                foregroundColor: AppPalette.of(context).accentInk),
            onPressed: _add,
            icon: const Icon(Icons.add, size: 16),
            label: const Text('Add Address'),
          ),
        ],
      ),
    );
  }

  /// A-21: compact prev/dot/next pager for the embedded 5-per-page book.
  Widget _pager(int page, int count) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            key: const ValueKey('addr-prev-page'),
            tooltip: 'Previous shipping address page',
            visualDensity: VisualDensity.compact,
            onPressed:
                page > 0 ? () => setState(() => _addressPage = page - 1) : null,
            icon: const Icon(Icons.chevron_left, size: 22),
          ),
          for (var i = 0; i < count; i++)
            InkWell(
              key: ValueKey('addr-page-$i'),
              onTap: () => setState(() => _addressPage = i),
              borderRadius: BorderRadius.circular(999),
              child: Container(
                width: i == page ? 22 : 8,
                height: 8,
                margin: const EdgeInsets.symmetric(horizontal: 4),
                decoration: BoxDecoration(
                  color: i == page
                      ? AppColors.brandBlue
                      : AppPalette.of(context).borderStrong,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
          IconButton(
            key: const ValueKey('addr-next-page'),
            tooltip: 'Next shipping address page',
            visualDensity: VisualDensity.compact,
            onPressed: page < count - 1
                ? () => setState(() => _addressPage = page + 1)
                : null,
            icon: const Icon(Icons.chevron_right, size: 22),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final list = FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snap) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [_header(), _body(context, snap)],
      ),
    );

    if (widget.embedded) return list;

    return RefreshIndicator(
      onRefresh: () async => _reload(),
      child: AccountFormTheme(
        child: ListView(padding: const EdgeInsets.all(16), children: [list]),
      ),
    );
  }
}

class _AddressCard extends StatelessWidget {
  const _AddressCard({
    required this.address,
    required this.onEdit,
    required this.onDelete,
    required this.onSetDefault,
  });
  final Map<String, dynamic> address;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback onSetDefault;

  IconData _iconFor(String label) {
    final l = label.toLowerCase();
    if (l.contains('home') || l.contains('house')) return Icons.home_outlined;
    if (l.contains('office') || l.contains('work')) return Icons.work_outline_rounded;
    if (l.contains('shop') || l.contains('store')) return Icons.storefront_outlined;
    return Icons.place_outlined;
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final a = address;
    // Web parity `app/account/addresses/page.tsx`:
    // `addressLabel || address.placeName || address.street`. A saved pin with
    // no nickname should read as "Mlimani City Shopping Mall", not a generic
    // "Address" over a Plus Code - the place name is exactly what makes a
    // saved location recognisable when picking one at checkout.
    final nickname = (a['label'] ?? '').toString().trim();
    final placeName = (a['placeName'] ?? '').toString().trim();
    final streetRaw = (a['street'] ?? a['address'] ?? '').toString();
    final label = nickname.isNotEmpty
        ? nickname
        : placeName.isNotEmpty
            ? placeName
            : (streetRaw.isNotEmpty ? streetRaw : 'Address');
    final region = (a['region'] ?? a['city'] ?? '').toString();
    final street = (a['street'] ?? a['address'] ?? '').toString();
    final country = (a['country'] ?? '').toString();
    final hasPin = a['latitude'] is num && a['longitude'] is num && a['latitude'] != 0;
    final isDefault = a['default'] == true;

    // Surface-coloured in both themes (it used to be a hard white card that
    // glared in dark mode); the default address gets the info tint.
    return Container(
      decoration: BoxDecoration(
        color: isDefault ? palette.infoFill : palette.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
            color: isDefault ? palette.infoBorder : palette.border),
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: isDefault ? palette.surface : palette.infoFill,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(_iconFor(label), size: 21, color: palette.accentInk),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Flexible(
                          child: Text(label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: palette.textPrimary))),
                      if (isDefault) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: palette.successFill,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text('Default',
                              style: TextStyle(
                                  color: palette.successText,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700)),
                        ),
                      ],
                    ]),
                    const SizedBox(height: 3),
                    Text(
                        [street, region, country]
                            .where((e) => e.isNotEmpty)
                            .join(', '),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: palette.textSecondary,
                            fontSize: 13,
                            height: 1.35)),
                    const SizedBox(height: 6),
                    Row(children: [
                      Icon(hasPin ? Icons.my_location_rounded : Icons.location_off_outlined,
                          size: 13,
                          color: hasPin ? palette.successText : palette.warningText),
                      const SizedBox(width: 4),
                      Text(hasPin ? 'Pinned on the map' : 'No map pin yet',
                          style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                              color: hasPin
                                  ? palette.successText
                                  : palette.warningText)),
                    ]),
                  ],
                ),
              ),
            ],
          ),
        ),
        Divider(height: 1, color: palette.border),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: Row(children: [
            TextButton.icon(
              onPressed: onEdit,
              icon: Icon(hasPin ? Icons.edit_outlined : Icons.add_location_alt_outlined,
                  size: 16),
              label: Text(hasPin ? 'Edit' : 'Add pin',
                  style: const TextStyle(fontSize: 12.5)),
            ),
            if (!isDefault)
              TextButton.icon(
                onPressed: onSetDefault,
                icon: const Icon(Icons.star_border_rounded, size: 17),
                label:
                    const Text('Set default', style: TextStyle(fontSize: 12.5)),
              ),
            const Spacer(),
            IconButton(
              tooltip: 'Delete',
              icon: Icon(Icons.delete_outline_rounded,
                  size: 19, color: palette.dangerText),
              onPressed: onDelete,
            ),
          ]),
        ),
      ]),
    );
  }
}

/// The add/edit address sheet, shared by the address book, the account
/// setup checklist and the sell wizard so none of them has to send the user
/// off to another page to add a location. [existing] == null → create.
/// [makeDefault] pre-ticks "Set as default" (a first address should be the
/// default). Resolves true once an address was saved.
Future<bool> showAddressEditorSheet(
  BuildContext context, {
  required ApiClient api,
  required String token,
  Map<String, dynamic>? existing,
  bool makeDefault = false,
}) async {
  final label = TextEditingController(text: existing?['label']?.toString() ?? '');
  final street = TextEditingController(text: existing?['street']?.toString() ?? '');
  final city = TextEditingController(
      text: (existing?['region'] ?? 'Dar es Salaam').toString());
  final country =
      TextEditingController(text: (existing?['country'] ?? 'Tanzania').toString());
  // Web parity `app/account/addresses/page.tsx` + `app/account/settings/page.tsx`:
  // place name is never a text field the user types into - it is captured
  // silently from the pin (a search result or Place Details) and shown only
  // inside the read-only "resolved address" confirmation below.
  String placeName = existing?['placeName']?.toString() ?? '';
  Coordinates? pinCoords =
      (existing?['latitude'] is num && existing?['longitude'] is num)
          ? Coordinates((existing!['latitude'] as num).toDouble(),
              (existing['longitude'] as num).toDouble())
          : null;
  String? apiError;
  // ACCOUN-13: "Set as default address" — web lets you make the saved
  // location the default in the same step. A newly added address that is
  // checked gets set-default (plus the products/location re-sync) after it
  // exists, exactly like the address-card "Set default" action does.
  var setDefault = makeDefault || existing?['default'] == true;
  // Web parity `MAPS_AVAILABLE = Boolean(NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)`:
  // manual Street/City/Country inputs exist ONLY as the fallback for no key
  // configured at all - never alongside the picker, and a pin becomes
  // required to save once a key is configured (see the submit handler).
  final mapsConfigured = AppConfig.mapsConfigured;

  final systemInset = MediaQuery.of(context).padding.bottom;
  // Captured before any await so the default step can still report.
  final messenger = ScaffoldMessenger.maybeOf(context);
  final savedId = await showModalBottomSheet<int>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => AccountFormTheme(
        child: StatefulBuilder(
      builder: (ctx, setSheet) => Padding(
        // `MediaQuery.padding` is ZERO inside a modal sheet — the route
        // strips it — so the system navigation bar's inset has to be read
        // from the calling context and carried in. Whichever of the two
        // bottom obstructions is taller wins: with the keyboard up it
        // covers the navigation bar, so they must not be added together.
        padding: EdgeInsets.only(
            bottom: math.max(MediaQuery.of(ctx).viewInsets.bottom,
                systemInset)),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: AppPalette.of(context).infoFill,
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Icon(Icons.add_location_alt_outlined,
                      size: 20, color: AppPalette.of(context).accentInk),
                ),
                const SizedBox(width: 10),
                Text(existing == null ? 'Add address' : 'Edit address',
                    style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: AppPalette.of(context).textPrimary)),
              ]),
              const SizedBox(height: 8),
              // Web parity: "Preferred location name" is the name shown
              // everywhere this address is picked from - not the raw
              // street, which may be an unfriendly Plus Code.
              Text(
                'This is the name you will see when choosing saved locations. '
                "Use something simple like Home, Office, Shop, or Friend's place.",
                style: TextStyle(fontSize: 12, color: AppPalette.of(context).textSecondary),
              ),
              const SizedBox(height: 14),
              TextFormField(
                  controller: label,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                      labelText: 'Preferred location name',
                      prefixIcon: Icon(Icons.bookmark_border_rounded))),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: 8,
                  children: [
                    for (final suggestion in const ['Home', 'Shop', 'Office'])
                      ChoiceChip(
                        label: Text(suggestion),
                        selected: label.text.trim() == suggestion,
                        onSelected: (_) => setSheet(() => label.text = suggestion),
                        visualDensity: VisualDensity.compact,
                        shape: const StadiumBorder(),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Align(
                alignment: Alignment.centerLeft,
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.place_outlined, size: 15, color: AppPalette.of(context).accentInk),
                  SizedBox(width: 6),
                  Text('Your location',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  Text(' *', style: TextStyle(color: AppPalette.of(context).dangerText, fontSize: 13)),
                ]),
              ),
              const SizedBox(height: 6),
              // Web parity `MapPinPicker`: search, tap the map, drag the
              // pin, or use current location - each resolves street / city
              // / country / place name below. The search box only prefills
              // the saved label when EDITING an address that already has
              // one - a fresh add starts blank (web parity `savedLocationLabel`).
              MapLocationPicker(
                coordinates: pinCoords,
                savedLocationLabel: existing != null
                    ? (placeName.isNotEmpty ? placeName : street.text)
                    : null,
                onChanged: (coords, address) {
                  setSheet(() {
                    pinCoords = coords;
                    if (address != null) {
                      // Web parity `handlePinChange`:
                      // `street || formattedAddress.split(',')[0]`. A POI
                      // pin (a mall, a hotel) reverse-geocodes with no
                      // `route` component at all, so without this fallback
                      // the field the backend requires stays empty.
                      final street0 = (address.street ?? '').isNotEmpty
                          ? address.street!
                          : address.formattedAddress.split(',').first.trim();
                      if (street0.isNotEmpty) street.text = street0;
                      if ((address.city ?? '').isNotEmpty) city.text = address.city!;
                      if ((address.country ?? '').isNotEmpty) country.text = address.country!;
                      // Web parity: only a search/Place-Details result ever
                      // carries a place name - a raw map tap or a GPS fix
                      // never does, and correctly leaves this untouched.
                      if ((address.placeName ?? '').isNotEmpty) {
                        placeName = address.placeName!;
                      }
                    }
                  });
                },
              ),
              const SizedBox(height: 8),
              if (mapsConfigured)
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Search your place, then drag the pin to your exact spot.',
                    style: TextStyle(fontSize: 11.5, color: AppPalette.of(context).textSecondary),
                  ),
                )
              else ...[
                const SizedBox(height: 8),
                TextFormField(
                    controller: street,
                    decoration: const InputDecoration(
                        labelText: 'Street or area *', border: OutlineInputBorder())),
                const SizedBox(height: 10),
                TextFormField(
                    controller: city,
                    decoration: const InputDecoration(
                        labelText: 'City or region *', border: OutlineInputBorder())),
                const SizedBox(height: 10),
                TextFormField(
                    controller: country,
                    decoration: const InputDecoration(
                        labelText: 'Country *', border: OutlineInputBorder())),
              ],
              // Web parity: "Resolved address - captured from the pin,
              // shown for confirmation" - a read-only summary, never a set
              // of editable Street/Place-name boxes.
              if (placeName.isNotEmpty ||
                  street.text.isNotEmpty ||
                  city.text.isNotEmpty ||
                  country.text.isNotEmpty) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppPalette.of(context).background,
                    border: Border.all(color: AppPalette.of(context).border),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.place_outlined, size: 18, color: AppPalette.of(context).accentInk),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (placeName.isNotEmpty)
                              Text(placeName,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700, fontSize: 13.5)),
                            Text(
                              [street.text, city.text, country.text]
                                  .where((s) => s.isNotEmpty)
                                  .join(', '),
                              style: TextStyle(
                                  color: AppPalette.of(context).textSecondary, fontSize: 12.5),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              if (apiError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(apiError!,
                        style: TextStyle(color: AppPalette.of(context).dangerText, fontSize: 12)),
                  ),
                ),
              const SizedBox(height: 8),
              CheckboxListTile(
                value: setDefault,
                onChanged: (v) => setSheet(() => setDefault = v ?? false),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                dense: true,
                title: const Text('Set as default address',
                    style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
              ),
              const SizedBox(height: 8),
              FilledButton(
                style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brandBlue,
                    minimumSize: const Size.fromHeight(50),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14))),
                onPressed: () async {
                  // Web parity `handleSaveAddress`: a pin is REQUIRED once
                  // maps are available - the manual fields it would
                  // otherwise fall back to aren't even on screen.
                  if (mapsConfigured && pinCoords == null) {
                    setSheet(() => apiError =
                        'Pin your location: search for your place and drop a pin on the map.');
                    return;
                  }
                  if (street.text.trim().isEmpty ||
                      city.text.trim().isEmpty ||
                      country.text.trim().isEmpty) {
                    setSheet(() => apiError = mapsConfigured
                        ? 'Location not recognised — adjust the pin until the street, region and country fill in.'
                        : 'Address incomplete — enter the street or area, city or region, and country.');
                    return;
                  }
                  // Exactly the backend AddressDTO. 'city' and
                  // 'phoneNumber' are not fields on it — Jackson drops
                  // them — so the region goes in 'region' where it belongs.
                  final body = <String, dynamic>{
                    'label': label.text.trim(),
                    'street': street.text.trim(),
                    'region': city.text.trim(),
                    'country': country.text.trim(),
                    if (placeName.trim().isNotEmpty) 'placeName': placeName.trim(),
                    if (pinCoords != null) ...{
                      'latitude': pinCoords!.latitude,
                      'longitude': pinCoords!.longitude,
                    },
                  };
                  try {
                    int? savedId;
                    if (existing == null) {
                      // Same body as an edit, so a new address keeps its
                      // pin and place name instead of losing them. The
                      // created row carries the addressId needed to promote
                      // it to default right after saving.
                      final created = await api.addAddress(token, body);
                      final rawId = created['addressId'] ?? created['id'];
                      savedId = rawId is num ? rawId.toInt() : null;
                    } else {
                      savedId = (existing['addressId'] as num).toInt();
                      await api.updateAddress(token, savedId, body);
                    }
                    // -1: saved, but the response carried no id to promote.
                    if (ctx.mounted) Navigator.of(ctx).pop(savedId ?? -1);
                  } on ApiException catch (e) {
                    if (e.unauthorized) AuthStore.instance?.handleUnauthorized();
                    setSheet(() => apiError = e.message);
                  }
                },
                child:
                    Text(existing == null ? 'Save address' : 'Update address'),
              ),
            ],
          ),
        ),
      ),
    )),
  );
  // Dispose after the sheet's exit animation completes — disposing while
  // the route is still tearing down rebuilds TextFormFields with dead
  // controllers ("used after being disposed").
  WidgetsBinding.instance.addPostFrameCallback((_) {
    label.dispose(); street.dispose(); city.dispose(); country.dispose();
  });
  if (savedId == null) return false;
  // ACCOUN-13/14: "Set as default address" in the same step as saving. Run
  // after the sheet closes so a set-default failure never reads as a failed
  // save — the address already exists either way. The seller's
  // product/location re-sync follows best-effort, exactly as the address-card
  // "Set default" action does.
  if (setDefault && savedId > 0) {
    try {
      await api.setDefaultAddress(token, savedId);
      await api.syncSellerProductLocation(token);
      messenger?.showSnackBar(
          const SnackBar(content: Text('Default address updated.')));
    } on ApiException catch (e) {
      if (e.unauthorized) AuthStore.instance?.handleUnauthorized();
      messenger?.showSnackBar(
          SnackBar(content: Text('Could not set default: ${e.message}')));
    } catch (_) {
      messenger?.showSnackBar(
          const SnackBar(content: Text('Could not set the default address.')));
    }
  }
  return true;
}
