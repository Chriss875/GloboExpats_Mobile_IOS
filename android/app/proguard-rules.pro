# Flutter/Dart run in their own engine, so R8 only ever sees the thin Android
# shell plus plugin code. These keeps cover the plugins this app uses that
# reach Java/Kotlin classes reflectively.

# Flutter embedding
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.embedding.**

# Google Play services (Maps + Sign-In)
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# Keep annotations R8 uses to reason about the above
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# Play Core / deferred components. The Flutter embedding references
# FlutterPlayStoreSplitApplication, whose Play Core superclass is NOT on the
# classpath for an app that does not use dynamic feature modules — R8 fails
# the build over it unless these are declared.
-dontwarn com.google.android.play.core.**
-keep class com.google.android.play.core.** { *; }
