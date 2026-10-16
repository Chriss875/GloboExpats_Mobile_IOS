import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../config.dart';
import 'create_request_screen.dart';
import '../auth/auth_store.dart';
import '../domain/request_board.dart';
import '../domain/request_nudge_intent.dart';
import '../models/order.dart';
import '../storage/kv_store.dart';
import '../theme.dart';
import '../widgets/error_text.dart';
import '../widgets/seller_verification_gate.dart' show isVerifiedSellerResponse;
import '../widgets/skeleton_loader.dart';
import '../widgets/navigation_boundary.dart';
import '../widgets/sign_in_prompt.dart';

/// Opens a request's detail screen.
///
/// Goes through the router when one is in scope so the URL is real and back
/// behaves, and falls back to a plain navigator push when it is not: the
/// request board is also reached from screens mounted outside the router
/// (deep links, notification taps), where `context.push` throws
/// "No GoRouter found in context". Same guard as `_OrderCard.onTap`.
void openRequestDetail(
  BuildContext context,
  Map<String, dynamic> row, {
  ApiClient? api,
}) {
  final router = GoRouter.maybeOf(context);
  if (router != null) {
    router.push('/request/${requestPostId(row)}', extra: row);
    return;
  }
  Navigator.of(context).push(
    MaterialPageRoute(
        settings: RouteSettings(name: '/request/${requestPostId(row)}'),
        builder: (_) => RequestDetailScreen(req: row, api: api)),
  );
}

/// Request board (community requests): feed + my-requests + detail. Covers the
/// web `/requests`, `/expat/dashboard?tab=requests` and `/request/[id]` routes.
/// Phase 3 parity work on top of the AU-056 base:
///  - status vocabulary PENDING/FULFILLED/CLOSED (no "OPEN")
///  - infinite scroll on the public feed
///  - owner "My requests" tab with Prev/Next and unread-nudge badges
///  - photos on cards + a gallery on the detail page
///  - the owner responses/nudge inbox and fulfill-by-nudge / fulfill-outside
///  - a "respond with a listing / post-it-first" entry point
///  - relative time, single-end budget phrasing, view counts, share, related.
class RequestsScreen extends StatefulWidget {
  const RequestsScreen({
    super.key,
    this.api,
    this.initialBoard = RequestsInitialBoard.board,
  });
  final ApiClient? api;

  /// Which board the screen opens on. MySpace's Requests tab passes
  /// [RequestsInitialBoard.mine] so it lands on the owner "My requests" view
  /// like the web dashboard; the public `/requests` route keeps the board
  /// default (web parity — the MySpace Requests tab embeds the owner board,
  /// not the public feed).
  final RequestsInitialBoard initialBoard;
  @override
  State<RequestsScreen> createState() => _RequestsScreenState();
}

/// Which board [RequestsScreen] opens on. Web `/expat/dashboard?tab=requests`
/// renders the owner's "My requests" board, while `/requests` renders the
/// public request board.
enum RequestsInitialBoard { board, mine }

enum _BoardMode { board, mine }

