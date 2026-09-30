# FOAM Ops — Lovable redesign brief (full product + new visual language)

Paste this into Lovable as the project brief. Goal: **rebuild the entire Ops / Admin UI from scratch** — same product, same brand colors, **completely different layout/look** from the current FOAM ops console and from prior Lovable/AI dashboards.

Live reference (behavior only, **not** visual direction): https://foam-laundry-app.web.app/ops  
Customer site brand context: Las Vegas laundry pickup/delivery — FOAM.

---

## 0) What you are building

**FOAM Ops** is an internal staff console for a laundry delivery company in Las Vegas.

Staff use it in the field and at the plant to:
1. Run today’s pickups and deliveries
2. See future scheduled pickups
3. Handle customer support messages from the public contact form

It is **not** a marketing site. It is a dense, fast operations tool. Design must feel premium, physical, and intentional — like a crafted logistics product — **not** a generic AI SaaS dashboard.

---

## 1) Brand colors — LOCKED (do not invent a new palette)

Use these FOAM platform colors. You may tint/shade for depth, glass, and 3D lighting, but **hue family stays FOAM**:

| Token | Hex | Use |
|---|---|---|
| Navy / brand ink | `#16324a` | Primary brand, dark rail, headlines |
| Sky / active | `#00a8d8` | Active states, accents, FOAM “bubble” energy |
| Primary action | `#0b8ec8` | Main CTAs |
| Primary hover | `#0876a8` | CTA hover |
| Soft sky wash | `#d9f0fa` | Soft highlights / selected fills |
| Page wash | `#f4f7fb` | App background base (may become layered 3D atmosphere) |
| Surface | `#eef3f8` | Recessed panels |
| Card | `#ffffff` | Raised surfaces |
| Ink | `#142033` | Body text |
| Muted | `#64748b` | Secondary text |
| Border | `#dbe4ee` | Hairlines (use sparingly; prefer depth over lines) |
| Danger | `#d94a3d` | Destructive / errors |
| Success | `#0f766e` | Done / success |

Wordmark: **FOAM** + small cyan square accent (brand mark). Do not replace with a generic laundry icon as the brand.

Typography: expressive, purposeful — **not** Inter / Roboto / Arial / system default stacks. Pair a strong display face with a clean workhorse for ops density.

---

## 2) Design mandate — look NOTHING like the current ops UI or typical AI UI

### Explicitly reject (anti-patterns)
- Purple / indigo SaaS gradients
- Warm cream + terracotta “AI brochure” look
- Newspaper / broadsheet dense columns
- Flat single-color backgrounds with generic card grids
- Rounded-full pill forests, glow neon, emoji iconography
- Overstuffed hero dashboards with stats strips
- Generic left sidebar + white cards that look like every Lovable/v0 admin template
- Soft pastel “bubble UI” that screams AI-generated
- The **current** FOAM ops look: thin dark rail + light list + soft flat cards + numbered “01” panels — **do not remix that**

### Required new direction
- **Spatial / volumetric UI**: layered planes, soft occlusion, light from a consistent direction, subtle parallax or depth on hover
- **3D presence** (tasteful): extruded buttons, beveled surfaces, soft contact shadows, “physical” controls for weight/scale (like instruments, not form fields), isometric or faux-3D accents for bags/route — not cartoonish
- **One clear composition per screen** — not a dashboard salad
- **Brand-first** in the shell (FOAM mark reads immediately)
- Atmosphere: Vegas morning light / clean water / chrome laundry plant — cool navy + cyan, with **depth and volume**, not flat cyan pills
- Motion: 2–3 intentional motions (panel rise, tab crossfade, CTA press) — not decorative noise
- Desktop-first ops console + excellent mobile (drivers in the field)

Think: **premium logistics cockpit** or **hardware-inspired control surface** for laundry routes — unique to FOAM.

---

## 3) Information architecture (3 main areas)

Left / primary navigation (or a reinvented shell — you choose the structure, but keep these three destinations):

1. **Orders** — today’s operational work
2. **Future** — upcoming scheduled pickups (not mixed into today’s list)
3. **Support** — customer messages from the website contact form

Account control: avatar initials → **menu** (email + Sign out). Avatar must **not** sign out on first click.

URL state should survive refresh conceptually:
- `?tab=orders|future|support`
- filters / selected order id optional

---

## 4) ORDERS — full feature inventory

### 4.1 List pane
- Title: Orders
- Search: name, phone, order #
- Filters (in this order) with counts:
  1. **Waiting** — pickups for **today** (Las Vegas timezone), status waiting / en route. Include overdue still waiting. Default tab.
  2. **In Progress** — at laundry (picked up / weighed / washing)
  3. **Ready** — out for delivery today (return to customer)
  4. **Done** — delivered or cancelled
  5. **All** — everything except Future-only scheduled waiting orders
- Each row shows: customer name, status badge, date + time slot, short order id, total if charged
- Selecting a row opens the detail / workspace

### 4.2 Order detail — shared header
Always available:
- Customer name, phone, address (+ unit), city/zip Las Vegas
- Pickup date + slot (`7am - 10am`, `10am - 1pm`, `1pm - 4pm`, `4pm - 7pm`)
- Services: laundry bags and/or dry cleaning
- Preferences / notes if present
- Actions: Call, WhatsApp, Maps
- Visual pipeline steps: **Pickup → At laundry → On delivery → Complete**

