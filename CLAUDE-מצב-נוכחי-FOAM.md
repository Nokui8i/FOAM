# FOAM — מצב נוכחי / Source of Truth

> מסמך onboarding מחייב לכל סשן Claude חדש. הקוד בריפו גובר על המסמך הזה, והמסמך הזה גובר על מסמכים היסטוריים.
> מונחי סטטוס: `IMPLEMENTED` = קוד נקרא ונמצא שלם ברמת הקוד (לא הוכחת ריצה) · `PARTIAL` = קיים חלקית · `NOT YET IMPLEMENTED` = לא קיים · `NOT VERIFIED` = לא נבדק בפועל · `PARTIAL / NOT VERIFIED` = קוד קיים, אימות ריצה חסר.

## 1. Project Identity

- **FOAM** — שירות איסוף/מסירת כביסה וניקוי יבש (לאס וגאס). מערכת אחת מונעת-backend עם כמה לקוחות.
- לקוחות: Customer Web, OPS Web, Driver Web, OPS Android, OPS iOS, Driver Android, Driver iOS.
- Backend משותף: Firebase (פרויקט `foam-laundry-app` לפי `.firebaserc`) — Auth, Firestore, Storage, Cloud Functions, Hosting.
- מזהי Native: Driver = `app.foam.driver` (portal `driver`), OPS = `app.foam.ops` (portal `ops`).

## 2. Source of Truth

1. הקוד בריפו (ה-branch הנוכחי) — מקור האמת העליון.
2. Firebase (rules, functions, data contracts) — מקור האמת של נתונים והרשאות. client checks הם UX בלבד.
3. המסמך הזה — תמונת מצב מאומתת לתאריך הביקורת (סעיף אחרון).
4. `.cursor/rules/*.mdc` ו-`AGENTS.md` — כללי עבודה מחייבים.
5. `Claude outputs/`, מסמכי Project ישנים, briefs — רקע היסטורי בלבד, לא הוכחת מימוש.

## 3. Repository / Branch

| פריט | ערך | מקור |
|---|---|---|
| Remote | `https://github.com/Nokui8i/FOAM.git` | `.git/config` |
| Branch | `feat/desktop-image-transitions` | `.git/HEAD` |
| HEAD commit | `f84ad173ba885e2cff58c553d049e815a6e74319` — "Sync FOAM native apps and platform architecture" | `.git/refs/heads/...`, `git log` |
| קומיטים קודמים | `7226da8` Capacitor Android/iOS shells · `71e3335` Stripe Functions (Node 22) · `5ff3e70` Stripe sandbox foundation | `git log` |
| `git status` (2026-10-02) | אין שינויים בקבצים במעקב. untracked: `CLAUDE-Project-Instructions-FOAM.md`, `CLAUDE-מצב-נוכחי-FOAM.md`, `android-driver/`, `android/.idea/`, `functions/.agents/` | `git status` (GitKraken, read-only) |
| התאמה ל-GitHub | Git מדווח "up to date with origin" — לפי remote-tracking ref מקומי בלבד, בלי fetch חי | `NOT VERIFIED` מול GitHub חי |

- **המסמך הזה עצמו untracked** — לא נמצא ב-Git ולא ב-GitHub עד שהמשתמש יבקש commit.
- `android-driver/` כולו untracked — פרויקט Capacitor של Driver קיים רק מקומית, לא ב-GitHub.

## 4. Complete Architecture

```
Customer Web ─┐
OPS Web ──────┤   Next.js 16 / React 19, static export (out/) → Firebase Hosting
Driver Web ───┘   אותה אפליקציה; /ops, /admin, /driver, /book, /track, /account …
                     │
                     ▼
              Firebase (foam-laundry-app)
              Auth · Firestore · Storage · Cloud Functions (Stripe)
                     ▲
OPS Native ───┐      │   React Native 0.86 + Expo SDK 57 + Expo Router + TypeScript
Driver Native ┘──────┘   mobile/ops, mobile/driver — Firebase JS SDK, Dev Builds
                     │
              packages/foam-staff-core  (@foam/staff-core — טיפוסים וכללי staff טהורים)

Legacy: Capacitor WebView shells — android/ (OPS), android-driver/ (Driver), ios/ (OPS בלבד)
```

