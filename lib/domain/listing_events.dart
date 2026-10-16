import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import 'pending_actions.dart' show requestPendingActionsRefresh;

/// Tells every screen that shows listings that one was published, edited,
/// archived or deleted. Home's rails and My Listings stay mounted behind the
/// tabs and keep what they first loaded, so without this a seller's new
/// listing only appeared after a manual pull-to-refresh — or not at all,
/// while the profile read (which carries "My Listings") sat in its cache.
class ListingEvents extends ChangeNotifier {
  ListingEvents._();
  static final ListingEvents instance = ListingEvents._();

  void changed() {
    // My Listings reads the seller's products from the profile.
    ApiClient.invalidateReads('user-details');
    notifyListeners();
    // A fixed (or newly hidden) listing changes the reminder in the strip.
    requestPendingActionsRefresh();
  }
}