class _RequestsScreenState extends State<RequestsScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();

  _BoardMode _mode = _BoardMode.board;

  // ---- viewer-identity privacy (REQUES-30) ----
  // Web shows a requester's (masked) name only to the owner or a verified
  // seller (`canViewRequesterIdentity = canSell`); everyone else sees
  // 'Community member'. Resolved lazily so guests stay masked.
  bool _canSeeIdentity = false;

  // ---- public feed ----
  late Future<RequestBoardPageData> _future;
  final List<Map<String, dynamic>> _feed = [];
  int _page = 0;
  bool _hasMore = false;
  bool _loadingMore = false;
  final ScrollController _scroll = ScrollController();
  String _type = '';
  String _status = '';
  String _search = '';
  final TextEditingController _searchCtrl = TextEditingController();
  Timer? _debounce;

  // ---- feed controls (REQUES-27 sort, REQUES-28 category/area) ----
  String _category = ''; // '' = all categories
  String _location = ''; // '' = all areas
  String _sort = 'relevance'; // relevance | newest | nudges | views
  List<String> _goodsCategories = const [];
  List<String> _locationOptions = const [];

  // ---- my requests (owner) ----
  String _myStatus = '';
  int _myPage = 0;
  int _myTotalPages = 1;
  late Future<RequestBoardPageData> _myFuture;

  bool get _loggedIn => (AuthStore.instance?.token ?? '').isNotEmpty;
  final Set<int> _nudgingRequestIds = <int>{};

  @override
  void initState() {
    super.initState();
    _future = _loadBoard(0);
    _scroll.addListener(_onScroll);
    _resolveViewerCanSell();
    _loadFilterOptions();
    // MySpace's Requests tab opens on the owner board (web dashboard tab).
    // Guests are not redirected here — the mode bar only shows to a logged-in
    // viewer, so a guest stays on the public board rather than an error body.
    if (widget.initialBoard == RequestsInitialBoard.mine && _loggedIn) {
      _mode = _BoardMode.mine;
      _myFuture = _loadMine();
    } else {
      _myFuture = Future.value(const RequestBoardPageData());
    }
  }

  /// REQUES-28: category + neighbourhood options. Failures degrade to an
  /// all-categories / all-areas control (the web's availability filter is a
  /// nicety, not a gate).
  Future<void> _loadFilterOptions() async {
    try {
      final cats = await _api.fetchCategories();
      if (!mounted) return;
      final goods = cats
          .map((c) => c.categoryName)
          .where((n) => n.isNotEmpty)
          .toList()
        ..sort();
      setState(() => _goodsCategories = goods);
    } catch (_) {}
    try {
      final areas = await _api.fetchNeighbourhoods();
      if (!mounted) return;
      setState(() => _locationOptions = List.of(areas));
    } catch (_) {}
  }

  /// REQUES-30: only a verified seller (web `canSell`) sees requester names on
  /// the public board. A failed/absent verification stays masked — privacy is
  /// conservative, unlike the nudge gate where a network blip must not block.
  Future<void> _resolveViewerCanSell() async {
    final token = AuthStore.instance?.token;
    if (token == null || token.isEmpty) return;
    try {
      final body = await _api.fetchSellerVerification(token);
      if (!mounted) return;
      setState(() => _canSeeIdentity = isVerifiedSellerResponse(body));
    } catch (_) {
      // Keep masked.
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<RequestBoardPageData> _loadBoard(int page) async {
    final data = await _api.fetchRequestBoardFeed(
      requestType: _type.isEmpty ? null : _type,
      status: _status.isEmpty ? null : _status,
      category: _category.isEmpty ? null : _category,
      location: _location.isEmpty ? null : _location,
      search: _search.trim().isEmpty ? null : _search.trim(),
      page: page,
      size: 20,
    );
    if (!mounted) return data;
    setState(() {
      _feed.addAll(data.content);
      _page = data.page;
      _hasMore = (data.page + 1) < data.totalPages;
      _loadingMore = false;
    });
    return data;
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final pos = _scroll.position;
    if (pos.pixels > pos.maxScrollExtent - 400 && _hasMore && !_loadingMore) {
      _loadingMore = true;
      _loadBoard(_page + 1).catchError((_) {
        if (mounted) setState(() => _loadingMore = false);
        return const RequestBoardPageData();
      });
    }
  }

  void _reloadBoard() {
    _feed.clear();
    _page = 0;
    _hasMore = false;
    final next = _loadBoard(0);
    // Block body: an arrow `() => _future = next` would return the Future and
    // trip the framework's setState-returned-a-Future assertion.
    setState(() {
      _future = next;
    });
  }

  void _applyType(String t) {
    _type = t;
    // Category values are type-specific (goods taxonomy vs the service
    // constant), so a category chosen under one type must not leak into the
    // other type's filter.
    _category = '';
    _reloadBoard();
  }

  void _applyCategory(String c) {
    _category = c;
    _reloadBoard();
  }

  void _applyLocation(String l) {
    _location = l;
    _reloadBoard();
  }

  void _applySort(String s) {
    // Sort is client-side over the loaded feed (web sortedRequests) — no refetch.
    setState(() => _sort = s);
  }

  // Web "Clear all" (request-feed.tsx:457-467) resets the *sidebar* filters
  // only: requestType / status / category / location. Search has its own clear
  // control and sort is a client-side view toggle, so neither counts as an
  // active sidebar filter.
  bool get _hasActiveFilters =>
      _type.isNotEmpty ||
      _status.isNotEmpty ||
      _category.isNotEmpty ||
      _location.isNotEmpty;

  void _clearAllFilters() {
    _type = '';
    _status = '';
    _category = '';
    _location = '';
    _reloadBoard();
  }

  List<String> _categoryChoices() {
    final goods = _goodsCategories;
    final services = serviceRequestCategories;
    switch (_type) {
      case 'GOODS':
        return goods;
      case 'SERVICE':
        return services;
      default:
        final merged = <String>{...goods, ...services};
        return merged.toList()..sort();
    }
  }

  /// Client-side sort of the loaded pages — web `sortedRequests` useMemo
  /// (request-feed.tsx:415-433). "relevance" keeps the backend order.
  List<Map<String, dynamic>> _visibleFeed() {
    if (_sort == 'relevance') return List.of(_feed);
    // Records capture (element, originalIndex) up front. The comparator reads
    // those captured element maps directly — never `indexed[i]` — because the
    // list is sorted in place and index lookups would alias swapped elements.
    final indexed = <(Map<String, dynamic>, int)>[
      for (var i = 0; i < _feed.length; i++) (_feed[i], i)
    ];
    int? keyOf(Map<String, dynamic> m, List<String> keys) {
      for (final k in keys) {
        final v = m[k];
        if (v == null) continue;
        if (v is num) return v.toInt();
        final p = int.tryParse('$v');
        if (p != null) return p;
      }
      return null;
    }

    int? dateMs(Map<String, dynamic> m) {
      final v = m['createdAt'];
      if (v == null) return null;
      return DateTime.tryParse('$v')?.toUtc().millisecondsSinceEpoch;
    }

    int cmpKey(int? a, int? b) {
      final an = a ?? -1;
      final bn = b ?? -1;
      if (an != bn) return bn.compareTo(an); // desc, nulls last
      return 0;
    }

    int compareElements(Map<String, dynamic> x, Map<String, dynamic> y) {
      switch (_sort) {
        case 'newest':
          return cmpKey(dateMs(x), dateMs(y));
        case 'nudges':
          return cmpKey(
              keyOf(x, const ['nudgeCount']), keyOf(y, const ['nudgeCount']));
        case 'views':
          return cmpKey(keyOf(x, const ['viewCount', 'views']),
              keyOf(y, const ['viewCount', 'views']));
      }
      return 0;
    }

    indexed.sort((a, b) {
      final c = compareElements(a.$1, b.$1);
      return c != 0 ? c : a.$2.compareTo(b.$2); // stable tie-break on index
    });
    return indexed.map((e) => e.$1).toList();
  }

  void _applyStatus(String s) {
    _status = s;
    _reloadBoard();
  }

  void _onSearchChanged(String value) {
    // Debounced live search — web request-feed.tsx applies on change. The
    // controller itself is persistent so typed text never snaps back.
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      if (_search.trim() != value.trim()) {
        _search = value.trim();
        _reloadBoard();
      }
    });
  }

  void _showMyRequests() {
    final token = AuthStore.instance?.token;
    if (token == null || token.isEmpty) {
      showSignInPrompt(context,
          message:
              'Sign in to see your requests and replies from the community.',
          returnUrl: '/expat/dashboard');
      return;
    }
    _mode = _BoardMode.mine;
    final next = _loadMine();
    setState(() {
      _myFuture = next;
    });
  }

  Future<RequestBoardPageData> _loadMine({int page = 0}) async {
    final token = AuthStore.instance?.token ?? '';
    final data = await _api.fetchMyRequests(token,
        status: _myStatus.isEmpty ? null : _myStatus, page: page, size: 20);
    if (!mounted) return data;
    setState(() {
      _myPage = data.page;
      _myTotalPages = data.totalPages < 1 ? 1 : data.totalPages;
    });
    return data;
  }

  void _goMyPage(int page) {
    final next = _loadMine(page: page);
    setState(() {
      _myFuture = next;
    });
  }

  void _applyMyStatus(String s) {
    _myStatus = s;
    final next = _loadMine(page: 0);
    setState(() {
      _myFuture = next;
    });
  }

  void _openMine(Map<String, dynamic> row) {
    openRequestDetail(context, row, api: widget.api);
  }

  Future<void> _openCreate() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
          settings: const RouteSettings(name: '/requests/new'),
          builder: (_) => const CreateRequestScreen()),
    );
    // A new post may exist — reload rather than the old setState-only no-op.
    if (!mounted) return;
    if (_mode == _BoardMode.board) {
      _reloadBoard();
    } else {
      final next = _loadMine();
      setState(() {
        _myFuture = next;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'create-request',
        onPressed: _openCreate,
        icon: const Icon(Icons.post_add_outlined),
        label: const Text('Post request'),
      ),
      // Web parity, same rule as the rest of My Space: nothing is sticky. The
      // mode bar and the board filters are handed to the body so they live
      // inside its scroll view and travel up with the feed, rather than
      // sitting in a Column above an Expanded list and eating the screen.
      body: switch (_mode) {
        _BoardMode.board => _boardBody([
            if (_loggedIn) _modeBar(),
            ..._boardFilters(),
          ]),
        _BoardMode.mine => _myBody([if (_loggedIn) _modeBar()]),
      },
    );
  }

  Widget _modeBar() => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: SizedBox(
          width: double.infinity,
          child: SegmentedButton<_BoardMode>(
            segments: const [
              ButtonSegment(
                  value: _BoardMode.board, label: Text('Request board')),
              ButtonSegment(value: _BoardMode.mine, label: Text('My requests')),
            ],
            selected: {_mode},
            showSelectedIcon: false,
            style: ButtonStyle(
              minimumSize: const WidgetStatePropertyAll(Size(150, 48)),
              padding: const WidgetStatePropertyAll(
                  EdgeInsets.symmetric(horizontal: 18, vertical: 12)),
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
                      : AppPalette.of(context).surface),
            ),
            onSelectionChanged: (s) {
              final v = s.first;
              if (v == _BoardMode.mine) {
                _showMyRequests();
              } else {
                setState(() => _mode = _BoardMode.board);
                _reloadBoard();
              }
            },
          ),
        ),
      );

  Future<void> _showFilters() => showModalBottomSheet<void>(
        context: context,
        useSafeArea: true,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (sheetContext) => StatefulBuilder(
          builder: (_, setSheetState) => Padding(
            padding: EdgeInsets.fromLTRB(
                20, 0, 20, 20 + MediaQuery.viewInsetsOf(sheetContext).bottom),
            child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Filter requests',
                      style:
                          TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    key: const ValueKey('req-type'),
                    value: _type,
                    decoration: const InputDecoration(
                        labelText: 'Type', border: OutlineInputBorder()),
                    items: const [
                      DropdownMenuItem(value: '', child: Text('All types')),
                      DropdownMenuItem(value: 'GOODS', child: Text('Goods')),
                      DropdownMenuItem(
                          value: 'SERVICE', child: Text('Services'))
                    ],
                    onChanged: (v) {
                      _applyType(v ?? '');
                      setSheetState(() {});
                    },
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    key: const ValueKey('req-status'),
                    value: _status,
                    decoration: const InputDecoration(
                        labelText: 'Status', border: OutlineInputBorder()),
                    items: [
                      const DropdownMenuItem(
                          value: '', child: Text('Any status')),
                      for (final s in requestStatusOptions)
                        DropdownMenuItem(value: s, child: Text(_statusLabel(s)))
                    ],
                    onChanged: (v) {
                      _applyStatus(v ?? '');
                      setSheetState(() {});
                    },
                  ),
                  if (_categoryChoices().isNotEmpty) ...[
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      key: const ValueKey('req-category'),
                      value: _category,
                      decoration: const InputDecoration(
                          labelText: 'Category', border: OutlineInputBorder()),
                      items: [
                        const DropdownMenuItem(
                            value: '', child: Text('All categories')),
                        for (final v in _categoryChoices())
                          DropdownMenuItem(value: v, child: Text(v))
                      ],
                      onChanged: (v) {
                        _applyCategory(v ?? '');
                        setSheetState(() {});
                      },
                    ),
                  ],
                  if (_locationOptions.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      key: const ValueKey('req-location'),
                      value: _location,
                      decoration: const InputDecoration(
                          labelText: 'Neighbourhood',
                          border: OutlineInputBorder()),
                      items: [
                        const DropdownMenuItem(
                            value: '', child: Text('Any neighbourhood')),
                        for (final v in _locationOptions)
                          DropdownMenuItem(value: v, child: Text(v))
                      ],
                      onChanged: (v) {
                        _applyLocation(v ?? '');
                        setSheetState(() {});
                      },
                    ),
                  ],
                  const SizedBox(height: 18),
                  Row(children: [
                    if (_hasActiveFilters)
                      TextButton(
                          key: const ValueKey('clear-request-filters'),
                          onPressed: () {
                            _clearAllFilters();
                            setSheetState(() {});
                          },
                          child: const Text('Clear all')),
                    const Spacer(),
                    FilledButton(
                        onPressed: () => Navigator.pop(sheetContext),
                        child: const Text('Show results')),
                  ]),
                ]),
          ),
        ),
      );

  List<Widget> _boardFilters() => [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Row(children: [
            Expanded(
                child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                  hintText: 'Search requests',
                  isDense: true,
                  prefixIcon: const Icon(Icons.search),
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14)),
                  suffixIcon: _search.trim().isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.clear, size: 18),
                          onPressed: () {
                            _searchCtrl.clear();
                            _onSearchChanged('');
                          })),
              onChanged: _onSearchChanged,
            )),
            const SizedBox(width: 8),
            Badge(
              isLabelVisible: _hasActiveFilters,
              child: IconButton.filledTonal(
                tooltip: 'Filter requests',
                onPressed: _showFilters,
                icon: const Icon(Icons.tune_rounded),
              ),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: Row(children: [
            const Expanded(
                child: Text('Request board',
                    style:
                        TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
            _boardSelect(
                key: const ValueKey('req-sort'),
                hint: 'Relevance',
                value: _sort,
                items: const ['relevance', 'newest', 'nudges', 'views'],
                itemLabel: _sortLabel,
                onChanged: (v) => _applySort(v ?? 'relevance')),
          ]),
        ),
      ];

  /// Compact bordered dropdown used for the board filters — the web UI's
  /// `<Select>` controls. [items] are raw values; [itemLabel] renders them.
  Widget _boardSelect({
    required Key key,
    required String hint,
    required String? value,
    required List<String> items,
    String Function(String)? itemLabel,
    required ValueChanged<String?> onChanged,
  }) {
    return Container(
      key: key,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppPalette.of(context).border)),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          isDense: true,
          isExpanded: false,
          hint: Text(hint,
              style: TextStyle(
                  color: AppPalette.of(context).textSecondary, fontSize: 13)),
          style: TextStyle(color: AppPalette.of(context).textPrimary, fontSize: 13),
          icon: Icon(Icons.arrow_drop_down,
              size: 18, color: AppPalette.of(context).textSecondary),
          items: [
            for (final v in items)
              DropdownMenuItem(
                  value: v,
                  child: Text(itemLabel != null ? itemLabel(v) : v,
                      style: const TextStyle(fontSize: 13))),
          ],
          onChanged: onChanged,
        ),
      ),
    );
  }

  String _sortLabel(String s) {
    switch (s) {
      case 'newest':
        return 'Newest';
      case 'nudges':
        return 'Most nudged';
      case 'views':
        return 'Most viewed';
      default:
        return 'Relevance';
    }
  }

  Widget _boardBody(List<Widget> header) {
    return FutureBuilder<RequestBoardPageData>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return ListView(children: [...header, const FeedSkeleton()]);
        }
        if (snap.hasError) {
          return ListView(children: [
            ...header,
            const SizedBox(height: 80),
            Center(
                child: Text(
                    'Could not load requests: ${friendlyApiError(snap.error)}',
                    textAlign: TextAlign.center)),
          ]);
        }
        final reqs = _visibleFeed();
        if (reqs.isEmpty) {
          return ListView(children: [
            ...header,
            const SizedBox(height: 80),
            const Center(
                child: Text('No requests match these filters.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey))),
          ]);
        }
        // itemBuilder rather than a children list: the board pages in more
        // rows as you reach the bottom, so the feed must stay lazy. The header
        // occupies the first [header.length] slots of the same scroll view.
        final lead = header.length;
        return ListView.builder(
          controller: _scroll,
          itemCount: lead + reqs.length + (_hasMore ? 1 : 0),
          itemBuilder: (context, i) {
            if (i < lead) return header[i];
            final j = i - lead;
            if (j >= reqs.length) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Center(
                    child: SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2))),
              );
            }
            final r = _Req(reqs[j]);
            return Padding(
              padding: EdgeInsets.fromLTRB(16, j == 0 ? 16 : 0, 16,
                  j == reqs.length - 1 ? 16 : 10),
              child: _FeedCard(
                  r: r,
                  showIdentity: _canSeeIdentity,
                  showNudge: r.status == 'PENDING',
                  nudging: _nudgingRequestIds.contains(requestPostId(reqs[j])),
                  onNudge: () => _nudgeFromFeed(reqs[j]),
                  onTap: () => _openDetail(reqs[j])),
            );
          },
        );
      },
    );
  }

  void _openDetail(Map<String, dynamic> row) {
    openRequestDetail(context, row, api: widget.api);
  }

  Future<void> _nudgeFromFeed(Map<String, dynamic> row) async {
    final token = AuthStore.instance?.token;
    final id = requestPostId(row);
    if (token == null || token.isEmpty) {
      showSignInPrompt(context,
          message: 'Sign in to let this person know you can help.',
          returnUrl: '/requests');
      return;
    }
    if (_nudgingRequestIds.contains(id)) return;
    setState(() => _nudgingRequestIds.add(id));
    try {
      await _api.nudgeRequest(token, id,
          message: 'I can help with this!', nudgeType: 'GENERAL');
      if (!mounted) return;
      setState(() {
        _nudgingRequestIds.remove(id);
        final current = (row['nudgeCount'] as num?)?.toInt() ?? 0;
        row['nudgeCount'] = current + 1;
      });
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Nudge sent to the requester.')));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _nudgingRequestIds.remove(id));
      final message = e.message.contains('ALREADY_NUDGED')
          ? 'You already nudged this request.'
          : e.message;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    } catch (_) {
      if (!mounted) return;
      setState(() => _nudgingRequestIds.remove(id));
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Could not send the nudge. Try again.')));
    }
  }

  Widget _myBody(List<Widget> header) {
    if (!_loggedIn) {
      return ListView(children: [
        ...header,
        const SizedBox(height: 80),
        const Center(
            child: Text('Log in to see the requests you have posted.',
                textAlign: TextAlign.center)),
      ]);
    }
    return FutureBuilder<RequestBoardPageData>(
      future: _myFuture,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return ListView(children: [...header, const FeedSkeleton()]);
        }
        if (snap.hasError) {
          return ListView(children: [
            ...header,
            const SizedBox(height: 80),
            Center(
                child: Text(
                    'Could not load your requests: ${friendlyApiError(snap.error)}',
                    textAlign: TextAlign.center)),
          ]);
        }
        final reqs = snap.data?.content ?? const <Map<String, dynamic>>[];
        return ListView(children: [
          ...header,
          // The status filter scrolls with the list too — it was the second
          // pinned strip on this screen.
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Row(children: [
              Text('Status',
                  style: TextStyle(color: AppPalette.of(context).textSecondary)),
              const SizedBox(width: 8),
              DropdownButton<String>(
                value: _myStatus.isEmpty ? null : _myStatus,
                hint: const Text('All'),
                items: [
                  for (final s in requestStatusOptions)
                    DropdownMenuItem(value: s, child: Text(_statusLabel(s))),
                ],
                onChanged: (v) => _applyMyStatus(v ?? ''),
              ),
            ]),
          ),
          if (reqs.isEmpty) ...[
            const SizedBox(height: 80),
            const Center(
                child: Text('You have not posted any requests here yet.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey))),
          ] else
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(children: [
                for (var i = 0; i < reqs.length; i++) ...[
                  if (i > 0) const SizedBox(height: 10),
                  Builder(builder: (context) {
                    final r = _Req(reqs[i]);
                    return _FeedCard(
                      r: r,
                      unread: r.unreadNudgeCount,
                      showNudge: false,
                      // These are the viewer's OWN requests.
                      showIdentity: true,
                      onTap: () => _openMine(reqs[i]),
                    );
                  }),
                ],
              ]),
            ),
          if (_myTotalPages > 1)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child:
                  Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                IconButton(
                  tooltip: 'Previous page',
                  onPressed: _myPage <= 0 ? null : () => _goMyPage(_myPage - 1),
                  icon: const Icon(Icons.chevron_left),
                ),
                Text('Page ${_myPage + 1} of $_myTotalPages',
                    style: TextStyle(color: AppPalette.of(context).textSecondary)),
                IconButton(
                  tooltip: 'Next page',
                  onPressed: _myPage + 1 >= _myTotalPages
                      ? null
                      : () => _goMyPage(_myPage + 1),
                  icon: const Icon(Icons.chevron_right),
                ),
              ]),
            ),
        ]);
      },
    );
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'PENDING':
        return 'Open';
      case 'FULFILLED':
        return 'Fulfilled';
      case 'CLOSED':
        return 'Closed';
      default:
        return s;
    }
  }
}