- Root `package.json` מגדיר npm workspaces: `mobile/driver`, `mobile/ops`, `packages/foam-staff-core` (`installConfig.hoistingLimits: workspaces`).
- `next.config.ts`: `output: "export"` — אין server runtime ל-Next; כל הלוגיקה של Web רצה ב-client מול Firebase. `app/api/auth/google-client-id` הוא stub סטטי שאינו בשימוש.
- אוטומציה עסקית רצה ב-client של OPS Web ולא ב-backend: `components/admin-app.tsx` קורא ל-`reconcileWeeklyQueues` (`lib/weekly-automation.ts`) ול-`purgeExpiredOpsDataOncePerSession` (`lib/data-retention.ts`). אין Cloud Function מקבילה.

## 5. Customer Web

| יכולת | מצב | ראיות |
|---|---|---|
| דפי שיווק/מידע (home, about, faq, guide, specialty, dry-cleaning, contact) | `IMPLEMENTED` (קוד) | `app/*/page.tsx` |
| הזמנת איסוף `/book` (כולל guest) | `IMPLEMENTED` (קוד) | `components/booking-app.tsx`, `lib/booking.ts`; rules `orders` create |
| מעקב הזמנה `/track` (מפתח סודי) | `IMPLEMENTED` (קוד, realtime) | `components/track-app.tsx` (`onSnapshot`), rules `orderTracks` get-only |
| עריכת הזמנה ממעקב (prefs/notes/reschedule) | `IMPLEMENTED` (קוד) | `components/track-order-edit.tsx`, `lib/order-edit.ts`; rules editProof |
| חשבון `/account` + היסטוריית הזמנות | `IMPLEMENTED` (קוד, realtime) | `app/account/account-app.tsx`, `components/account-orders.tsx` (`onSnapshot`) |
| התחברות לקוח (Google popup/redirect) | `IMPLEMENTED` (קוד) | `lib/google-sign-in.ts`, `getCustomerAuth()` |
| שמירת כרטיס (Stripe SetupIntent) | `IMPLEMENTED` (קוד) / Stripe sandbox | `components/save-card-panel.tsx`, Functions `createSetupIntent`, `confirmCardSaved` |
| ריצת production / האתר החי | `NOT VERIFIED` | לא נבדק |

## 6. OPS Web

- נתיבים: `/ops` ו-`/admin` (שניהם מרנדרים `components/admin-app.tsx`).
- Firebase app נפרד לצוות: `foam-staff` עם `browserSessionPersistence` (per-tab), כדי ש-signOut של צוות לא ינתק את אתר הלקוח (`lib/firebase.ts`).
- פאנלים: Orders, Alerts, Catalog, Contacts, Pricing, Promos, Schedule, Staff (`components/admin-*-panel.tsx`).
- Realtime: `onSnapshot` על orders, contactMessages, staff ממתינים, staff/{uid}, staffBanned, ops-unread.
- הזמנות: שינוי סטטוס, הקצאת נהג (`assignedDriverUid`), תמונות (Storage `order-photos/`), חיוב/חיוב נוסף/החזר דרך Functions.
- ניהול צוות: approve/deny/revoke/remove/ban/unban, הרשאות לפי owner/manager (`lib/staff-access.ts`, `components/admin-staff-panel.tsx`).
- מצב: `IMPLEMENTED` (קוד) · ריצה מלאה `NOT VERIFIED`.

## 7. Driver Web

- נתיב `/driver` → `components/driver-app.tsx`, אותו staff Firebase app.
- משתמש ב-`AdminOrdersPanel` במצב נהג: query realtime על `orders` לפי `assignedDriverUid == uid` (index קיים ב-`firestore.indexes.json`).
- נהג מעדכן workflow בהזמנות שהוקצו לו (rules מונעות שינוי הקצאה); העלאת תמונות דרך `<input accept="image/*">` (לא camera API ייעודי).
- GPS/מיקום: `NOT YET IMPLEMENTED` (לא נמצא שימוש ב-geolocation).
- מצב: `IMPLEMENTED` (קוד) · ריצה `NOT VERIFIED`.

## 8. Native Driver

| מימד | מצב |
|---|---|
| Source code | `PARTIAL` — shell אימות בלבד |
| Android runtime | `NOT VERIFIED` (אין ראיה בריפו; הערות קוד מעידות על דיבאג Android ב-Google Sign-In) |
| iOS runtime | `NOT VERIFIED` |
| Web parity | `PARTIAL` — רק staff auth/access; אין הזמנות |
| Realtime sync | `PARTIAL` — רק `staff/{uid}` ו-`staffBanned/{email}` |

