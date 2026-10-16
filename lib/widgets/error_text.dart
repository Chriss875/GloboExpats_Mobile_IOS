import 'package:flutter/material.dart';

import '../api/api_client.dart';

/// AU-005 error taxonomy: surfaces friendly copy for API failures, never raw
/// exception strings / stack traces. Known HTTP statuses map to actionable
/// copy; anything unknown falls back to a neutral "try again" line.
String friendlyApiError(Object? error, {String fallback = 'Something went wrong. Please try again.'}) {
  if (error is ApiException) {
    final msg = error.message.toLowerCase();
    if (error.unauthorized) return 'Your session has expired. Please log in again.';
    if (msg.contains('401')) return 'Please log in to continue.';
    if (msg.contains('403')) return 'You do not have permission for this.';
    if (msg.contains('404')) return 'We couldn\'t find that.';
    if (msg.contains('500') || msg.contains('502') || msg.contains('503')) {
      return 'The server is having trouble right now. Please try again.';
    }
    // Backend-provided human messages are safe to show (auth errors etc.).
    final raw = error.message.trim();
    if (raw.isNotEmpty && !raw.contains('Exception') && !raw.contains('failed: HTTP')) return raw;
  }
  if (error is ApiException) return fallback;
  return fallback;
}

/// Standard inline error text used by FutureBuilder error branches app-wide.
class ErrorText extends StatelessWidget {
  final Object? error;
  final String context;
  const ErrorText({super.key, this.error, this.context = ''});

  @override
  Widget build(BuildContext context) {
    final prefix = this.context.isEmpty ? '' : '$context\n\n';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Text(
          prefix + friendlyApiError(error),
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.grey.shade600, fontSize: 14),
        ),
      ),
    );
  }
}
