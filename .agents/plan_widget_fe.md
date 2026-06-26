# WooCS.ai — Widget Frontend Development Brief

> **For:** Frontend agent / developer
> **Backend status:** API endpoints ready (or being built in parallel)
> **Stack:** React + Vite (already scaffolded in `widget/`)
> **Bundle target:** ~150KB gzipped, injected into WooCommerce storefronts via `wp_enqueue_script()`

---

## 1. What this widget is

A floating chat widget injected into every public page of a WooCommerce storefront. It allows customers to ask about products, check order status, and get support — all powered by a Django backend with RAG (Retrieval-Augmented Generation).

The widget communicates **exclusively** with `/api/widget/*` endpoints. It never calls WooCommerce directly. It stores `session_id` in `sessionStorage` (survives page navigation within a tab, clears on tab close).

---

## 2. Configuration

The WP plugin injects a global JS object into the page before the widget bundle loads:

```js
window.WooCS = {
  store_id: "uuid-of-the-store",
  api_url: "https://api.woocs.ai",  // Django base URL
  store_name: "Sunrise Apparel"
}
```

The widget reads this on mount. If `window.WooCS` is undefined, the widget should not render.

---

## 3. API Endpoints

### `POST /api/widget/chat/`
**No auth required** — identified by `store_id` in body.

**Request:**
```json
{
  "store_id": "uuid",
  "session_id": "uuid",
  "message": "Do you have blue hoodie in size M?"
}
```

**Response:**
```json
{
  "answer": "Yes! We have the Classic Hoodie in Navy Blue, Size M...",
  "confidence": 0.87,
  "escalated": false,
  "escalation_reason": null,
  "session_id": "uuid"
}
```

**Escalation response (keyword or low confidence):**
```json
{
  "answer": null,
  "confidence": 0.42,
  "escalated": true,
  "escalation_reason": "low_confidence",
  "session_id": "uuid"
}
```

### `GET /api/widget/order-status/?store_id=uuid&order_id=4821`
**No auth required.**

**Response:**
```json
{
  "order_id": "4821",
  "status": "Processing your order",
  "items": ["Classic Hoodie ×1", "Slim Jeans ×1"],
  "total": "89.98",
  "found": true
}
```

**Not found:**
```json
{
  "order_id": "9999",
  "found": false,
  "error": "I couldn't find order #9999. Please check your order number."
}
```

---

## 4. State Machine

```
[Bubble — C-01]
    ↓ click
[Panel: Idle]
    ↓ customer sends message
[Panel: Chatting — C-08 typing indicator visible]
    ↓ response received
    ├── product query matched     → [Panel: C-05 Product card visible in thread]
    ├── order number detected     → [Panel: C-06 Order status card visible in thread]
    ├── confidence >= 0.65        → [Panel: Bot answer bubble in thread]
    └── confidence < 0.65 or keyword → [Panel: C-07 Escalation bubble visible in thread]
[Panel: any state]
    ↓ click × or bubble
[Bubble — C-01]
```

---

## 5. Component Hierarchy

```
Widget
├── C-01  Bubble launcher
└── Panel (when open)
    ├── C-02  Panel header
    ├── C-03  Message thread (scrollable)
    │   ├── Bot message bubble
    │   │   ├── C-05  Product card (if product query matched)
    │   │   ├── C-06  Order status card (if order intent detected)
    │   │   └── C-07  Escalation bubble (if low confidence or keyword)
    │   ├── User message bubble
    │   └── C-08  Typing indicator (while awaiting response)
    ├── C-04  Quick replies bar (after each bot message)
    ├── C-09  Input bar
    └── C-10  Panel footer
```

---

## 6. Component Specifications

### C-01 · Bubble Launcher
- Fixed position (default: bottom-right, configurable bottom-left)
- Chat icon when collapsed, × icon when panel open
- Click toggles panel open/closed
- Z-index must be very high to sit above storefront content

### C-02 · Panel Header
- Bot avatar (default: robot icon)
- Bot name: "Store assistant" (hardcoded for PoC)
- Online status dot (always green in PoC)
- Close (×) button → collapses panel to bubble

### C-03 · Message Thread
- Scrollable area, auto-scrolls to latest message
- Bot messages: left-aligned, light background
- User messages: right-aligned, brand/accent color
- Opening state: one greeting message: *"Hi! I can help you find products, check stock, or track your order."*

### C-04 · Quick Replies Bar
- 2–3 pill buttons below the latest bot message
- Tapping a pill sends it as a user message
- Disappears when customer starts typing

| Context | Pills shown |
|---|---|
| Idle / after greeting | Check my order · Return policy · Browse products |
| After product answer | Other sizes · View product |
| After order status | Track again · Need help? |
| After escalation dismissed | Ask another question |
| After out-of-scope decline | Try a different question |

### C-05 · Product Card (inline in bot bubble)
- Product name
- Matched variation attributes (e.g. Size: M · Color: Navy Blue)
- Price (never shown as $0; omit if missing)
- Stock status badge:
  - In stock → green badge
  - Low stock (n left) → amber badge with count
  - Out of stock → red badge. Bot appends: *"I can suggest a similar item if you'd like."*
- "View product" CTA → opens WC product page in same tab
- One card per bot message in PoC

### C-06 · Order Status Card (inline in bot bubble)
- Order number
- Status mapped from WC status:

| WC status | Customer-facing label |
|---|---|
| pending | Payment pending |
| processing | Processing your order |
| on-hold | On hold |
| completed | Delivered |
| cancelled | Cancelled |
| refunded | Refunded |
| failed | Payment failed |