- מבנה: `mobile/driver/src/app/` — `_layout.tsx`, `index.tsx` (guard), `login.tsx`, `portal.tsx`; `src/lib/` — `firebase.ts`, `google-signin.ts`, `staff.ts`, `staff-auth.tsx`, `app-identity.ts`, `admin-emails.ts`.
- `portal.tsx`: "Authenticated shell only. Orders, camera, and GPS arrive in later milestones" (Milestone 6B).
- Expo `app.json`: slug `foam-driver`, scheme `foam-driver`, `supportsTablet: false`, plugins: expo-router, expo-dev-client, expo-splash-screen, `@react-native-google-signin/google-signin`; `newArchEnabled: true`; `typedRoutes`.
- אין תיקיות `android/`/`ios/` native בתוך `mobile/driver` — נוצרות ב-prebuild/EAS (לא committed).
- `eas.json`: profiles `development` (developmentClient, internal), `preview`. `extra.eas.projectId = "replace-after-eas-init"` → EAS עוד לא אותחל.

## 9. Native OPS

- זהה ל-Native Driver ברמת המבנה וה-lib (`staff.ts`, `staff-auth.tsx`, `google-signin.ts`, `firebase.ts` זהים byte-for-byte לשל Driver).
- הבדלים: identity (`ops` / `app.foam.ops` / `foam-ops`), `supportsTablet: true`, מסך login עם מצב "Driver access only" וכפתור `Linking.openURL("foam-driver://")`.
- `portal.tsx`: "Order management and staff admin tools arrive in later milestones".
- Source: `PARTIAL` · Android runtime `NOT VERIFIED` · iOS runtime `NOT VERIFIED` · Web parity `PARTIAL` (auth בלבד) · Realtime `PARTIAL` (staff/ban בלבד).
- **אין ב-OPS Native**: הזמנות, ניהול צוות (approve/deny/ban), schedule, pricing, promos, contacts, alerts, weekly automation — `NOT YET IMPLEMENTED`.

## 10. Shared Packages

- `packages/foam-staff-core` (`@foam/staff-core`): TypeScript טהור, ללא React/Firebase/DOM. **לא stub** — `src/index.ts` מכיל: `StaffRole/Status/Portal/Profile`, `StaffBannedError`, `DEFAULT_ADMIN_EMAILS`, `parseAdminEmails`, `isAdminEmail`, `normalize*`, `mapStaffProfile`, `defaultRoleForPortal`, `staffAccessGateKind`, `canAccessOps`, `canAccessDriverPortal`, והודעות login.
- `README.md` של החבילה ("Currently a stub only") — **מיושן וסותר את הקוד**.
- צרכנים: רק `mobile/driver` ו-`mobile/ops`. **Web לא מייבא את `@foam/staff-core`** — `lib/staff-access.ts` מכיל עותק משלו של אותה לוגיקה → סיכון drift.
- Firestore access של staff (`staff.ts`, `staff-auth.tsx`) משוכפל בין שתי אפליקציות ה-Native ולא נמצא בחבילה משותפת.
- `node_modules/@foam/{driver,ops,staff-core}` הם symlinks של workspaces.

## 11. Firebase / Backend

- `firebase.json`: firestore (rules + indexes), functions (`functions/`, predeploy build), storage rules, hosting (`public: out`, cleanUrls, headers).
- Firestore collections ב-rules: `users`, `staff`, `staffBanned`, `drivers` (legacy), `contactMessages`, `orders`, `orderTracks`, `promoCodes`, `pickupDayOverrides`, `config`, `pickupAvailability`; catch-all deny.
- Indexes: `orders` (uid ↑, createdAt ↓), `orders` (assignedDriverUid ↑, createdAt ↓).
- Storage: `order-photos/{orderId}/{file}` — staff בלבד, תמונות < 8MB; catch-all deny.
- Cloud Functions (`functions/src/index.ts`, v2, `us-central1`, Node 22): `createSetupIntent`, `confirmCardSaved`, `removeSavedCard`, `createGuestSetupIntent`, `confirmGuestCardSaved`, `chargeOrder`, `chargeOrderMore`, `createOnSpotPaymentIntent`, `finalizeOnSpotCharge`, `refundOrder` (onCall), `stripeWebhook` (onRequest).
- אין ב-Functions: Firestore triggers, scheduled jobs, push notifications, staff management.
- מצב פריסה, Console, providers, משתמשים, נתונים: `NOT VERIFIED`.

## 12. Authentication / Staff

