import 'dart:async';

import 'package:http/http.dart' as http;

/// Every request gets a deadline.
///
/// `package:http` applies no timeout of its own, so on a weak mobile signal a
/// call can sit open until the OS gives up minutes later. Anything awaiting
/// it waits with it — which is how the app came to hang on a blank screen
/// instead of opening.
///
/// A timeout surfaces as [http.ClientException], the same type a dropped
/// connection throws, so callers that already handle "the network failed"
/// need no new branch.
class TimeoutClient extends http.BaseClient {
  TimeoutClient(this._inner, {this.timeout = const Duration(seconds: 20)});

  final http.Client _inner;
  final Duration timeout;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    return _inner.send(request).timeout(
          timeout,
          onTimeout: () => throw http.ClientException(
              'The server took too long to respond. Check your connection '
              'and try again.',
              request.url),
        );
  }

  @override
  void close() => _inner.close();
}