class _FeedCard extends StatelessWidget {
  final _Req r;
  final int? unread;
  final bool showIdentity;
  final VoidCallback onTap;
  final VoidCallback? onNudge;
  final bool showNudge;
  final bool nudging;
  const _FeedCard(
      {required this.r,
      this.unread,
      this.showNudge = false,
      this.nudging = false,
      this.onNudge,
      required this.showIdentity,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    final images = r.images;
    return Material(
      color: AppPalette.of(context).surface,
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (images.isNotEmpty)
            Stack(children: [
              AspectRatio(
                aspectRatio: 2.25,
                child: Image.network(
                  AppConfig.resolveAssetUrl(images.first),
                  width: double.infinity,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => Container(
                    color: AppPalette.of(context).surfaceMuted,
                    child: Center(
                        child: Icon(Icons.image_outlined,
                            size: 32, color: AppPalette.of(context).textSecondary)),
                  ),
                ),
              ),
              Positioned(top: 10, right: 10, child: _Status(r.status)),
              if (images.length > 1)
                Positioned(
                  bottom: 10,
                  right: 10,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: .68),
                        borderRadius: BorderRadius.circular(10)),
                    child: Text('+${images.length - 1} photos',
                        style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Colors.white)),
                  ),
                ),
            ]),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (images.isEmpty) ...[
                  Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                          color: AppColors.brandBlue.withValues(alpha: .08),
                          borderRadius: BorderRadius.circular(12)),
                      child: Icon(Icons.campaign_outlined,
                          size: 20, color: AppPalette.of(context).accentInk)),
                  const SizedBox(width: 10),
                ],
                Expanded(
                    child: Text(r.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                            height: 1.25))),
                if (images.isEmpty) ...[
                  const SizedBox(width: 8),
                  _Status(r.status)
                ],
              ]),
              if ((r.description ?? '').trim().isNotEmpty) ...[
                const SizedBox(height: 7),
                Text(r.description!,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 12.5,
                        height: 1.4,
                        color: AppPalette.of(context).textSecondary)),
              ],
              if (unread != null && unread! > 0) ...[
                const SizedBox(height: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                      color: const Color(0xFFDC2626),
                      borderRadius: BorderRadius.circular(20)),
                  child: Text('$unread new',
                      style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Colors.white)),
                ),
              ],
              const SizedBox(height: 10),
              Row(children: [
                Expanded(
                    child: Text(
                        requestPosterName(
                            userName: r.userName, showIdentity: showIdentity),
                        style: TextStyle(
                            color: AppPalette.of(context).textPrimary,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600))),
                if (_metaLine.isNotEmpty)
                  Text(_metaLine,
                      style: TextStyle(
                          color: AppPalette.of(context).textSecondary, fontSize: 11)),
              ]),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 7,
                children: [
                  if (r.category != null)
                    _chip(context, Icons.category_outlined, r.category!),
                  if (r.location != null)
                    _chip(context, Icons.place_outlined, r.location!),
                  if (r.budgetLabel != null)
                    _chip(context, Icons.payments_outlined, r.budgetLabel!),
                ],
              ),
              const SizedBox(height: 13),
              const Divider(height: 1),
              const SizedBox(height: 10),
              Row(children: [
                if (showNudge)
                  FilledButton.icon(
                    key: ValueKey('request-feed-nudge-${requestPostId(r.m)}'),
                    onPressed: nudging ? null : onNudge,
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFFF59E0B),
                      // Dark ink on a fixed amber fill: correct in both modes.
                      foregroundColor: const Color(0xFF172033),
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                    ),
                    icon: Icon(
                        r.serviceCategory != null
                            ? Icons.handyman_outlined
                            : Icons.favorite_rounded,
                        size: 16),
                    label: Text(nudging
                        ? 'Sending…'
                        : r.serviceCategory != null
                            ? 'Offer this service'
                            : 'Nudge with a match'),
                  )
                else ...[
                  Text('View request',
                      style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: AppPalette.of(context).accentInk)),
                  const SizedBox(width: 3),
                  Icon(Icons.arrow_forward_rounded,
                      size: 16, color: AppPalette.of(context).accentInk),
                ],
                const Spacer(),
                Row(children: [
                  const Icon(Icons.favorite_rounded,
                      size: 13, color: Color(0xFFF59E0B)),
                  const SizedBox(width: 3),
                  Text('${r.nudgeCount} nudge${r.nudgeCount == 1 ? '' : 's'}',
                      style: TextStyle(
                          fontSize: 11.5, color: AppPalette.of(context).textSecondary)),
                ]),
              ]),
            ]),
          ),
        ]),
      ),
    );
  }

  String get _metaLine {
    final parts = <String>[
      if (r.relativeTime.isNotEmpty) r.relativeTime,
      if (r.viewCount != null)
        '${r.viewCount} view${r.viewCount == 1 ? '' : 's'}',
    ];
    return parts.join(' · ');
  }

  Widget _chip(BuildContext context, IconData icon, String label) {
    final palette = AppPalette.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
          color: palette.surfaceMuted,
          borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: palette.textSecondary),
        const SizedBox(width: 3),
        Text(label,
            style: TextStyle(fontSize: 11, color: palette.textSecondary)),
      ]),
    );
  }
}

