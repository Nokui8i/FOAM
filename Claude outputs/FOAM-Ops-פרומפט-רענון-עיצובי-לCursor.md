# FOAM Ops — Prompt מוכן להדבקה ב-Cursor (רענון עיצובי + כמה שיפורי UX)

מבוסס על המוקאפ שפורסם ב-Design Canvas: https://claude.ai/artifact/2aDnLFn849tS8z9pFDQSgQ (דסקטופ 1440×900 + מובייל 390×844).

**גישה מכוונת:** לא כתבתי מחדש קבצים שלמים. קראתי את הקוד האמיתי שלך (`admin-app.tsx`, `admin-orders-panel.tsx`, `globals.css`, `layout.tsx`) וגיליתי שהוא **כבר** מיושם ברמה גבוהה — יש כבר nav rail אמיתי, list+detail pane, stage cards, Issue & cancellation card, קטלוג dry-clean עם חיפוש, וכל הלוגיקה מול Firestore עובדת. חשוב מכך: כל הצבעים/פונטים באזור ה-ops כבר עוברים דרך בלוק אחד של CSS custom properties (`--ops-*`) שמוגדר בתוך `.admin-page` בלבד — כלומר אפשר "להלביש" את כל הפלטה/הטיפוגרפיה החדשה בלי לגעת בלוגיקה ובלי סיכון לשאר האתר.

לכן הפרומפט למטה הוא **רענון עיצובי ממוקד + 3 שיפורי UX ספציפיים** (לא תבנית JSX חדשה):
1. פלטת צבעים + טיפוגרפיה חדשה (Ink/Paper/Suds/Citrus/Bleach/Leaf) — דרך בלוק `--ops-*` אחד.
2. תוויות טקסט גלויות לכפתורי Call/WhatsApp/Maps (כרגע רק אייקון).
3. ניסוח ברור יותר לכפתור "Charge & mark collected" (מבלבל — אין כאן סליקת אשראי בפועל).
4. שני שיפורי מובייל: בר פעולה ראשי דביק בתחתית המסך (thumb-reachable), וכרטיס "Issue & cancellation" מוסתר כברירת מחדל מאחורי קישור "Report an issue" — כדי לא להעמיס בזמן עבודה בשטח.

**⚠️ לפני שמתחילים:** תני ל-Cursor לקרוא את הקבצים האמיתיים במחשב שלך קודם (לא להדביק עיוור) — הקוד עשוי להשתנות מעט מאז שקראתי אותו.

---

## PROMPT — הדביקי את כל מה שבין הקווים ל-Cursor

```
Read these files first before changing anything: app/globals.css, app/layout.tsx,
components/admin-app.tsx, components/admin-orders-panel.tsx.

I want a visual refresh of the /ops admin console only (do not touch any other
page or the site's global colors/fonts) plus a few targeted UX fixes. All ops
colors and fonts already flow through one CSS custom-property block defined on
`.admin-page` in app/globals.css (search for "FOAM Ops console (hub UI)" — the
block starts with `--ops-bg:` and includes `--ops-nav`, `--ops-primary`,
`--ops-font`, `--ops-display`, etc.). Redefine that block's VALUES only — do not
rename any variable, since dozens of rules already reference these names via
color-mix() and var().

## 1. New color tokens (replace the values inside the existing `.admin-page { ... }` block)

--ops-bg: #F3F5F4;
--ops-surface: #F7F8F8;
--ops-ink: #12212E;
--ops-muted: #5B6B70;
--ops-border: #D9E0DE;
--ops-accent: #DEEFF0;              /* light teal tint, used for chip/badge backgrounds */
--ops-primary: #0E7C86;             /* main action color — "Suds" teal */
--ops-primary-hover: #0B6169;
--ops-danger: #C1503F;              /* "Bleach" terracotta-red */
--ops-success: #4C8B6B;             /* "Leaf" green */
--ops-card: #ffffff;
--ops-nav: #12212E;                 /* "Ink" — nav rail background */
--ops-nav-fg: #ffffff;
--ops-nav-muted: #9FB3BA;
--ops-nav-active: #1C3644;
--ops-shadow: none;
--ops-radius: 0.9rem;

Add two new tokens to the same block (new names, additive, nothing references
them yet so this is safe):
--ops-warning: #E8A33D;             /* "Citrus" — used for the "new/waiting" status pill and action-needed badges */
--ops-info: #7B6CA8;                /* "Dusk" purple — used for the out-for-delivery status pill */

Then fix a pre-existing color collision: `.ops-status-pill.is-new` currently
reuses `--ops-danger` (the exact same red as `.is-cancelled` — a new order and
a cancelled order render in the same color). Give `.is-new` its own rule using
`--ops-warning` instead:

.ops-status-pill.is-new {
  background: color-mix(in srgb, var(--ops-warning) 16%, transparent);
  border-color: transparent;
  color: color-mix(in srgb, var(--ops-warning) 78%, var(--ops-ink));
}

Also update `.ops-status-pill.is-en-route` to use `--ops-primary` explicitly
instead of the `var(--ops-accent, #0ea5e9)` fallback pattern, and (optional,
only if an "out for delivery" status pill class exists — search for it) give
it `--ops-info` so the four pipeline stages are visually distinct: waiting =
citrus, en route/washing = teal, out for delivery = purple, delivered = green,
cancelled = terracotta.