- Line item names (no SKUs)
- Order total
- No shipping address shown (privacy)

### C-07 · Escalation Bubble
- Visually distinct — amber/warning background
- Fixed message (not AI-generated): *"I'm not sure about this. Want me to connect you with the team?"*
- Two CTAs:
  - **"Talk to someone"** → records escalation, shows confirmation: *"Got it! The team will reach out to you shortly."*
  - **"No thanks"** → dismisses, chat continues. Subsequent low-confidence turns show softer inline fallback: *"I'm not sure — try rephrasing or ask something else."* (no second escalation bubble per session)
- Customer must choose a CTA — not skippable
- Maximum one escalation bubble per session

### C-08 · Typing Indicator
- 0–8s: three animated dots
- 8s+: *"Still looking…"* text
- 15s+: *"Taking too long — try again."* with a retry button that re-sends the last message

### C-09 · Input Bar
- Text input + send button (arrow icon)
- Send button disabled when input is empty or awaiting response
- Input field disabled while awaiting response (prevents double-send)
- Enter key submits. Multiline not supported in PoC

| Context | Placeholder |
|---|---|
| Idle | Ask anything about our store… |
| After product answer | Want to know about other products? |
| After order status | Any other questions? |
| Escalation bubble visible | Continue chatting… |

### C-10 · Panel Footer
- Text: "Powered by WooCS.ai" → link to woocs.ai (new tab)

---

## 7. Error Handling

| Scenario | Widget behaviour |
|---|---|
| Django unreachable (network error) | Show inline message: *"Something went wrong. Please try again."* with Retry button |
| `/api/widget/chat/` returns 500 | Same as above |
| Response takes > 8s | C-08 shows *"Still looking…"* at 8s mark |
| Response takes > 15s | Show *"Taking too long — try again."* with retry button |
| Order ID not found in WC | Bot message: *"I couldn't find order #\{id\}. Please check your order number."* |
| WC REST API unreachable | Bot message: *"I can't check orders right now. Please try again in a moment."* — no escalation |

---

## 8. Design Guidelines

- **Colours:** Use a modern, professional palette. The bubble and user messages should use a primary accent colour (e.g. `#6366f1` indigo or similar). Bot messages should be neutral/light.
- **Typography:** Use Inter or similar modern sans-serif from Google Fonts.
- **Animations:** Smooth open/close transitions for the panel. Subtle message appear animations. Typing dots animation.
- **Responsive:** Widget should work on both desktop and mobile. On mobile (< 640px), the panel should be full-screen overlay.
- **Shadow DOM:** Not required for PoC, but keep CSS scoped (CSS modules or similar) to avoid conflicts with storefront themes.
- **Dark mode:** Not required for PoC.

---

## 9. Build & Integration

### Development
```bash
cd widget
npm run dev          # Vite dev server on port 5173
```

For local testing, create an `index.html` that sets `window.WooCS` and loads the widget.

### Production build
```bash
make wp-build        # Builds widget, copies to plugin/assets/woocs-widget.js
```

The WP plugin loads the built JS from `plugin/assets/woocs-widget.js` via `wp_enqueue_script()`. The widget must be a single self-contained JS file (UMD or IIFE) with CSS inlined or bundled.

### Vite config notes
- Output format: UMD or IIFE (not ES modules — must work in any WP theme)
- Library name: `WooCSWidget`
- CSS should be injected into the JS bundle (not a separate file)
- Entry point: `widget/src/main.jsx`

---

## 10. Existing Project Structure

```
widget/
├── public/
├── src/
│   ├── main.jsx        ← Entry point
│   ├── App.jsx
│   └── ...
├── index.html
├── package.json
├── vite.config.js
└── ...
```

---

## 11. ASCII Wireframes (from PRD)

### Widget collapsed (C-01 bubble)
```
│  [store page content]                                    │
│  [footer]                                         [💬]  │
```

### Widget open, idle
```
                       ┌────────────────────────────────┐
                       │ 🤖 Store assistant  ● Online [×]│
                       │────────────────────────────────│
                       │  Hi! I can help you find       │
                       │  products, check stock,        │
                       │  or track your order.          │
                       │                                │
                       │ [Check order][Returns][Browse] │
                       │────────────────────────────────│
                       │ [Ask anything...            ] >│
                       │────────────────────────────────│
                       │ Powered by WooCS.ai            │
                       └────────────────────────────────┘
```

### Product card result (C-05)
```
              [user] →  │  Do you have blue hoodie in M? │
                        │                                │
     [C-05 card] →      │  Yes! Here's what I found:     │
                        │  ┌─────────────────────────┐   │
                        │  │ Classic Hoodie           │   │
                        │  │ Navy Blue · Size M       │   │
                        │  │ $34.99      In stock (5) │   │
                        │  │ [View product]           │   │
                        │  └─────────────────────────┘   │
```

### Escalation bubble (C-07)
```
              [user] →  │  I got a damaged item + refund │
                        │                                │
     [C-07] →           │ ┌── amber ─────────────────┐   │
                        │ │ ⚠ I'm not sure about this │   │
                        │ │ Want me to connect you    │   │
                        │ │ with the team?            │   │
                        │ │ [Talk to someone][No thx] │   │
                        │ └───────────────────────────┘   │
```

### Order status card (C-06)
```
              [user] →  │  Where is my order #4821?      │
                        │                                │
     [C-06 card] →      │  Order #4821                   │
                        │  ─────────────────────────     │
                        │  Status:  Processing           │
                        │  Items:   Hoodie ×1            │
                        │           Slim Jeans ×1        │
                        │  Total:   $89.98               │
```