class RequestDetailScreen extends StatefulWidget {
  final Map<String, dynamic> req;
  final ApiClient? api;
  const RequestDetailScreen({super.key, required this.req, this.api});
  @override
  State<RequestDetailScreen> createState() => _RequestDetailScreenState();
}

class _RequestDetailScreenState extends State<RequestDetailScreen> {
  late final ApiClient _api = widget.api ?? ApiClient();
  bool _nudging = false;
  bool _acting = false;
  bool _isOwner = false;
  bool _canViewIdentity = false; // REQUES-30: verified seller may see names
  bool _nudgesLoaded = false;
  List<Map<String, dynamic>> _nudges = const [];
  int? _myUserId;
  Map<String, dynamic>? _live; // refreshed payload after refetch/mutation
  String? _loadError;
  List<Map<String, dynamic>> _related = const [];

  @override
  void initState() {
    super.initState();
    final token = AuthStore.instance?.token ?? '';
    _api.trackRequestView(token, _id).catchError((_) {});
    _resolveOwner();
    _resolveViewerCanSell();
    _refetch();
    _loadRelated();
  }

  /// REQUES-30 privacy gate for the non-owner detail view. Only a verified
  /// seller sees the (masked) poster name; failures keep the mask.
  Future<void> _resolveViewerCanSell() async {
    final token = AuthStore.instance?.token;
    if (token == null || token.isEmpty) return;
    try {
      final body = await _api.fetchSellerVerification(token);
      if (!mounted) return;
      setState(() => _canViewIdentity = isVerifiedSellerResponse(body));
    } catch (_) {
      // Keep masked.
    }
  }

  bool get _needsRemoteLoad {
    final raw = _req();
    return raw['title'] == null || '${raw['title']}'.isEmpty;
  }

  /// AU-056 owner management: resolve my userId from user-details and compare
  /// with the post's `userId` (web isOwner: request.userId === user.userId).
  Future<void> _resolveOwner() async {
    final token = AuthStore.instance?.token;
    if (token == null) return;
    try {
      final me = await _api.getUserDetails(token);
      if (!mounted) return;
      setState(() {
        _myUserId = (me['userId'] as num?)?.toInt();
        _isOwner = _myUserId != null && _myUserId == _posterId;
      });
      if (_isOwner) _loadNudges();
    } catch (_) {
      // Identity resolution is best-effort; the actions row simply stays hidden.
    }
  }

  Future<void> _loadNudges() async {
    final token = AuthStore.instance?.token;
    if (token == null) return;
    try {
      final list = await _api.fetchRequestNudges(token, _id);
      if (!mounted) return;
      setState(() {
        _nudges = list;
        _nudgesLoaded = true;
      });
      if (list.any((n) => n['isRead'] == false)) {
        // Owner opened the inbox — mark the outstanding nudges read like the
        // web nudge-inbox does on open.
        try {
          await _api.markNudgesRead(token, _id);
        } catch (_) {}
      }
    } catch (_) {
      if (mounted) setState(() => _nudgesLoaded = true);
    }
  }

