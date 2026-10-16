/// How a saved address reads when it is offered in a picker — port of web
/// `components/location/saved-address-select.tsx`.
///
/// The two labels are deliberately separate: the primary line is what the
/// buyer recognises ("Home", "Mlimani City Mall"), the secondary line is the
/// detail that tells two similar pins apart. Mobile used to join them with an
/// em dash into one long line, which is what pushed the selected value past
/// the field's border.
library;

String _s(Map<String, dynamic> a, String key) =>
    (a[key] ?? '').toString().trim();

/// Whether this is the buyer's default address.
///
/// The backend's `AddressResponseDTO` declares `private boolean isDefault`, so
/// Lombok's getter is `isDefault()` and Jackson publishes the property as
/// **`default`**. The web never sees this — it computes the flag itself from
/// `/get-default-address` — so a mobile screen reading `isDefault` silently
/// never matches. Read both keys: `default` from the API, `isDefault` from
/// anything shaped like the web's `Address`.
bool savedAddressIsDefault(Map<String, dynamic> a) =>
    a['default'] == true || a['isDefault'] == true;

/// Nickname, else Google's place name, else the street (web `primaryLabel`).
String savedAddressPrimaryLabel(Map<String, dynamic> a) {
  final nickname = _s(a, 'label');
  if (nickname.isNotEmpty) return nickname;
  final placeName = _s(a, 'placeName');
  if (placeName.isNotEmpty) return placeName;
  final street =
      _s(a, 'street').isNotEmpty ? _s(a, 'street') : _s(a, 'address');
  return street.isNotEmpty ? street : 'Address';
}

/// `street, region, country • Default` — the street only when the primary line
/// is a nickname, otherwise it would be printed twice.
String savedAddressSecondaryLabel(Map<String, dynamic> a) {
  final street =
      _s(a, 'street').isNotEmpty ? _s(a, 'street') : _s(a, 'address');
  final region = _s(a, 'region').isNotEmpty ? _s(a, 'region') : _s(a, 'city');
  final parts = <String>[
    if (_s(a, 'label').isNotEmpty && street.isNotEmpty) street,
    if (region.isNotEmpty) region,
    if (_s(a, 'country').isNotEmpty) _s(a, 'country'),
  ];
  final line = parts.join(', ');
  if (!savedAddressIsDefault(a)) return line;
  return line.isEmpty ? 'Default' : '$line • Default';
}
