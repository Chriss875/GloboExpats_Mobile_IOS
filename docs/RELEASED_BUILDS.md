# Build ledger

Every artifact `tool/build_release.sh` produces, newest last.

One bundle id serves both tracks, so a version code can be used exactly once
across the whole table. The script refuses to reuse one — move it with
`--bump`, never by hand-editing `pubspec.yaml`.

| Built (UTC) | Backend | Version | Code | Artifact |
|---|---|---|---|---|
| 2026-09-17 06:38 | prod | 1.0.11 | 14 | build/app/outputs/bundle/release/app-prod-14.aab |
| 2026-09-17 06:40 | dev | 1.0.11 | 15 | build/app/outputs/bundle/release/app-dev-15.aab |
| 2026-09-17 06:52 | prod | 1.0.11 | 16 | build/app/outputs/bundle/release/app-prod-16.aab |
| 2026-09-17 06:53 | dev | 1.0.11 | 17 | build/app/outputs/bundle/release/app-dev-17.aab |
| 2026-09-17 10:43 | prod | 1.0.11 | 18 | build/app/outputs/bundle/release/app-prod-18.aab |
| 2026-09-17 14:17 | dev | 1.0.11 | 19 | build/app/outputs/flutter-apk/app-dev-19.apk |
| 2026-09-17 14:40 | prod | 1.0.11 | 20 | build/app/outputs/flutter-apk/app-prod-20.apk |
| 2026-09-17 14:58 | prod | 1.0.11 | 21 | build/app/outputs/flutter-apk/app-prod-21.apk |
| 2026-09-17 15:07 | prod | 1.0.11 | 22 | build/app/outputs/flutter-apk/app-prod-22.apk |
| 2026-09-17 15:14 | prod | 1.0.11 | 23 | build/app/outputs/flutter-apk/app-prod-23.apk |
| 2026-09-17 15:19 | prod | 1.0.11 | 24 | build/app/outputs/bundle/release/app-prod-24.aab |
| 2026-09-17 15:20 | dev | 1.0.11 | 25 | build/app/outputs/bundle/release/app-dev-25.aab |
| 2026-09-19 20:41 | prod | 1.0.11 | 26 | build/app/outputs/flutter-apk/app-prod-26.apk |
| 2026-09-20 04:57 | prod | 1.0.11 | 27 | build/app/outputs/flutter-apk/app-prod-27.apk |
| 2026-09-20 05:48 | prod | 1.0.11 | 28 | build/app/outputs/flutter-apk/app-prod-28.apk |
| 2026-09-20 06:31 | prod | 1.0.11 | 29 | build/app/outputs/flutter-apk/app-prod-29.apk |
| 2026-09-20 08:15 | prod | 1.0.11 | 30 | build/app/outputs/flutter-apk/app-prod-30.apk |
| 2026-09-20 08:54 | dev | 1.0.11 | 31 | build/app/outputs/flutter-apk/app-dev-31.apk |
| 2026-09-20 09:17 | dev | 1.0.11 | 32 | build/app/outputs/flutter-apk/app-dev-32.apk |
| 2026-09-20 10:15 | dev | 1.0.11 | 33 | build/app/outputs/flutter-apk/app-dev-33.apk |
| 2026-09-20 10:38 | dev | 1.0.11 | 34 | build/app/outputs/flutter-apk/app-dev-34.apk |
| 2026-09-20 11:59 | dev | 1.0.11 | 35 | build/app/outputs/flutter-apk/app-dev-35.apk |
| 2026-09-20 17:19 | dev | 1.0.11 | 36 | build/app/outputs/flutter-apk/app-dev-36.apk |
| 2026-09-20 17:37 | dev | 1.0.11 | 37 | build/app/outputs/flutter-apk/app-dev-37.apk |
| 2026-09-20 17:39 | dev | 1.0.11 | 38 | build/app/outputs/bundle/release/app-dev-38.aab |
| 2026-09-20 17:41 | prod | 1.0.11 | 39 | build/app/outputs/bundle/release/app-prod-39.aab |
| 2026-09-24 16:25 | dev | 1.0.11 | 40 | build/app/outputs/flutter-apk/app-dev-40.apk |
| 2026-09-24 16:48 | dev | 1.0.11 | 41 | build/app/outputs/flutter-apk/app-dev-41.apk |
| 2026-09-24 17:30 | dev | 1.0.11 | 42 | build/app/outputs/flutter-apk/app-dev-42.apk |
| 2026-09-24 21:50 | dev | 1.0.11 | 43 | build/app/outputs/bundle/release/app-dev-43.aab |
| 2026-09-24 21:52 | prod | 1.0.11 | 44 | build/app/outputs/bundle/release/app-prod-44.aab |
| 2026-09-27 02:18 | prod | 1.0.11 | 45 | build/app/outputs/flutter-apk/app-prod-45.apk |
| 2026-09-27 02:31 | prod | 1.0.11 | 46 | build/app/outputs/flutter-apk/app-prod-46.apk |
| 2026-09-27 08:05 | dev | 1.0.11 | 47 | build/app/outputs/flutter-apk/app-dev-47.apk |
| 2026-09-27 09:00 | dev | 1.0.11 | 48 | build/app/outputs/bundle/release/app-dev-48.aab |
| 2026-09-27 09:01 | prod | 1.0.11 | 49 | build/app/outputs/bundle/release/app-prod-49.aab |
| 2026-09-27 11:14 | dev | 1.0.11 | 50 | build/app/outputs/bundle/release/app-dev-50.aab |
| 2026-09-27 11:15 | prod | 1.0.11 | 51 | build/app/outputs/bundle/release/app-prod-51.aab |
| 2026-09-27 11:17 | prod | 1.0.11 | 52 | build/app/outputs/flutter-apk/app-prod-52.apk |
| 2026-09-27 11:35 | prod | 1.0.11 | 53 | build/app/outputs/flutter-apk/app-prod-53.apk |
| 2026-09-27 12:41 | dev | 1.0.11 | 54 | build/app/outputs/bundle/release/app-dev-54.aab |
| 2026-09-27 12:42 | prod | 1.0.11 | 55 | build/app/outputs/bundle/release/app-prod-55.aab |
| 2026-09-27 12:53 | dev | 1.0.11 | 56 | build/app/outputs/bundle/release/app-dev-56.aab |
| 2026-09-27 12:55 | prod | 1.0.11 | 57 | build/app/outputs/bundle/release/app-prod-57.aab |
| 2026-09-28 20:52 | dev | 1.0.11 | 58 | build/app/outputs/bundle/release/app-dev-58.aab |
| 2026-09-28 20:53 | prod | 1.0.11 | 59 | build/app/outputs/bundle/release/app-prod-59.aab |
| 2026-09-30 17:26 | prod | 1.0.11 | 60 | build/app/outputs/flutter-apk/app-prod-60.apk |
| 2026-09-30 17:39 | prod | 1.0.11 | 61 | build/app/outputs/flutter-apk/app-prod-61.apk |
| 2026-09-30 18:45 | prod | 1.0.11 | 62 | build/app/outputs/flutter-apk/app-prod-62.apk |
| 2026-09-30 19:07 | prod | 1.0.11 | 63 | build/app/outputs/flutter-apk/app-prod-63.apk |
| 2026-09-30 20:37 | prod | 1.0.11 | 64 | build/app/outputs/bundle/release/app-prod-64.aab |
| 2026-10-01 08:07 | dev | 1.0.11 | 65 | build/app/outputs/bundle/release/app-dev-65.aab |
| 2026-10-04 13:31 | prod | 1.0.11 | 66 | build/app/outputs/bundle/release/app-prod-66.aab |
| 2026-10-04 13:33 | dev | 1.0.11 | 67 | build/app/outputs/bundle/release/app-dev-67.aab |
| 2026-10-04 13:38 | dev | 1.0.11 | 68 | build/app/outputs/bundle/release/app-dev-68.aab |
| 2026-10-05 17:25 | prod | 1.0.11 | 69 | build/app/outputs/bundle/release/app-prod-69.aab |
| 2026-10-05 17:27 | dev | 1.0.11 | 70 | build/app/outputs/bundle/release/app-dev-70.aab |
| 2026-10-05 19:00 | prod | 1.0.11 | 71 | build/app/outputs/bundle/release/app-prod-71.aab |
| 2026-10-05 19:02 | dev | 1.0.11 | 72 | build/app/outputs/bundle/release/app-dev-72.aab |
| 2026-10-05 19:43 | prod | 1.0.11 | 73 | build/app/outputs/bundle/release/app-prod-73.aab |
| 2026-10-05 19:45 | dev | 1.0.11 | 74 | build/app/outputs/bundle/release/app-dev-74.aab |
| 2026-10-09 11:51 | prod | 1.0.11 | 75 | build/app/outputs/bundle/release/app-prod-75.aab |
| 2026-10-09 11:54 | dev | 1.0.11 | 76 | build/app/outputs/bundle/release/app-dev-76.aab |