  /// AU-056 detail refetch by id so mutations and view counts stay fresh.
  Future<void> _refetch() async {
    try {
      final fresh =
          await _api.fetchRequestById(_id, token: AuthStore.instance?.token);
      if (!mounted || fresh.isEmpty) return;
      setState(() => _live = fresh);
    } catch (e) {
      if (!mounted) return;
      if (_needsRemoteLoad) {
        setState(() => _loadError = friendlyApiError(e));
      }
    }
  }

  Future<void> _loadRelated() async {
    final cat = _req()['category'] ?? _req()['serviceCategory'];
    final type = _req()['requestType'];
    if (cat == null && type == null) return;
    try {
      final data = await _api.fetchRequestBoardFeed(
        status: 'PENDING',
        category: cat?.toString(),
        requestType: type?.toString(),
        page: 0,
        size: 4,
      );
      if (!mounted) return;
      final self = _id;
      final rel = data.content
          .where((m) => requestPostId(m) != self && requestPostId(m) != 0)
          .take(3)
          .toList();
      if (rel.isNotEmpty) setState(() => _related = rel);
    } catch (_) {
      // Related requests are a discovery nicety — silence on failure.
    }
  }

  int get _id => requestPostId(_req());
  int? get _posterId {
    final raw = _req()['userId'];
    if (raw is num) return raw.toInt();
    return int.tryParse('$raw');
  }

  Map<String, dynamic> _req() => _live ?? widget.req;