## 2. New typography

Install two new self-hosted font packages the same way the existing ones are
installed (@fontsource), matching the weights actually used below:

npm install @fontsource/archivo @fontsource/public-sans

In app/layout.tsx, add these imports next to the existing @fontsource imports
(do not remove the existing DM Sans / Manrope / Figtree imports — those still
serve the rest of the site):

import "@fontsource/archivo/600.css";
import "@fontsource/archivo/700.css";
import "@fontsource/archivo/800.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/500.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";

Back in the `.admin-page { ... }` block in globals.css, change these two lines:

--ops-font: "Public Sans", var(--font-sans);
--ops-display: "Archivo", var(--font-display);

(Keep the var(--font-sans)/var(--font-display) fallback so nothing breaks if a
font fails to load. This only affects the /ops console — --ops-font/--ops-display
are scoped to .admin-page and don't touch the rest of the site's DM Sans/Manrope.)

## 3. Labeled quick-action buttons (Call / WhatsApp / Maps)

In components/admin-orders-panel.tsx, find the three `<a className="ops-icon-btn" ...>`
elements inside the `ops-icon-row` (Call / WhatsApp / Maps, each currently icon-only
with only an aria-label — no visible text). Add a visible label next to each icon:

<a className="ops-icon-btn" href={`tel:${selected.contact.phone}`} aria-label="Call">
  <Phone size={16} />
  <span>Call</span>
</a>
<a className="ops-icon-btn" href={waUrl(selected.contact.phone, customerMsg)} target="_blank" rel="noreferrer" aria-label="WhatsApp">
  <MessageCircle size={16} />
  <span>WhatsApp</span>
</a>
<a className="ops-icon-btn" href={mapsUrl(selected)} target="_blank" rel="noreferrer" aria-label="Maps">
  <MapPin size={16} />
  <span>Maps</span>
</a>

(Shrink the icon size from 18 to 16 to make room for the label.) Then update
the `.ops-icon-btn` rule in globals.css — it's currently a fixed 2.35rem square
(`display:grid; place-items:center; width:2.35rem; height:2.35rem`). Change it
to a flexible pill that fits a label:

.ops-icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 2.35rem;
  padding: 0 0.75rem;
  border-radius: var(--ops-radius);
  border: 1px solid var(--ops-border);
  background: var(--ops-card);
  color: var(--ops-ink);
  font-size: 0.8rem;
  font-weight: 700;
  /* keep any existing hover/transition rules below this */
}

Keep the row itself (`ops-icon-row`) as `display:flex; gap` — it already wraps
correctly.

## 4. Clearer billing-action copy

In components/admin-orders-panel.tsx, find the button with className
"ops-billing-save" whose text is "Charge & mark collected". This button does
NOT charge a credit card — there is no Stripe/payment integration wired up —
it only saves the computed total on the order and moves it to "washing". Its
label is misleading for new staff. Change the button text to:

Save total & send to Washing

(Leave the onClick/saveBilling() logic exactly as is — copy-only change.)

## 5. Mobile: sticky bottom primary-action bar

Goal: on phone width, whatever the single primary next-step button is for the
selected order's current stage (Left for pickup / Save total & send to Washing
/ Send out for delivery / Mark delivered) should stay pinned to the bottom of
the screen, always reachable with a thumb, instead of requiring a scroll to
find it.

Wrap the primary CTA button in each of the four stage branches inside
`.ops-detail-main` with a shared wrapper class `ops-sticky-cta` (currently
three of them already use `<div className="ops-action-row">` — rename that
wrapper's className to "ops-action-row ops-sticky-cta" in those three spots;
for the billing/confirmed branch, wrap just the "Save total & send to Washing"
button — the one with className "ops-billing-save" — in a new
`<div className="ops-sticky-cta">` instead of leaving it bare inside
`.ops-billing-card`).

