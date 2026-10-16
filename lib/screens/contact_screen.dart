import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../theme.dart';
import '../widgets/error_text.dart';

/// AU-062 contact form (covers the web `/contact`). Posts to the real
/// backend `POST /api/v1/contact/submit` with `{name, email, reason, subject,
/// message}` — 201 Created on success (backend ContactController). Anyone may
/// submit; a signed-in email is attached server-side from the JWT.
class ContactScreen extends StatefulWidget {
  const ContactScreen({super.key, this.api});
  final ApiClient? api;
  @override
  State<ContactScreen> createState() => _ContactScreenState();
}

class _ContactScreenState extends State<ContactScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _subject = TextEditingController();
  final _message = TextEditingController();
  String _reason = '';
  bool _sending = false;
  String? _error;

  static const _reasons = [
    'BUYING',
    'SELLING',
    'DELIVERY',
    'PAYMENTS',
    'ACCOUNT',
    'OTHER',
  ];

  @override
  void initState() {
    super.initState();
    final auth = AuthStore.instance;
    if (auth?.email != null) _email.text = auth!.email!;
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _subject.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await _api.submitContactMessage(
        name: _name.text.trim(),
        email: _email.text.trim(),
        reason: _reason,
        subject: _subject.text.trim(),
        message: _message.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Message sent successfully! '
            "We'll get back to you within 24-48 hours."),
        behavior: SnackBarBehavior.floating,
      ));
      Navigator.of(context).maybePop();
    } on ApiException catch (e) {
      AuthStore.instance?.handleUnauthorized();
      setState(() {
        _sending = false;
        _error = e.message;
      });
    } catch (_) {
      setState(() {
        _sending = false;
        _error = 'Could not send your message. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Contact us')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Your name', border: OutlineInputBorder()),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Name is required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email address', border: OutlineInputBorder()),
              validator: (v) {
                final value = (v ?? '').trim();
                if (value.isEmpty) return 'Email is required';
                final re = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
                if (!re.hasMatch(value)) return 'Enter a valid email address';
                return null;
              },
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _reason.isEmpty ? null : _reason,
              decoration: const InputDecoration(labelText: 'Reason', border: OutlineInputBorder()),
              items: [
                for (final r in _reasons)
                  DropdownMenuItem(value: r, child: Text(r[0] + r.substring(1).toLowerCase())),
              ],
              onChanged: (v) => setState(() => _reason = v ?? ''),
              validator: (v) =>
                  (v == null || v.isEmpty) ? 'Please select a reason' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _subject,
              decoration: const InputDecoration(labelText: 'Subject', border: OutlineInputBorder()),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Subject is required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _message,
              maxLines: 5,
              decoration: const InputDecoration(labelText: 'Message', border: OutlineInputBorder(), alignLabelWithHint: true),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Message is required' : null,
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              ErrorText(error: _error),
            ],
            const SizedBox(height: 18),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brandBlue,
                minimumSize: const Size.fromHeight(48),
              ),
              onPressed: _sending ? null : _send,
              child: _sending
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Send message'),
            ),
          ],
        ),
      ),
    );
  }
}