  /// Owner delete action — web parity REQUES-29: the web owner controls are
  /// Edit / Mark as Fulfilled / Delete only (request-board-tab.tsx:282-285,338);
  /// the CLOSED transition is reserved for admins/API, so there is no owner
  /// "Close" on mobile either.
  Future<void> _deleteRequest() async {
    final token = AuthStore.instance?.token;
    if (token == null || _acting) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Delete request?'),
        content:
            const Text('This permanently removes your request from the board.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(d, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(d, true),
              style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFFDC2626)),
              child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _acting = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await _api.deleteRequest(token, _id);
      if (!mounted) return;
      setState(() => _acting = false);
      messenger.showSnackBar(const SnackBar(content: Text('Request deleted.')));
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _acting = false);
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (!mounted) return;
      setState(() => _acting = false);
      messenger.showSnackBar(const SnackBar(
          content: Text('Could not update the request. Try again.')));
    }
  }

  /// Web parity REQUES-03: 'How was ... fulfilled?' — Through GloboExpats
  /// links a completed buying-order product; Outside GloboExpats marks the
  /// request fulfilled with no linked order (source EXTERNAL).
  Future<void> _fulfillFlow() async {
    final token = AuthStore.instance?.token;
    if (token == null || _acting) return;
    final how = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('How was this request fulfilled?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(d), child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(d, 'EXTERNAL'),
              style:
                  FilledButton.styleFrom(backgroundColor: AppColors.brandBlue),
              child: const Text('Outside GloboExpats')),
          FilledButton(
              onPressed: () => Navigator.pop(d, 'THROUGH'),
              child: const Text('Through GloboExpats')),
        ],
      ),
    );
    if (how == null || !mounted) return;
    if (how == 'EXTERNAL') {
      await _markOutside(token);
      return;
    }
    await _fulfillFromCompletedOrders(token);
  }

  Future<void> _markOutside(String token) async {
    setState(() => _acting = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await _api.fulfillRequestOutside(token, _id);
      if (!mounted) return;
      setState(() => _acting = false);
      messenger.showSnackBar(
          const SnackBar(content: Text('Request marked as fulfilled.')));
      _refetch();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _acting = false);
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (!mounted) return;
      setState(() => _acting = false);
      messenger.showSnackBar(const SnackBar(
          content: Text('Could not fulfil the request. Try again.')));
    }
  }

  /// Options come from the owner's completed buying orders (DELIVERED/COMPLETED
  /// only, dedup by orderId:productId — web extractCompletedBuyingOrderProducts).
  /// When the account has no completed purchase (or the fetch fails) the
  /// owner's OWN listings are offered instead — the AU-056 fulfill path that
  /// lets a requester link an item they already sell to this request.
  Future<void> _fulfillFromCompletedOrders(String token) async {
    final messenger = ScaffoldMessenger.of(context);
    List<_CompletedProduct> options = const [];
    try {
      final orders = await _api.fetchOrders(token);
      options = _completedBuyingProducts(orders);
    } catch (_) {}
    if (!mounted) return;
    if (options.isEmpty) {
      // Fall back to the owner's OWN listings (AU-056 fulfill path + the au055
      // fake): the seller's user-details `products[]` carry id + name.
      try {
        final me = await _api.getUserDetails(token);
        final mine = (me['products'] as List?) ?? const [];
        options = mine
            .whereType<Map<String, dynamic>>()
            .map((p) {
              final pid = (p['productId'] ?? p['id']);
              final pidInt =
                  pid is num ? pid.toInt() : int.tryParse('$pid') ?? 0;
              return _CompletedProduct(pidInt,
                  (p['productName'] ?? '').toString(), 'listing:$pidInt');
            })
            .where((c) => c.productId > 0 && c.productName.trim().isNotEmpty)
            .toList();
      } catch (_) {}
    }
    if (!mounted) return;
    if (options.isEmpty) {
      messenger.showSnackBar(const SnackBar(
          content: Text(
              'No completed purchase or listing to link. Mark it fulfilled '
              'Outside GloboExpats instead.')));
      return;
    }
    final picked = await showDialog<_CompletedProduct>(
      context: context,
      builder: (d) => SimpleDialog(
        title: const Text('Fulfil with one of your products'),
        children: [
          for (final p in options)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(d, p),
              child: Text(p.productName),
            ),
        ],
      ),
    );
    if (picked == null || !mounted) return;
    setState(() => _acting = true);
    try {
      await _api.fulfillRequest(token, _id, productId: picked.productId);
      if (!mounted) return;
      setState(() => _acting = false);
      messenger.showSnackBar(
          const SnackBar(content: Text('Request marked as fulfilled.')));
      _refetch();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _acting = false);
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (!mounted) return;
      setState(() => _acting = false);
      messenger.showSnackBar(const SnackBar(
          content: Text('Could not fulfil the request. Try again.')));
    }
  }

  List<_CompletedProduct> _completedBuyingProducts(List<Order> orders) {
    final seen = <String>{};
    final out = <_CompletedProduct>[];
    for (final order in orders) {
      final st = normalizeOrderStatus(order.status);
      if (st != 'DELIVERED' && st != 'COMPLETED') continue;
      final type = (order.orderType ?? '').toLowerCase();
      if (type.isNotEmpty && type != 'buying') continue;
      for (final item in order.items) {
        if (item.productId <= 0 || item.productName.trim().isEmpty) continue;
        final key = '${order.orderId}:${item.productId}';
        if (seen.contains(key)) continue;
        seen.add(key);
        out.add(
            _CompletedProduct(item.productId, item.productName, order.orderId));
      }
    }
    return out;
  }

  /// Accept a responder's nudge — fulfill-by-nudge. The backend body is not
  /// shipped yet, so the FULFILL_BY_NUDGE_UNAVAILABLE sentinel becomes a
  /// graceful "coming soon" rather than an error.
  Future<void> _fulfillByNudge(Map<String, dynamic> nudge) async {
    final token = AuthStore.instance?.token;
    if (token == null || _acting) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Fulfil this request with this offer?'),
        content: Text(
            'This marks the request fulfilled by ${nudge['nudgerName'] ?? 'this responder'} '
            'and closes it to further nudges.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(d, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(d, true),
              child: const Text('Fulfil request')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _acting = true);
    try {
      final nudgeId = (nudge['id'] ?? nudge['nudgeId']) is num
          ? ((nudge['id'] ?? nudge['nudgeId']) as num).toInt()
          : int.tryParse('${nudge['id'] ?? nudge['nudgeId']}') ?? 0;
      await _api.fulfillRequestByNudge(token, _id, nudgeId);
      if (!mounted) return;
      setState(() => _acting = false);
      messenger.showSnackBar(
          const SnackBar(content: Text('Request marked as fulfilled.')));
      _refetch();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _acting = false);
      if (e.message.contains('FULFILL_BY_NUDGE_UNAVAILABLE')) {
        messenger.showSnackBar(const SnackBar(
            content: Text('Fulfilling from a nudge is available soon. '
                'You can still mark it fulfilled manually.')));
      } else {
        messenger.showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _acting = false);
      messenger.showSnackBar(const SnackBar(
          content: Text('Could not fulfil the request. Try again.')));
    }
  }

  /// REQUES-01: owner taps a responder row to see their WhatsApp / phone.
  void _contactResponder(Map<String, dynamic> n) {
    final message = n['message']?.toString();
    final productName = n['productName']?.toString();
    final serviceOffer = n['serviceOffer'];
    final contact =
        serviceOffer is Map ? serviceOffer['contact']?.toString() : null;
    showDialog<void>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text((n['nudgerName'] ?? 'Responder').toString()),
        content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (message != null && message.isNotEmpty)
                Text(message, style: const TextStyle(height: 1.4)),
              if (productName != null && productName.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text('Offer: $productName',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
              if (serviceOffer is Map) ...[
                const SizedBox(height: 8),
                for (final label in const [
                  'providerName',
                  'serviceCategory',
                  'location'
                ])
                  if (serviceOffer[label] != null &&
                      '${serviceOffer[label]}'.isNotEmpty)
                    Padding(
                        padding: const EdgeInsets.symmetric(vertical: 1),
                        child: Text(
                            '${label.replaceAll('providerName', 'Provider').replaceAll('serviceCategory', 'Service').replaceAll('location', 'Location')}: ${serviceOffer[label]}')),
              ],
              const SizedBox(height: 12),
              if (contact != null && contact.isNotEmpty)
                Text('Contact: $contact',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
            ]),
        actions: [
          if (contact != null && contact.isNotEmpty)
            TextButton(
              onPressed: () => _openContact(contact),
              child: const Text('Open contact'),
            ),
          TextButton(
              onPressed: () => Navigator.pop(d), child: const Text('Close')),
        ],
      ),
    );
  }

  Future<void> _openContact(String contact) async {
    final tel = contact.startsWith('+') || contact.startsWith('0')
        ? 'tel:${contact.replaceAll(' ', '')}'
        : null;
    final uri = tel != null
        ? Uri.parse(tel)
        : Uri.parse(
            'https://wa.me/${contact.replaceAll(RegExp(r'[^0-9]'), '')}');
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not open the contact link.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not open the contact link.')));
      }
    }
  }

  /// The nudge button — web parity sendNudge. Called with a full payload when
  /// the responder picks a listing or offer, or the default GENERAL "I can
  /// help" message when tapped directly.
  Future<void> _nudge({Map<String, dynamic>? payload}) async {
    final token = AuthStore.instance?.token;
    final messenger = ScaffoldMessenger.of(context);
    if (token == null) {
      showSignInPrompt(context,
          message: 'Sign in to let this person know you can help.',
          returnUrl: '/request/$_id');
      return;
    }
    if (!await _mayAct(token)) return;
    if (!mounted) return;
    setState(() => _nudging = true);
    try {
      await _api.nudgeRequest(token, _id,
          message: (payload?['message'] as String?) ?? 'I can help with this!',
          nudgeType: (payload?['nudgeType'] as String?) ?? 'GENERAL',
          productId: (payload?['productId'] as num?)?.toInt());
      if (!mounted) return;
      setState(() => _nudging = false);
      messenger.showSnackBar(
          const SnackBar(content: Text('Nudge sent to the requester.')));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _nudging = false);
      final msg = e.message.contains('ALREADY_NUDGED')
          ? 'You already nudged this request.'
          : e.message;
      messenger.showSnackBar(SnackBar(content: Text(msg)));
    } catch (_) {
      if (!mounted) return;
      setState(() => _nudging = false);
      messenger.showSnackBar(const SnackBar(
          content: Text('Could not send the nudge. Try again.')));
    }
  }

  /// REQUES-02/entry: a responder can pick one of their OWN listings and send a
  /// PRODUCT_MATCH nudge, or choose to post a listing first (the sell wizard
  /// then auto-nudges once the listing is live).
  Future<void> _respondWithListing() async {
    final token = AuthStore.instance?.token;
    if (token == null) {
      showSignInPrompt(context,
          message: 'Sign in to share your listing with this person.',
          returnUrl: '/request/$_id');
      return;
    }
    if (!await _mayAct(token)) return;
    if (!mounted) return;
    List<Map<String, dynamic>> products = const [];
    try {
      final me = await _api.getUserDetails(token);
      products = ((me['products'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .where((p) => p['productId'] != null)
          .toList();
    } catch (_) {}
    if (!mounted) return;
    final action = await showDialog<String>(
      context: context,
      builder: (d) => SimpleDialog(
        title: const Text('Respond with a listing'),
        children: [
          if (products.isNotEmpty) ...[
            for (final p in products.take(20))
              SimpleDialogOption(
                onPressed: () => Navigator.pop(d, 'p:${p['productId']}'),
                child: Text((p['productName'] ?? 'Listing #${p['productId']}')
                    .toString()),
              ),
            const Divider(),
          ],
          SimpleDialogOption(
            onPressed: () => Navigator.pop(d, 'post-first'),
            child: const Text('I need to post a listing first'),
          ),
        ],
      ),
    );
    if (action == null || !mounted) return;
    if (action == 'post-first') {
      await _startPostFirstIntent(token);
      return;
    }
    final productId = int.tryParse(action.substring(2));
    if (productId == null) return;
    await _nudge(payload: {
      'message': 'I have a listing that matches your request.',
      'nudgeType': 'PRODUCT_MATCH',
      'productId': productId,
    });
  }

  /// Save the pending request-nudge intent (web request-nudge-intent.ts) and
  /// take the responder to /sell so the wizard prefills and auto-nudges.
  Future<void> _startPostFirstIntent(String token) async {
    final r = _Req(_req());
    final intent = PendingRequestNudgeIntent(
      requestId: _id,
      requestTitle: r.title,
      message: 'I can help with this!',
      nudgeType: 'PRODUCT_MATCH',
      category: r.category ?? r.serviceCategory,
      location: r.location,
      returnTo: '/request/$_id',
    );
    await KvStore.instance
        .setString(PendingRequestNudgeIntent.kvKey, jsonEncodeIntent(intent));
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(const SnackBar(
        content: Text(
            'Post your listing first — it will nudge the requester automatically.')));
    try {
      // go_router host (real app)
      // ignore: avoid_dynamic_calls
      (context as dynamic).go('/sell');
    } catch (_) {
      // Plain-Navigator test host: nothing to push to.
    }
  }

  /// canSell gate — web requireVerification toasts + /account/verification.
  /// A verification fetch that fails is treated as "cannot disprove" so an
  /// authenticated user is never hard-blocked by a network blip.
  Future<bool> _mayAct(String token) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final body = await _api.fetchSellerVerification(token);
      if (body.isNotEmpty && !isVerifiedSellerResponse(body)) {
        messenger.showSnackBar(const SnackBar(
            content:
                Text('Verification Required — Please verify your account to '
                    'respond to requests.')));
        _goVerification();
        return false;
      }
      return true;
    } catch (_) {
      return true;
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

  void _showShare() {
    final r = _Req(_req());
    final url = '/request/$_id';
    showDialog<void>(
      context: context,
      builder: (d) => SimpleDialog(
        title: const Text('Share this request'),
        children: [
          ListTile(
            leading: const Icon(Icons.copy),
            title: const Text('Copy link'),
            subtitle: Text(url),
            onTap: () async {
              Navigator.pop(d);
              await Clipboard.setData(ClipboardData(text: url));
              if (!mounted) return;
              ScaffoldMessenger.of(context)
                  .showSnackBar(const SnackBar(content: Text('Link copied')));
            },
          ),
          ListTile(
            leading: const Icon(Icons.chat),
            title: const Text('WhatsApp'),
            onTap: () async {
              Navigator.pop(d);
              final text = Uri.encodeComponent('${r.title} — $url');
              try {
                await launchUrl(Uri.parse('https://wa.me/?text=$text'),
                    mode: LaunchMode.externalApplication);
              } catch (_) {}
            },
          ),
          ListTile(
            leading: const Icon(Icons.email_outlined),
            title: const Text('Email'),
            onTap: () async {
              Navigator.pop(d);
              final subject = Uri.encodeComponent(r.title);
              final body = Uri.encodeComponent('Check this request: $url');
              try {
                await launchUrl(
                    Uri.parse('mailto:?subject=$subject&body=$body'),
                    mode: LaunchMode.externalApplication);
              } catch (_) {}
            },
          ),
        ],
      ),
    );
  }

  void _showViewAnalytics() async {
    final token = AuthStore.instance?.token;
    if (token == null) return;
    try {
      final a = await _api.fetchRequestViewAnalytics(token, _id);
      if (!mounted) return;
      final viewers = a['viewers'];
      final list = viewers is List
          ? viewers.whereType<Map<String, dynamic>>().toList()
          : const <Map<String, dynamic>>[];
      showDialog<void>(
        context: context,
        builder: (d) => AlertDialog(
          title: const Text('Request views'),
          content: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
            _stat('Total', '${a['totalViews'] ?? 0}'),
            _stat('Unique', '${a['uniqueViews'] ?? 0}'),
            _stat('Members', '${a['loggedInUniqueViews'] ?? 0}'),
            _stat('Guests', '${a['anonymousUniqueViews'] ?? 0}'),
            const Divider(),
            for (final v in list.take(30))
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(v['fullName']?.toString() ??
                    (v['anonymous'] == true ? 'Guest' : 'Member')),
                subtitle: Text(
                    '${v['totalViews']} view${v['totalViews'] == 1 ? '' : 's'}'),
              ),
          ])),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(d), child: const Text('Close')),
          ],
        ),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not load view analytics.')));
      }
    }
  }

  Widget _stat(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [
          Expanded(
              child: Text(label,
                  style: TextStyle(color: AppPalette.of(context).textSecondary))),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
        ]),
      );

  void _showFulfilledDetail() async {
    final token = AuthStore.instance?.token ?? '';
    try {
      final d = await _api.fetchFulfilledRequestDetail(token, _id);
      if (!mounted) return;
      showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Fulfilled request'),
          content: SingleChildScrollView(
            child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (d['productName'] != null)
                    Text('Fulfilled via ${d['productName']}',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text(
                      'Fulfilled by: ${d['fulfilledByName'] ?? d['sellerFirstName'] ?? 'Community seller'}'),
                  if (d['sellerOrganization'] != null)
                    Text(d['sellerOrganization'].toString()),
                  if (d['fulfilledAt'] != null) ...[
                    const SizedBox(height: 8),
                    Text('On ${_formatDate(d['fulfilledAt'].toString())}',
                        style: TextStyle(color: AppPalette.of(context).textSecondary)),
                  ],
                ]),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Close')),
          ],
        ),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Could not load the fulfilled details.')));
      }
    }
  }

  String _formatDate(String raw) {
    final dt = DateTime.tryParse(raw);
    if (dt == null) return raw;
    final local = dt.toLocal();
    return '${local.day}/${local.month}/${local.year}';
  }

  @override
  Widget build(BuildContext context) {
    if (_needsRemoteLoad && _loadError != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Request')),
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.search_off, size: 40, color: Colors.grey),
            const SizedBox(height: 12),
            const Text('Request unavailable',
                style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(_loadError!,
                textAlign: TextAlign.center,
                style: TextStyle(color: AppPalette.of(context).textSecondary)),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () => NavigationBoundary.back(
                context,
                fallbackLocation: '/requests',
              ),
              child: const Text('Back to the request hub'),
            ),
          ]),
        ),
      );
    }
    if (_needsRemoteLoad && _live == null && _loadError == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Request')),
        body: const SkeletonPage(),
      );
    }
    final r = _Req(_req());
    return Scaffold(
      appBar: AppBar(
        title: const Text('Request'),
        actions: [
          IconButton(
            tooltip: 'Share',
            icon: const Icon(Icons.share_outlined),
            onPressed: _showShare,
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (r.images.isNotEmpty) _gallery(r),
          Row(children: [
            Expanded(
                child: Text(r.title,
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.w800))),
            _Status(r.status),
          ]),
          const SizedBox(height: 8),
          Text(_posterIdentityLine(r),
              style: TextStyle(color: AppPalette.of(context).textSecondary)),
          if (r.createdTime != null)
            Text(r.relativeTime,
                style: TextStyle(color: AppPalette.of(context).textSecondary)),
          const SizedBox(height: 16),
          if (r.status == 'FULFILLED') _fulfilledBanner(r),
          if (r.status == 'FULFILLED') const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppPalette.of(context).surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppPalette.of(context).border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Request details',
                    style:
                        TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                const SizedBox(height: 12),
                _field('Category', r.category ?? '—'),
                if (r.serviceCategory != null)
                  _field('Service', r.serviceCategory!),
                if (r.location != null) _field('Location', r.location!),
                if (r.budgetLabel != null) _field('Budget', r.budgetLabel!),
                if (r.startDate != null) _field('Needed from', r.startDate!),
                if (r.deadlineLabel != null)
                  _field('Deadline', r.deadlineLabel!),
                if (r.viewCount != null)
                  _field('Views',
                      '${r.viewCount} view${r.viewCount == 1 ? '' : 's'}'),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppPalette.of(context).surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppPalette.of(context).border),
            ),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('What they need',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Text(r.description ?? 'No description provided.',
                  style: const TextStyle(height: 1.5)),
            ]),
          ),
          const SizedBox(height: 24),
          if (_isOwner && (r.status ?? '') == 'PENDING') ...[
            _ownerActions(r),
          ] else if (r.status == 'PENDING') ...[
            FilledButton.icon(
              style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFFF59E0B),
                  // Dark ink on a fixed amber fill: correct in both modes.
                  foregroundColor: const Color(0xFF172033),
                  minimumSize: const Size.fromHeight(52),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14))),
              key: const ValueKey('request-nudge-btn'),
              onPressed: _nudging ? null : () => _nudge(),
              icon: Icon(r.serviceCategory != null
                  ? Icons.handyman_outlined
                  : Icons.favorite_rounded),
              label: Text(
                  _nudging
                      ? 'Sending…'
                      : r.serviceCategory != null
                          ? 'Offer this service'
                          : 'Nudge with a match',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
            if (_loggedIn) ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                key: const ValueKey('request-respond-listing-btn'),
                icon: const Icon(Icons.storefront_outlined, size: 18),
                label: const Text('Respond with one of my listings'),
                onPressed: _nudging ? null : _respondWithListing,
              ),
            ],
          ],
          if (_isOwner && _nudgesLoaded) _nudgesPanel(),
          if (_related.isNotEmpty) _relatedSection(),
        ],
      ),
    );
  }

  String _posterIdentityLine(_Req r) => requestPosterName(
      userName: r.userName, showIdentity: _isOwner || _canViewIdentity);

  Widget _gallery(_Req r) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      height: 220,
      child: PageView.builder(
        itemCount: r.images.length,
        itemBuilder: (context, i) => ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.network(
            // Resolved, not raw: `imageUrls` comes back relative (e.g.
            // `uploads/x.webp`), and `Image.network` on a relative path is not
            // a request to anyone — it paints the errorBuilder. The feed card
            // above has always resolved; this gallery did not, so the same
            // request showed its photo on the card and a grey placeholder
            // icon on its own detail page.
            AppConfig.resolveAssetUrl(r.images[i]),
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => Container(
              color: AppPalette.of(context).background,
              child: const Icon(Icons.image_outlined,
                  size: 48, color: Colors.grey),
            ),
          ),
        ),
      ),
    );
  }

  Widget _fulfilledBanner(_Req r) {
    return InkWell(
      onTap: _showFulfilledDetail,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
            color: Colors.green.shade50,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.green.shade200)),
        child: Row(children: [
          const Icon(Icons.verified_outlined, color: Colors.green),
          const SizedBox(width: 10),
          Expanded(
              child: Text(
                  r.fulfilledProductName != null
                      ? 'Fulfilled via ${r.fulfilledProductName}'
                      : 'Fulfilled',
                  style: const TextStyle(fontWeight: FontWeight.w600))),
          const Icon(Icons.chevron_right, size: 18, color: Colors.grey),
        ]),
      ),
    );
  }

  Widget _ownerActions(_Req r) {
    return Column(children: [
      Row(children: [
        Expanded(
          child: OutlinedButton.icon(
            key: const ValueKey('request-edit-btn'),
            icon: const Icon(Icons.edit_outlined, size: 18),
            label: const Text('Edit request'),
            onPressed: _acting
                ? null
                : () async {
                    final updated = await Navigator.of(context).push<bool>(
                      MaterialPageRoute(
                        settings: RouteSettings(name: '/request/$_id/edit'),
                        builder: (_) => CreateRequestScreen(
                            api: _api, requestId: _id, existing: _req()),
                      ),
                    );
                    if (updated == true) _refetch();
                  },
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: OutlinedButton.icon(
            key: const ValueKey('request-fulfill-btn'),
            icon: const Icon(Icons.check_circle_outline, size: 18),
            label: const Text('Fulfil'),
            onPressed: _acting ? null : _fulfillFlow,
          ),
        ),
      ]),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(
          child: OutlinedButton.icon(
            key: const ValueKey('request-delete-btn'),
            icon: const Icon(Icons.delete_outline, size: 18),
            style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFFDC2626)),
            label: const Text('Delete'),
            onPressed: _acting ? null : _deleteRequest,
          ),
        ),
      ]),
      const SizedBox(height: 8),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          key: const ValueKey('request-analytics-btn'),
          icon: const Icon(Icons.insights_outlined, size: 16),
          label: const Text('View analytics'),
          onPressed: _showViewAnalytics,
        ),
      ),
    ]);
  }

  Widget _nudgesPanel() {
    final unread = _nudges.where((n) => n['isRead'] == false).length;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(height: 20),
      Row(children: [
        const Icon(Icons.notifications_active_outlined, size: 18),
        const SizedBox(width: 6),
        Text(_nudges.isEmpty ? 'Responses' : 'Responses (${_nudges.length})',
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
        if (unread > 0) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
                color: const Color(0xFFDC2626),
                borderRadius: BorderRadius.circular(20)),
            child: Text('$unread new',
                style: const TextStyle(
                    fontSize: 11,
                    color: Colors.white,
                    fontWeight: FontWeight.w700)),
          ),
        ],
      ]),
      const SizedBox(height: 8),
      if (_nudges.isEmpty)
        Padding(
          padding: EdgeInsets.symmetric(vertical: 8),
          child: Text('No nudges yet.',
              style: TextStyle(color: AppPalette.of(context).textSecondary)),
        )
      else
        for (final n in _nudges) _nudgeRow(n),
    ]);
  }

  Widget _nudgeRow(Map<String, dynamic> n) {
    final name = (n['nudgerName'] ?? 'Responder').toString();
    final msg = (n['message'] ?? '').toString();
    final productName = n['productName']?.toString();
    final isUnread = n['isRead'] == false;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
          color: isUnread
              ? AppPalette.of(context).warningFill
              : AppPalette.of(context).surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
              color: isUnread
                  ? AppPalette.of(context).warningBorder
                  : AppPalette.of(context).border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
              child: Text(name,
                  style: const TextStyle(fontWeight: FontWeight.w700))),
          IconButton(
            tooltip: 'Contact',
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.contact_phone_outlined, size: 18),
            onPressed: () => _contactResponder(n),
          ),
        ]),
        if (msg.isNotEmpty) Text(msg, style: const TextStyle(height: 1.4)),
        if (productName != null && productName.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Offer: $productName',
                style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
        if (_isOwner && (n['productId'] != null || n['serviceOffer'] != null))
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              key: ValueKey('fulfill-nudge-${n['id'] ?? n['nudgeId']}'),
              onPressed: () => _fulfillByNudge(n),
              child: const Text('Fulfil with this offer'),
            ),
          ),
      ]),
    );
  }

  Widget _relatedSection() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(height: 20),
      const Text('Related requests',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
      const SizedBox(height: 8),
      for (final row in _related)
        InkWell(
          onTap: () => openRequestDetail(context, row, api: _api),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(children: [
              Expanded(
                  child: Text((row['title'] ?? '').toString(),
                      maxLines: 1, overflow: TextOverflow.ellipsis)),
              _Status((row['status'] ?? '').toString()),
            ]),
          ),
        ),
    ]);
  }

  Widget _field(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [
          Expanded(
              flex: 2,
              child: Text(label,
                  style: TextStyle(color: AppPalette.of(context).textSecondary))),
          Expanded(
              flex: 3,
              child: Text(value,
                  style: const TextStyle(fontWeight: FontWeight.w600))),
        ]),
      );

  bool get _loggedIn => (AuthStore.instance?.token ?? '').isNotEmpty;
}