### 4.3 Stage A — Pickup (status `new`)
- Primary CTA: **I’m on the way** → moves to en route
- Secondary: Message customer (WhatsApp)
- Optional Back only before charge

### 4.4 Stage B — At the stop / en route (`confirmed`)
Workspace (one composition, clear hierarchy):

**Left — Scale**
- Weight in pounds (stepper ±0.1 lb)
- **One** scale photo only — after upload, hide Add; allow remove/replace
- Label clearly: Scale photo

**Right — Dry clean**
- Add opens a **modal catalog** (multi-select, stays open while adding)
- Selected items listed below with prices from FOAM dry-clean catalog
- Search inside catalog

**Billing summary (toned down, not a giant colorful block)**
- Laundry $/lb (standard ~$2.60 or weekly ~$2.35) × weight
- Dry clean line items sum
- Delivery fee $5
- Minimum order $50
- Tip / promo if present
- Final total
- Primary CTA: **Charge & continue** (saves total + moves to At laundry)
  - Note for designers: this is ops “charge recorded” — not necessarily Stripe in this UI
- Rules before charge: laundry requires weight > 0 **and** scale photo; dry-clean-only can charge without weight

**Nav on this stage:** Back + Continue/Charge only — no “Save & close”

### 4.5 Stage C — At laundry (`washing` etc.)
- Show charged total
- CTA to move to **On delivery** when ready to return bags today
- **Hard rule:** after charge, cannot go back to Pickup. Refunds = management only. UI should communicate lock calmly (not scary error theater)

### 4.6 Stage D — On delivery (`out_for_delivery`)
- Section title: **Drop-off photo**
- Helper: Photo of the delivered bags
- **One** photo; hide Add after upload
- CTA: **Confirm delivered**
- Back to At laundry allowed

### 4.7 Stage E — Complete
- Closed order view; read-only feel

---

## 5) FUTURE — full feature inventory

Separate destination from Orders.

- List of pickups with `pickup.date` **after today**, still waiting
- Sorted by date, then time slot
- Same order detail capabilities when opened (eventually becomes Waiting on that day)
- Empty state: future pickups appear here sorted by date/time
- No Waiting/Ready filters clutter — this tab *is* the future queue

---

## 6) SUPPORT — full feature inventory

Customer messages submitted from public `/contact` (guests allowed — no account required).

### List
- Search name / phone / message
- Filters: Open · Done · All
- Unread indication
- Row: name + topic

### Detail
Clear separation (no numbered “01 Message” junk):
1. Header: status Open/Done, name, timestamp, Call / WhatsApp / Email
2. **Customer** block: Name, Topic, Email, Phone
3. **Message** block: full message body
4. CTA: Mark done / Reopen

### Reply model (important product truth)
- There is **no in-app chat thread**
- Staff reply via Call / WhatsApp / Email using the customer’s contact info
- Customer does **not** see replies inside FOAM — only “message sent” on the website
- Keep UI honest about that (external reply actions, then Mark done)

---

## 7) Auth / shell

- Login for staff (email/password + Google)
- Only allowed admin emails
- After login: shell with FOAM brand + 3 sections + account menu
- Mobile: list/detail split (list full screen → detail full screen with Back)

---

## 8) Content & language

- UI strings in **English** (ops product language)
- Concise labels — avoid long helper subtitles under every header
- Status badges short: Waiting, En route, In progress, Out for delivery, Delivered, Cancelled, Open, Done

---

## 9) Screens Lovable must design (minimum set)

Desktop + mobile for each:

1. Login
2. Orders — Waiting list + empty
3. Orders — detail Pickup (`I’m on the way`)
4. Orders — detail At-stop workspace (weight + scale photo + dry-clean modal + charge)
5. Orders — At laundry (charged / locked)
6. Orders — On delivery (drop-off photo + confirm)
7. Future — list + detail
8. Support — list
9. Support — message detail
10. Account menu open from avatar
11. Dry-clean catalog modal

Also show one **delight moment**: e.g. subtle 3D FOAM bag / soft volume on the active pipeline step — branded, not clip-art.

---

## 10) Acceptance criteria for the redesign

- Someone can recognize FOAM by color/mark within 2 seconds
- Nobody confuses this with the old flat ops UI
- Nobody says “this looks like every AI admin template”
- Depth/volume is felt in the shell and primary controls
- All workflows above are visually accounted for (not drops of features)
- Field-usable on phone: big tap targets for Charge / Confirm / I’m on the way

---

## 11) Out of scope (do not invent)

- Building Stripe checkout inside ops
- In-app support chat / ticket replies stored in product
- Customer-facing marketing pages
- Changing business pricing rules listed above
- Renaming FOAM or inventing a second brand

---

## 12) One-sentence creative brief

**Design a volumetric navy-and-cyan FOAM logistics console for Las Vegas laundry routes — instrument-like controls, spatial depth, zero generic AI-dashboard clichés — covering Orders (today), Future pickups, and Support messages with the exact workflows above.**
