import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:globoexpats_mobile/api/api_client.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Saved locations, against the backend `AddressDTO`
/// (country · region · street · zipCode · latitude · longitude · label ·
/// placeId · placeName · neighbourhood · isDefault).
///
/// Adding an address used to send `{street, city, country, phoneNumber,
/// label}`. `city` and `phoneNumber` are not fields on that DTO, so Jackson
/// dropped them and every address added from the app was stored with **no
/// region and no map pin** — even though the form collected both. Editing the
/// same address afterwards worked, because update already sent the full body,
/// which is what made the bug look like "it saves sometimes".
void main() {
  http.Response ok(Object body, [int status = 200]) => http.Response(
      jsonEncode(body), status, headers: {'content-type': 'application/json'});

  test('adding an address sends the whole DTO, pin included', () async {
    Map<String, dynamic>? sent;
    final api = ApiClient(
      client: MockClient((req) async {
        expect(req.url.path, '/api/v1/add-address');
        sent = (jsonDecode(req.body) as Map).cast<String, dynamic>();
        return ok({'addressId': 1});
      }),
    );

    await api.addAddress('jwt', {
      'label': 'Home',
      'street': 'Msasani Rd',
      'region': 'Dar es Salaam',
      'country': 'Tanzania',
      'placeName': 'Coco Beach',
      'latitude': -6.77,
      'longitude': 39.21,
    });

    expect(sent!['region'], 'Dar es Salaam',
        reason: 'region is the DTO field; city was silently dropped');
    expect(sent!['latitude'], -6.77);
    expect(sent!['longitude'], 39.21);
    expect(sent!['placeName'], 'Coco Beach');
    expect(sent!['label'], 'Home');
    expect(sent!.containsKey('city'), isFalse,
        reason: 'not a DTO field — sending it hid the missing region');
    expect(sent!.containsKey('phoneNumber'), isFalse,
        reason: 'not a DTO field — the form control promised a save it could not do');
  });

  test('a label makes several addresses tellable apart', () async {
    final api = ApiClient(
      client: MockClient((_) async => ok([
            {
              'addressId': 1,
              'label': 'Home',
              'street': 'Msasani Rd',
              'region': 'Dar es Salaam',
              'latitude': -6.77,
              'longitude': 39.21,
            },
            {
              'addressId': 2,
              'label': 'Office',
              'street': 'Ali Hassan Mwinyi Rd',
              'region': 'Dar es Salaam',
            },
          ])),
    );

    final rows = await api.getAddresses('jwt');
    expect(rows, hasLength(2));
    expect(rows.map((a) => a['label']), containsAll(['Home', 'Office']));
    // The pin rides along, which is what the sell picker reads to fill in a
    // listing's pickup coordinates.
    expect(rows.first['latitude'], -6.77);
  });

  test('an address with no pin is still returned, not hidden', () async {
    // The sell flow shows these so the seller can fix them; silently dropping
    // them would leave a listing permanently in "needs attention".
    final api = ApiClient(
      client: MockClient((_) async => ok([
            {'addressId': 2, 'label': 'Office', 'street': 'Ali Hassan Mwinyi Rd'},
          ])),
    );

    final rows = await api.getAddresses('jwt');
    expect(rows, hasLength(1));
    expect(rows.first['latitude'], isNull);
  });

  test('the default address is what checkout and sell prefill from', () async {
    final api = ApiClient(
      client: MockClient((req) async {
        expect(req.url.path, '/api/v1/get-default-address');
        return ok({'addressId': 1, 'label': 'Home', 'region': 'Dar es Salaam'});
      }),
    );

    final def = await api.getDefaultAddress('jwt');
    expect(def!['label'], 'Home');
  });

  test('no default set is an absence, not a failure', () async {
    final api = ApiClient(client: MockClient((_) async => http.Response('', 404)));
    expect(await api.getDefaultAddress('jwt'), isNull);
  });
}