/// Serialize a pending nudge intent to the JSON shape the sell wizard decodes
/// (web request-nudge-intent.ts stores the same object).
String jsonEncodeIntent(PendingRequestNudgeIntent intent) {
  return '{"requestId":${intent.requestId},'
      '"requestTitle":${_q(intent.requestTitle)},'
      '"message":${_q(intent.message)},'
      '"nudgeType":${_q(intent.nudgeType)},'
      '"category":${_q(intent.category)},'
      '"location":${_q(intent.location)},'
      '"returnTo":${_q(intent.returnTo)}}';
}

String _q(String? s) {
  if (s == null) return 'null';
  return '"${s.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"';
}

class _CompletedProduct {
  final int productId;
  final String productName;
  final String orderId;
  const _CompletedProduct(this.productId, this.productName, this.orderId);
}

class _Status extends StatelessWidget {
  final String? status;
  const _Status(this.status);
  @override
  Widget build(BuildContext context) {
    final s = (status ?? 'PENDING').toString().toUpperCase();
    final (Color bg, Color fg) = switch (s) {
      'FULFILLED' || 'COMPLETED' => (
          Colors.green.shade50,
          Colors.green.shade800
        ),
      'CLOSED' || 'EXPIRED' => (Colors.grey.shade200, Colors.grey.shade700),
      _ => (Colors.orange.shade50, Colors.orange.shade800),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(_displayLabel(s),
          style:
              TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fg)),
    );
  }

  String _displayLabel(String s) {
    switch (s) {
      case 'PENDING':
        return 'Open';
      case 'FULFILLED':
        return 'Fulfilled';
      case 'CLOSED':
        return 'Closed';
      default:
        return s;
    }
  }
}