| פריט | Web (OPS/Driver) | Native (OPS/Driver) | ראיות |
|---|---|---|---|
| Google Sign-In | `IMPLEMENTED` — popup/redirect; ב-Capacitor דרך `@capacitor-firebase/authentication` | `PARTIAL / NOT VERIFIED` — `@react-native-google-signin/google-signin` v16 → `GoogleAuthProvider.credential` → `signInWithCredential` | `lib/google-sign-in.ts`, `mobile/*/src/lib/google-signin.ts` |
| Firebase Auth persistence | staff app נפרד, session per-tab | AsyncStorage (`getReactNativePersistence`) | `lib/firebase.ts`, `mobile/*/src/lib/firebase.ts` |
| `staff/{uid}` create pending | `IMPLEMENTED` | `PARTIAL / NOT VERIFIED` (אותה סמנטיקה, `getDocFromServer`) | `ensureStaffProfile` בשני הצדדים |
| pending/approved/denied/revoked | `IMPLEMENTED` | `PARTIAL / NOT VERIFIED` | `staffAccessGateKind`; denied/revoked → מחיקה ובקשה מחדש בכניסה הבאה |
| pending → approved | `IMPLEMENTED` | `PARTIAL / NOT VERIFIED` — release ל-login עם "You're approved" | `staff-auth.tsx` |
| הסרה (staff doc נמחק) | `IMPLEMENTED` | `PARTIAL / NOT VERIFIED` — logout עם "access was removed" | `subscribeStaffProfile` |
| `staffBanned/{email}` | ban/unban + רשימה `IMPLEMENTED` (OPS Web) | בדיקה + listener `PARTIAL / NOT VERIFIED`; ממשק ban/unban `NOT YET IMPLEMENTED` | `lib/staff-access.ts`, `mobile/*/src/lib/staff.ts` |
| התנהגות ban חי | banned shell, Auth נשאר עד Sign out | זהה ("match web") | `holdBannedSession` |
| unban חי | `IMPLEMENTED` | `PARTIAL / NOT VERIFIED` — סנכרון מחדש של staff access | `subscribeStaffBan` |
| ניהול צוות (approve/deny/revoke/role) | `IMPLEMENTED` (OPS Web) | `NOT YET IMPLEMENTED` | `admin-staff-panel.tsx` |
| הפרדת portals | `canAccessOps` (admin/manager), `canAccessDriverPortal` (driver/admin/manager); owner allowlist תמיד עובר | זהה דרך `@foam/staff-core`; approved driver ב-OPS → מסך "Driver access only" | `staff-core/src/index.ts` |
| זהות Driver vs OPS | נתיבים נפרדים | `FOAM_APP_PORTAL` קבוע לכל binary + `assertStaffPortalMatchesApp` + `getFoamAppIdentityError` (package/slug) — portal לעולם לא נגזר מה-role | `mobile/*/src/lib/app-identity.ts` |
| Owner allowlist | 3 כתובות, hardcoded | `EXPO_PUBLIC_ADMIN_EMAILS` או ברירת מחדל מ-staff-core | rules, storage.rules, `lib/site-config.ts`, staff-core |
| Android runtime | — | `NOT VERIFIED` | אין רשומת בדיקה בריפו |
| iOS runtime | — | `NOT VERIFIED` | אין רשומת בדיקה בריפו |

## 13. Cross-Platform Synchronization

- כלל מחייב: `.cursor/rules/foam-cross-platform-sync.mdc` — Firebase הוא מקור האמת, סנכרון דו-כיווני realtime, Android **וגם** iOS, parity התנהגותי מול Web. זו דרישה, לא הוכחה.
- **מסונכרן היום (ברמת קוד):** מצב staff (pending/approved/denied/revoked/removed) ו-ban/unban — בין OPS Web, Driver Web, ו-OPS/Driver Native, דרך `staff/{uid}` ו-`staffBanned/{email}`. אימות ריצה ב-Native: `NOT VERIFIED`.
- **מסונכרן רק בין לקוחות Web:** הזמנות, הקצאת נהג, סטטוסים, תמונות, תשלומים, schedule, promos, pricing, contacts, alerts.
- **Native:** כל מה שאינו staff auth — `NOT YET IMPLEMENTED`.
- Notifications (push) — `NOT YET IMPLEMENTED` בכל הפלטפורמות; יש רק alerts/unread בתוך OPS Web.

## 14. Realtime Architecture

