import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_store.dart';
import '../models/category.dart';
import '../theme.dart';

/// Sell — create a listing (covers the web `/sell` + `/edit-listing/[id]`).
/// Requires login; posts a **multipart** `/products/post-product` request with
/// the required ListProductDTO fields (category, subcategory, quantity, location)
/// matching the reference `/sell` form. Reports the real result (never faked).
class SellScreen extends StatefulWidget {
  const SellScreen({super.key, this.auth, this.api, this.editing = false, this.listingId});
  final AuthStore? auth;
  final ApiClient? api;
  final bool editing;
  final int? listingId;
  @override
  State<SellScreen> createState() => _SellScreenState();
}

class _SellScreenState extends State<SellScreen> {
  late final AuthStore _auth = widget.auth ?? AuthStore.instance!;
  late final ApiClient _api = widget.api ?? ApiClient();
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _price = TextEditingController();
  final _quantity = TextEditingController(text: '1');
  final _description = TextEditingController();
  final _region = TextEditingController(text: 'Dar es Salaam');
  final _street = TextEditingController();
  final _whatsapp = TextEditingController();
  String _condition = 'USED';
  int? _categoryId;
  int? _subcategoryId;
  List<Category> _categories = const [];
  List<Subcategory> _subcategories = const [];
  bool _loadingCat = true;
  bool _submitting = false;
  String? _error;
  String? _ok;

  @override
  void initState() {
    super.initState();
    _api.fetchCategories().then((c) {
      if (!mounted) return;
      setState(() { _categories = c; _loadingCat = false; });
    }).catchError((_) {
      if (mounted) setState(() => _loadingCat = false);
    });
  }

  @override
  void dispose() {
    _title.dispose(); _price.dispose(); _quantity.dispose(); _description.dispose();
    _region.dispose(); _street.dispose(); _whatsapp.dispose();
    super.dispose();
  }

  void _selectCategory(int? id) {
    setState(() {
      _categoryId = id;
      _subcategoryId = null;
      _subcategories = _categories.firstWhere((c) => c.categoryId == id, orElse: () => const Category(categoryId: 0, categoryName: '')).subcategories;
    });
  }

  Future<void> _submit() async {
    setState(() { _error = null; _ok = null; });
    if (!_form.currentState!.validate()) return;
    if (_auth.token == null) { setState(() => _error = 'Log in to list an item.'); return; }
    if (_categoryId == null) { setState(() => _error = 'Choose a category.'); return; }
    setState(() => _submitting = true);
    try {
      final body = <String, dynamic>{
        'productName': _title.text.trim(),
        'categoryId': _categoryId,
        if (_subcategoryId != null) 'subcategoryId': _subcategoryId,
        'condition': _condition,
        'productDescription': _description.text.trim(),
        'currency': 'TZS',
        'askingPrice': double.tryParse(_price.text.trim()) ?? 0,
        'productQuantity': double.tryParse(_quantity.text.trim()) ?? 1,
        'productRegion': _region.text.trim(),
        'productStreet': _street.text.trim(),
        'whatsappNumber': _whatsapp.text.trim(),
      };
      final res = (widget.editing && widget.listingId != null)
          ? await _api.updateListing(_auth.token!, widget.listingId!, body)
          : await _api.createListing(_auth.token!, body);
      if (!mounted) return;
      setState(() { _submitting = false; _ok = res.isNotEmpty ? 'Listing created.' : 'Listing submitted to the sandbox.'; });
      _title.clear(); _price.clear(); _description.clear(); _street.clear();
    } on ApiException catch (e) {
      // ignore: discarded_futures
      AuthStore.instance?.handleUnauthorized();
      setState(() { _submitting = false; _error = e.message; });
    } catch (e) {
      setState(() { _submitting = false; _error = 'Unexpected error: $e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.editing ? 'Edit listing' : 'Sell')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(widget.editing ? 'Update your listing' : 'List an item',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('Sell for free to the expat community.', style: TextStyle(color: AppPalette.of(context).textSecondary)),
            const SizedBox(height: 16),
            TextFormField(controller: _title, decoration: const InputDecoration(labelText: 'Title', border: OutlineInputBorder()), validator: (v) => (v == null || v.isEmpty) ? 'Required' : null),
            const SizedBox(height: 12),
            _loadingCat
                ? const LinearProgressIndicator()
                : DropdownButtonFormField<int?>(
                    value: _categoryId,
                    decoration: const InputDecoration(labelText: 'Category', border: OutlineInputBorder()),
                    items: [for (final c in _categories) DropdownMenuItem(value: c.categoryId, child: Text(c.categoryName))],
                    onChanged: _selectCategory,
                  ),
            if (_subcategories.isNotEmpty) ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<int?>(
                value: _subcategoryId,
                decoration: const InputDecoration(labelText: 'Subcategory', border: OutlineInputBorder()),
                items: [for (final s in _subcategories) DropdownMenuItem(value: s.subcategoryId, child: Text(s.subcategoryName))],
                onChanged: (v) => setState(() => _subcategoryId = v),
              ),
            ],
            const SizedBox(height: 12),
            TextFormField(controller: _price, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Price (TZS)', border: OutlineInputBorder()), validator: (v) => (v == null || (double.tryParse(v.trim()) ?? -1) < 0) ? 'Enter a valid price' : null),
            const SizedBox(height: 12),
            TextFormField(controller: _quantity, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Quantity', border: OutlineInputBorder()), validator: (v) => (v == null || (double.tryParse(v.trim()) ?? 0) < 1) ? 'At least 1' : null),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _condition,
              decoration: const InputDecoration(labelText: 'Condition', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'NEW', child: Text('New')),
                DropdownMenuItem(value: 'USED', child: Text('Used')),
                DropdownMenuItem(value: 'REFURBISHED', child: Text('Refurbished')),
              ],
              onChanged: (v) => setState(() => _condition = v ?? 'USED'),
            ),
            const SizedBox(height: 12),
            TextFormField(controller: _region, decoration: const InputDecoration(labelText: 'Region', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextFormField(controller: _street, decoration: const InputDecoration(labelText: 'Street / area', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextFormField(controller: _whatsapp, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'WhatsApp (optional)', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextFormField(controller: _description, maxLines: 4, decoration: const InputDecoration(labelText: 'Description', border: OutlineInputBorder(), alignLabelWithHint: true)),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            if (_ok != null) ...[
              const SizedBox(height: 10),
              Text(_ok!, style: const TextStyle(color: Colors.green, fontSize: 13)),
            ],
            const SizedBox(height: 20),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.brandBlue, padding: const EdgeInsets.symmetric(vertical: 16)),
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppPalette.of(context).surface))
                  : Text(widget.editing ? 'Update listing' : 'List item', style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );
  }
}