Add this CSS to globals.css, near the other `.ops-detail-main` / mobile rules:

@media (max-width: 767px) {
  .ops-sticky-cta {
    position: sticky;
    bottom: 0;
    z-index: 5;
    margin: 0.75rem -1rem -1rem;
    padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
    background: var(--ops-card);
    border-top: 1px solid var(--ops-border);
    box-shadow: 0 -8px 20px -12px rgb(0 0 0 / 0.12);
  }
  .ops-sticky-cta .ops-btn-lg,
  .ops-sticky-cta .ops-billing-save {
    width: 100%;
    height: 3.1rem;
    font-size: 0.95rem;
  }
}

(This uses `position: sticky` inside `.ops-detail-main`, which is already its
own scroll container with `overflow-y: auto` — so the bar docks to the bottom
of that scrolling area without needing position:fixed or extra z-index/safe-area
plumbing against the rest of the page. On desktop (min-width 768px) this rule
does nothing, so the stage cards look exactly as they do today.)

## 6. Mobile: collapse "Issue & cancellation" behind a toggle

Goal: on phone width, hide the "Issue & cancellation" card by default (it's a
secondary, occasional-use action, not something a driver needs on every order)
and show a small "Report an issue" link instead. Tapping it reveals the card.
On desktop, behavior is unchanged — always visible, as today.

In components/admin-orders-panel.tsx:
- Add one new state near the other UI-only state (query, showCancelForm, etc.):
  `const [showIssueCard, setShowIssueCard] = useState(false);`
- Reset it in the existing `useEffect` that resets `showCancelForm`/`cancelReasonDraft`
  when `selected?.id` changes, so it collapses again when switching orders:
  add `setShowIssueCard(false);` there.
- Just before the `<section className="ops-card ops-aside-card ops-issue-card">`
  element, add a toggle button that's mobile-only:

  <button
    type="button"
    className="ops-issue-toggle"
    onClick={() => setShowIssueCard((v) => !v)}
  >
    <AlertTriangle size={13} aria-hidden />
    {showIssueCard ? "Hide issue & cancellation" : "Report an issue or cancel order"}
  </button>

- Give the `<section className="ops-card ops-aside-card ops-issue-card">` a
  conditional class: `className={cn("ops-card ops-aside-card ops-issue-card", !showIssueCard && "is-collapsed-mobile")}`

Add this CSS:

.ops-issue-toggle {
  display: none;
}
@media (max-width: 767px) {
  .ops-issue-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: 100%;
    height: 2.4rem;
    border: 1px dashed var(--ops-border);
    border-radius: var(--ops-radius);
    background: transparent;
    color: var(--ops-muted);
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }
  .ops-issue-card.is-collapsed-mobile {
    display: none;
  }
}

(AlertTriangle is already imported from lucide-react in this file for the
existing PanelTitleFixed icon on the same card — no new import needed.)

## 7. After the changes

Run the project's normal typecheck/lint/build (npm run build, or whatever this
repo's standard is) and fix anything that breaks. Do not touch firestore.rules,
storage.rules, the admin email allowlist, or any page/component outside
components/admin-app.tsx, components/admin-orders-panel.tsx, app/globals.css,
and app/layout.tsx.
```

---

## מה נשאר בדוק/לא כלול (במתכוון)

- **מבנה ה-nav rail וה-list/detail panes** — לא שיניתי, כי הם כבר תואמים במדויק למה שביקשת במוקאפ (סיידבר, רשימה עם חיפוש/פילטרים, כרטיס פרטים מרוכז). הפרומפט נוגע רק בצבע/פונט/כמה תוויות.
- **פונט מונוספייס למספרים** (IBM Plex Mono, כמו במוקאפ עבור ref/משקל/סכום) — השארתי בחוץ כי זה שינוי ויזואלי קטן יותר עם סיכון נמוך יותר לפספס משהו; אם תרצי, תגידי ותוסיף שלב נוסף.
- **הפאנל של פניות (`admin-contacts-panel.tsx`)** — לא נגעתי, כי לא ביקשת רידיזיין לו וזה מחוץ למוקאפ שבנינו.

זה פרומפט אחד להדבקה מלאה — Cursor אמור לבצע את כל 6 השלבים ברצף על הקוד האמיתי.