- Firestore `onSnapshot` הוא מנגנון ה-realtime היחיד. אין FCM, אין Functions triggers.
- Web: listeners ב-`admin-app.tsx` (orders, contactMessages, pending staff, ops-unread), `admin-orders-panel.tsx` (orders לפי נהג), `track-app.tsx`, `account-orders.tsx`, `lib/pickup-schedule.ts`, `lib/promo-codes.ts`, `lib/staff-access.ts`.
- Native: `subscribeStaffProfile` + `subscribeStaffBan` בלבד.
- Web staff app משתמש ב-`persistentLocalCache`; Native משתמש ב-Firestore ברירת מחדל. החלטות gate נקראות מה-server (`getDocFromServer`) כדי לא להסתמך על cache.

## 15. Android

| פרויקט | טכנולוגיה | מזהה | מצב |
|---|---|---|---|
| `android/` | Capacitor (legacy) — OPS | `app.foam.ops` | בריפו; טוען `out/ops.html` מקומי |
| `android-driver/` | Capacitor (legacy) — Driver | `app.foam.driver` | **untracked**; מתעדכן מ-`android/` דרך `scripts/sync-android-driver.cjs` |
| `mobile/ops` | Expo (חדש) | `app.foam.ops` | native project לא committed (prebuild) |
| `mobile/driver` | Expo (חדש) | `app.foam.driver` | native project לא committed (prebuild) |

- אותם applicationId משמשים גם Capacitor וגם Expo → לא ניתן להתקין את שתיהן במקביל על אותו מכשיר. החלפה בחנויות — שלב עתידי (`mobile/README.md`).
- `google-services.json` קיים ב-`mobile/driver`, `mobile/ops`, `android/app` (תוכן לא נקרא — סודות/config).
- ריצה/בנייה: `NOT VERIFIED`.

## 16. iOS

- `ios/` (Capacitor legacy): פרויקט אחד בלבד, `capacitor.config.json` עם `appId: app.foam.ops`, אבל `project.pbxproj` מגדיר `PRODUCT_BUNDLE_IDENTIFIER = app.foam.laundry` ו-`CFBundleDisplayName = FOAM` — **אי-התאמה**. אין iOS Capacitor ל-Driver.
- Expo: `ios.bundleIdentifier` = `app.foam.driver` / `app.foam.ops`, `GoogleService-Info.plist` לכל אחד, `iosUrlScheme` ל-Google Sign-In ב-`app.json`. אופציונלי: `EXPO_PUBLIC_FIREBASE_IOS_CLIENT_ID`.
- אין native `ios/` committed ב-Expo; build/simulator/מכשיר: `NOT VERIFIED`.

## 17. Metro / Development Environment

- לכל אפליקציה `metro.config.js` משלה (זהים): `watchFolders = [monorepoRoot]` ו-`nodeModulesPaths` לפתרון `@foam/staff-core`.
- `start` = `expo start --dev-client` **בלי פורט קבוע**. ה-root scripts: `mobile:driver`, `mobile:ops`, `mobile:*:typecheck`.
- **מוסכמת פיתוח (לא בקוד, לא ארכיטקטורת production):** Driver Metro = `8081`, OPS Metro = `8082`. מטרה: כל Dev Client מתחבר לשרת של הפרויקט שלו.
- **בעיית עבר — bundle contamination:** Dev Client של אפליקציה אחת טען JS bundle של השנייה (למשל OPS bundle בתוך Driver APK), כי שתיהן חולקות monorepo וברירת המחדל של Metro היא 8081. הגנה בקוד: `getFoamAppIdentityError()` משווה native applicationId, package ב-config ו-slug, ועוצר את האפליקציה עם הודעת "Wrong JS bundle".
- **בעיה פתוחה:** `app-identity.ts` מייבא `expo-application`, אבל החבילה **לא מופיעה** ב-`mobile/*/package.json`, לא ב-`package-lock.json` ולא ב-`node_modules` בתיקייה הזו. סביר ש-Metro ייכשל בפתרון ה-import. `NOT VERIFIED` אם `C:\FOAM` שונה.
- Env: Native דורש `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID`, אופציונלי `EXPO_PUBLIC_FIREBASE_IOS_CLIENT_ID`, `EXPO_PUBLIC_ADMIN_EMAILS` (תבנית: `.env.example`). Web דורש `NEXT_PUBLIC_FIREBASE_*`. ערכים לא נקראו.
- תהליכי Metro פעילים, פורטים בפועל, מכשירים: `NOT VERIFIED`.

## 18. Capacitor Legacy / Migration Status