/// Accessors resilient to missing/null fields. Reads the web RequestPost keys
/// so mobile and web render the same request the same way.
class _Req {
  final Map<String, dynamic> m;
  const _Req(this.m);

  String get title => m['title']?.toString() ?? '';
  String? get userName => m['userName'] as String?;
  String? get category => m['category'] as String?;
  String? get serviceCategory => m['serviceCategory'] as String?;
  String? get location => m['location'] as String?;
  String? get status {
    final s = (m['status'] ?? '').toString();
    return s.isEmpty ? null : s;
  }

  String? get description => m['description'] as String?;
  List<String> get images => requestImageUrls(m);
  int get unreadNudgeCount {
    final raw = m['unreadNudgeCount'] ?? 0;
    return raw is num ? raw.toInt() : int.tryParse('$raw') ?? 0;
  }

  int get nudgeCount {
    final raw = m['nudgeCount'] ?? 0;
    return raw is num ? raw.toInt() : int.tryParse('$raw') ?? 0;
  }

  int? get viewCount {
    final raw = m['viewCount'] ?? m['views'];
    if (raw == null) return null;
    return raw is num ? raw.toInt() : int.tryParse('$raw');
  }

  String? get fulfilledProductName => m['fulfilledProductName'] as String?;
  String? get fulfilledByName => m['fulfilledByName'] as String?;

  DateTime? get createdTime {
    final raw = m['createdAt'];
    if (raw == null) return null;
    final t = DateTime.tryParse('$raw');
    return t?.toUtc();
  }

  String get relativeTime => relativeRequestTime(createdTime);

  String? get startDate {
    final raw = m['fulfillmentStartDate'];
    if (raw == null) return null;
    final s = '$raw';
    final t = DateTime.tryParse(s.length >= 10 ? s.substring(0, 10) : s);
    if (t == null) return s;
    final local = t.toLocal();
    return '${local.day}/${local.month}/${local.year}';
  }

  String? get deadlineLabel {
    final raw = m['fulfillmentDeadline'];
    if (raw == null) return null;
    final s = '$raw';
    final t = DateTime.tryParse(s.length >= 10 ? s.substring(0, 10) : s);
    if (t == null) return s;
    final local = t.toLocal();
    return '${local.day}/${local.month}/${local.year}';
  }

  String? get budgetLabel {
    final min = m['minimumBudget'];
    final max = m['maximumBudget'];
    if (min == null && max == null) return null;
    return requestBudgetSummary(
        min is num ? min.toDouble() : null, max is num ? max.toDouble() : null);
  }
}
