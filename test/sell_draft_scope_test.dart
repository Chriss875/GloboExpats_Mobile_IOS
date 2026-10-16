// A sell draft belongs to one server and one account. The phone keeps a
// single draft slot, so a draft started on the live app used to come back on
// a dev build — with the live account's address and map pin, which then
// passed for "location set" — or under the next person to sign in. And a
// published listing must never come back as the next draft.
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:globoexpats_mobile/auth/auth_store.dart';
import 'package:globoexpats_mobile/models/sell_form_state.dart';
import 'package:globoexpats_mobile/storage/kv_store.dart';

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await KvStore.instance.load();
  });
  tearDown(() => AuthStore.instance = null);

  test('a draft is stamped with the server and account it was written for',
      () {
    AuthStore.instance = AuthStore(initialToken: 'jwt', initialEmail: 'Seller@X.com');
    final draft = (SellFormState()..title = 'Chair').toDraftJson();
    expect(SellFormState.draftBelongsHere(draft), isTrue);

    AuthStore.instance = AuthStore(initialToken: 'jwt', initialEmail: 'other@x.com');
    expect(SellFormState.draftBelongsHere(draft), isFalse,
        reason: 'another account never gets it');
    expect(SellFormState.draftBelongsHere({'title': 'Old unstamped draft'}),
        isFalse,
        reason: 'a draft from before stamping cannot say whose it is');
  });

  testWidgets('a cancelled autosave never writes the listing back',
      (tester) async {
    AuthStore.instance = AuthStore(initialToken: 'jwt', initialEmail: 's@x.com');
    final state = SellFormState()..title = 'Chair';
    state.scheduleDraftSave(KvStore.instance);
    // Published: the draft is cleared and the pending save dropped.
    state.cancelPendingDraftSave();
    await SellFormState.clearDraft(KvStore.instance);
    await tester.pump(const Duration(seconds: 4));
    expect(await SellFormState.loadDraft(KvStore.instance), isNull);
    state.dispose();
  });
}