- **עדיין קיים ופעיל בקוד:** `capacitor.config.ts` (OPS), `capacitor.driver.config.ts` (Driver), `android/`, `android-driver/`, `ios/`, תלויות `@capacitor/*` ו-`@capacitor-firebase/authentication` ב-root, `components/capacitor-native-boot.tsx` (נטען ב-`app/layout.tsx`), ענף Capacitor ב-`lib/google-sign-in.ts`, scripts: `cap:sync`, `cap:assets`, `cap:android*`, `cap:ios`, `generate-native-assets.cjs`, `fix-capacitor-android-settings.cjs`, `sync-android-driver.cjs`, `apply-ops-splash.cjs`.
- Capacitor = WebView על build מקומי של `out/` (`ops.html` / `driver.html`) — לא טוען את האתר החי.
- **כיוון:** React Native + Expo הוא הארכיטקטורה החדשה. Capacitor נשאר legacy — לא מוחקים, לא מעבירים אוטומטית, לא מוסיפים בו פיצ'רים (`foam-no-capacitor-shortcuts.mdc`).
- **מצב המעבר:** Expo מכסה כרגע רק staff auth. כל פונקציונליות המוצר לצוות במובייל קיימת היום רק דרך Capacitor/Web. `PARTIAL`.
- `cap:android*` scripts מכילים נתיב קשיח `C:\FOAM` — לא יעבדו מתיקיית OneDrive בלי התאמה.

## 19. Security / Firestore Rules

- `isAdmin` = owner email או staff approved עם role admin/manager. `isDriver` = staff approved עם role driver. `isStaff` = כל approved staff.
- `staff/{uid}`: create עצמי כ-pending בלבד (owner יכול approved); update לפי owner/manager/self עם הגבלות שדות; manager מנהל רק נהגים ובקשות pending; owner לא ניתן לשינוי ע"י אחרים.
- `staffBanned/{emailId}`: קריאה עצמית לפי email ב-token; כתיבה/מחיקה ע"י directory readers (owner/admin/manager).
- `orders`: create עם ולידציה (guest/owner/admin); read — admin, נהג מוקצה, בעל ההזמנה; update — admin, נהג מוקצה (בלי שינוי הקצאה), ביטול ע"י בעלים, עריכה עם editProof.
- תצפית לבדיקה (ללא שינוי): `pickupAvailability` מאפשר create/update ללא אימות (בכפוף לולידציה על מבנה). `orderTracks` get פתוח — המפתח הסודי הוא בקרת הגישה.
- שינוי rules/functions/indexes/Auth/deploy — רק באישור מפורש (`foam-firebase-approval-gate.mdc`). מצב rules שפורסמו: `NOT VERIFIED`.

## 20. Current Feature Matrix

| Feature | Customer Web | OPS Web | Driver Web | OPS Android | OPS iOS | Driver Android | Driver iOS | Firebase/backend | Status |
|---|---|---|---|---|---|---|---|---|---|
| Google Sign-In (staff) | — | IMPLEMENTED | IMPLEMENTED | PARTIAL / NOT VERIFIED | PARTIAL / NOT VERIFIED | PARTIAL / NOT VERIFIED | PARTIAL / NOT VERIFIED | Auth provider: NOT VERIFIED | PARTIAL |
| Staff request (pending) | — | IMPLEMENTED | IMPLEMENTED | PARTIAL / NOT VERIFIED | PARTIAL / NOT VERIFIED | PARTIAL / NOT VERIFIED | PARTIAL / NOT VERIFIED | rules `staff` IMPLEMENTED | PARTIAL |
| Live approve/deny/revoke/remove reaction | — | IMPLEMENTED | IMPLEMENTED | PARTIAL / NOT VERIFIED | PARTIAL / NOT VERIFIED | PARTIAL / NOT VERIFIED | PARTIAL / NOT VERIFIED | `onSnapshot` staff/{uid} | PARTIAL |
| Live ban/unban reaction | — | IMPLEMENTED | IMPLEMENTED | PARTIAL / NOT VERIFIED | PARTIAL / NOT VERIFIED | PARTIAL / NOT VERIFIED | PARTIAL / NOT VERIFIED | rules `staffBanned` IMPLEMENTED | PARTIAL |
| Staff admin (approve, roles, ban UI) | — | IMPLEMENTED | — | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | — | — | rules IMPLEMENTED | PARTIAL |
| Portal separation / app identity | — | IMPLEMENTED | IMPLEMENTED | PARTIAL / NOT VERIFIED (`expo-application` חסר) | PARTIAL / NOT VERIFIED | PARTIAL / NOT VERIFIED | PARTIAL / NOT VERIFIED | — | PARTIAL |
| Booking / create order | IMPLEMENTED | NOT VERIFIED (לא נמצא create בפאנל OPS) | — | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | — | — | rules IMPLEMENTED | PARTIAL |
| Order list realtime | IMPLEMENTED (account) | IMPLEMENTED | IMPLEMENTED (assigned) | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | index IMPLEMENTED | PARTIAL |
| Order status updates | cancel only | IMPLEMENTED | IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | rules IMPLEMENTED | PARTIAL |
| Driver assignment | — | IMPLEMENTED | read-only | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | — | — | rules IMPLEMENTED | PARTIAL |
| Order photos | — | IMPLEMENTED | IMPLEMENTED (file input) | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | storage.rules IMPLEMENTED | PARTIAL |
| Tracking link + edit | IMPLEMENTED | — | — | — | — | — | — | rules `orderTracks` IMPLEMENTED | IMPLEMENTED (code) |
| Payments (save card, charge, refund) | IMPLEMENTED (save card) | IMPLEMENTED | NOT VERIFIED (on-spot panel בקוד המשותף `admin-orders-panel`) | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | Functions IMPLEMENTED (Stripe sandbox) | PARTIAL |
| Schedule / pickup availability | IMPLEMENTED (read) | IMPLEMENTED | NOT VERIFIED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | rules IMPLEMENTED | PARTIAL |
| Promos / pricing / catalog | IMPLEMENTED (apply/read) | IMPLEMENTED | — | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | — | — | rules IMPLEMENTED | PARTIAL |
| Contact messages | IMPLEMENTED (send) | IMPLEMENTED | — | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | — | — | rules IMPLEMENTED | PARTIAL |
| OPS alerts / unread | — | IMPLEMENTED (in-app) | — | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | — | — | client-side only | PARTIAL |
| Weekly automation / data retention | — | IMPLEMENTED (client-side) | — | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | — | — | אין backend job | PARTIAL |
| Push notifications | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED |
| GPS / location | — | — | NOT YET IMPLEMENTED | — | — | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED | NOT YET IMPLEMENTED |

`—` = לא רלוונטי ללקוח הזה. כל תא `IMPLEMENTED` ב-Web הוא ברמת קוד; ריצה `NOT VERIFIED`.

## 21. Known Gaps

1. Native OPS/Driver הם shells של אימות בלבד — אין הזמנות, תמונות, תשלומים, schedule, GPS, ניהול צוות.
2. `expo-application` מיובא ב-`app-identity.ts` ולא מוגדר כתלות.
3. EAS לא אותחל (`projectId: replace-after-eas-init`).
4. Web לא משתמש ב-`@foam/staff-core`; לוגיקת staff משוכפלת (Web + 2 עותקי Native).
5. `packages/foam-staff-core/README.md` מתאר stub — מיושן.
6. אין push notifications ואין backend triggers/scheduled jobs; אוטומציה שבועית ו-retention תלויים בפתיחת OPS Web.
7. iOS Capacitor: אי-התאמת bundle ID (`app.foam.laundry` מול `app.foam.ops`), ואין iOS Capacitor ל-Driver.
8. אין רשומות אימות ריצה ל-Android/iOS בריפו.

## 22. Known Risks / Environment Notes

- **שתי תיקיות פרויקט במחשב:** התיקייה שנבדקה כאן היא `C:\Users\iaaoa\OneDrive\שולחן העבודה\FOAM`. קיימת גם `C:\FOAM`, שמסמכים קודמים ו-scripts (`cap:android*`) מתייחסים אליה. לא בוצעה השוואה. אסור למזג, להעתיק, למחוק או לסנכרן ביניהן. לפני כל עבודה יש לוודא עם המשתמש איזו תיקייה קנונית.
- התיקייה הנבדקת נמצאת תחת OneDrive — סנכרון ענן של `node_modules`, `.git` ו-builds עלול לגרום לנעילות קבצים ולאיטיות.
- אותם package IDs ב-Capacitor וב-Expo — התקנה של אחת מחליפה את השנייה במכשיר.
- Firebase app ID ב-Native: `firebase.ts` משתמש ב-config של web app (env) ל-JS Auth, ו-Google Sign-In native משתמש ב-`google-services.json`/plist בנפרד. שגיאת config תופיע כ-DEVELOPER_ERROR (code 10).
- `.env`, `.env.local`, `google-services.json`, `GoogleService-Info.plist` — לא נקראו ואין להעתיק מהם ערכים.

## 23. Verification Status

| תחום | אומת מקוד (2026-10-02) | ריצה/פריסה |
|---|---|---|
| מבנה ריפו, workspaces, configs | כן | — |
| Git branch/HEAD/status | כן (`git status`, `git log` קריאה בלבד) | GitHub חי: NOT VERIFIED |
| Customer/OPS/Driver Web | כן (נתיבים, listeners, mutations עיקריים) | NOT VERIFIED |
| Firestore/Storage rules | כן (מבנה וסעיפי staff/orders/storage) | rules שפורסמו: NOT VERIFIED |
| Cloud Functions | כן (exports) | פריסה: NOT VERIFIED |
| Native Driver/OPS | כן (כל קבצי `src/`, `app.json`, `eas.json`, `metro.config.js`) | Android: NOT VERIFIED · iOS: NOT VERIFIED |
| `@foam/staff-core` | כן | typecheck: NOT VERIFIED |
| Capacitor legacy | כן (configs, gradle ids, pbxproj, scripts) | NOT VERIFIED |
| Cursor rules (12) / skills (6) | כן | — |
| Metro 8081/8082 | מוסכמה בלבד; לא מקובע בקוד | NOT VERIFIED |
| lint / typecheck / build / tests | לא הורצו | NOT VERIFIED |

## 24. Rules Claude Must Follow

1. לפני עבודה: לקרוא את המסמך הזה, `AGENTS.md` (Web בלבד), ו-`.cursor/rules/` הרלוונטיים; לבדוק branch, commit ו-`git status`; לוודא איזו תיקייה קנונית.
2. לשמור על קבצים untracked ושינויים של המשתמש. אין reset/clean/force/commit/push בלי בקשה מפורשת.
3. Firebase: אין שינוי rules, indexes, Functions, Auth או deploy בלי אישור מפורש בשיחה הנוכחית. לא להחליש הרשאות כדי שפיצ'ר יעבוד.
4. כל פיצ'ר משותף: impact check על 7 הלקוחות + backend לפני מימוש; Android **וגם** iOS; parity התנהגותי מול Web; realtime כש-Web הוא realtime.
5. Native חדש רק ב-React Native + Expo. לא להרחיב Capacitor, לא WebView, לא לייבא UI של Next/DOM ל-RN. לשתף רק לוגיקה טהורה דרך `@foam/staff-core`.
6. לא לערבב זהות Driver/OPS: package, slug, portal, Metro ו-bundle נפרדים. portal נקבע ע"י ה-binary, לא ע"י role.
7. לא לשנות UI קיים אלא אם המשימה דורשת זאת. כללי עיצוב שיווקי חלים רק על דפי landing ב-Web. `/book` בלי draft persistence. בלי subtitles ב-Web UI.
8. לא לקרוא או להציג סודות (`.env*`, google-services, plist, keys).
9. לא לטעון "תוקן/נבדק/מסונכרן/production-ready" בלי אימות בפועל; אחרת `NOT VERIFIED`.
10. לעדכן מסמך זה אחרי כל שינוי ארכיטקטוני או שינוי סטטוס — תמציתי ועובדתי.

## 25. Next Development Priorities

הצעות סדר עדיפויות — כל אחת דורשת אישור לפני מימוש:

1. להכריע מהי תיקיית העבודה הקנונית (`OneDrive\...\FOAM` או `C:\FOAM`).
2. לתקן את תלות `expo-application` החסרה ב-Native (או להסיר את השימוש), ולהריץ typecheck לשתי האפליקציות.
3. לתעד אימות ריצה אמיתי של staff auth ב-Android וב-iOS (pending → approve → ban → unban → remove), לכל אפליקציה.
4. `eas init` לשתי האפליקציות (ב-`foam-eas-release`, רק בבקשה מפורשת).
5. פיצ'ר מוצר ראשון ב-Native: רשימת הזמנות realtime לנהג (`assignedDriverUid`) ועדכון סטטוס, ב-parity עם Driver Web, ב-Android ו-iOS.
6. להחליט אם Web יצרוך את `@foam/staff-core` כדי לבטל שכפול (שינוי Web — דורש אישור) ולעדכן את README של החבילה.
7. תכנון backend ל-notifications ולאוטומציות (במקום client-side ב-OPS Web) — דורש אישור Firebase.

## Current-State Audit Date

2026-10-02 — ביקורת קריאה-בלבד של `C:\Users\iaaoa\OneDrive\שולחן העבודה\FOAM`, branch `feat/desktop-image-transitions`, HEAD `f84ad173ba885e2cff58c553d049e815a6e74319`. הקובץ היחיד ששונה בביקורת הוא המסמך הזה.
