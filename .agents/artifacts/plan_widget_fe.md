# WooCS.ai — Widget Frontend Development Brief

> **For:** Frontend agent / developer
> **Backend status:** API endpoints ready
> **Stack:** React + Vite (already scaffolded in `widget/`)
> **Bundle target:** ~150KB gzipped, injected into WooCommerce storefronts via `wp_enqueue_script()`

---

## 1. What this widget is

A floating chat widget injected into every public page of a WooCommerce storefront. It allows customers to ask about products, check order status, and get support — all powered by a Django backend with RAG (Retrieval-Augmented Generation).

The widget communicates **exclusively** with `/api/widget/*` endpoints. It never calls WooCommerce directly. 

**State Persistence (Important):**
The widget must store its message history and `session_id` in `localStorage` or `sessionStorage`. This ensures that when a customer navigates between pages on the storefront, the chat history remains intact and the panel stays in the same state (open or closed).

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

## 3. API Endpoints & Response Rendering

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

**Response (Crucial for Component Rendering):**
The backend explicitly tells the frontend *which component* to render via the `response_type` field, and provides the structured data in `metadata`.

**A. Normal Text Response (`response_type: "text"`)**
```json
{
  "answer": "Yes, we do have it in stock!",
  "confidence": 0.87,
  "escalated": false,
  "escalation_reason": null,
  "session_id": "uuid",
  "response_type": "text",
  "metadata": null
}
```

**B. Product Card Response (`response_type: "product_card"`)**
```json
{
  "answer": "Here is what I found:",
  "confidence": 0.95,
  "escalated": false,
  "escalation_reason": null,
  "session_id": "uuid",
  "response_type": "product_card",
  "metadata": {
    "name": "Classic Hoodie",
    "price": "34.99",
    "stock_status": "instock",
    "stock_quantity": 5,
    "wc_url": "https://store.com/product/123/"
  }
}
```

**C. Order Status Response (`response_type: "order_card"`)**
```json
{
  "answer": "Here's the status for order #1234.",
  "confidence": 1.0,
  "escalated": false,
  "escalation_reason": null,
  "session_id": "uuid",
  "response_type": "order_card",
  "metadata": {
    "order_id": "1234",
    "status": "Processing your order",
    "items": ["Classic Hoodie ×1"],
    "total": "34.99"
  }
}
```

**D. Escalation Response (`response_type: "escalation"`)**
```json
{
  "answer": "I'm not sure about this. Want me to connect you with the team?",
  "confidence": 0.42,
  "escalated": true,
  "escalation_reason": "low_confidence",
  "session_id": "uuid",
  "response_type": "escalation",
  "metadata": null
}
```

---

## 4. Standalone Fullscreen Page (New Requirement)

In addition to the floating widget, the frontend should support a **standalone full-page chat interface**.
- Accessible via a dedicated route/parameter (e.g. `?woocs_fullscreen=1` or a specific React Router route if deployed separately).
- This view acts as a full-screen support portal where the chat takes up the entire browser window instead of a small floating panel.
- This is useful for merchants to link directly to support from their menus.
- Include a "Expand to Fullscreen" icon in the C-02 Panel Header of the floating widget.

---

## 5. Component Specifications

### Component Hierarchy

```
Widget
├── C-01  Bubble launcher
└── Panel (when open)
    ├── C-02  Panel header
    ├── C-03  Message thread
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

### Component States Summary

| Component | Default | Loading | Error | Empty |
|---|---|---|---|---|
| C-01 Bubble | Icon visible | — | — | — |
| C-03 Thread | Greeting message | — | — | Greeting only |
| C-04 Quick replies | 2–3 pills | — | — | Hidden |
| C-05 Product card | Full card | Skeleton | "Not found" inline | — |
| C-06 Order card | Full card | Skeleton | "Order not found" / "Unavailable" inline | — |
| C-07 Escalation | Amber bubble + 2 CTAs | — | — | — |
| C-08 Typing | Animated dots | — | "Taking too long" + retry at 15s | — |
| C-09 Input | Enabled | Disabled (awaiting) | Disabled | Send btn disabled |
| C-10 Footer | "Powered by WooCS.ai" | — | — | — |


### C-01 · Bubble Launcher
- Fixed position (default: bottom-right).
- Chat icon when collapsed, × icon when panel open.
- Z-index must be very high.

### C-02 · Panel Header
- Bot avatar and Name ("Store assistant").
- **Expand/Fullscreen toggle icon.**
- Close (×) button.

### C-03 · Message Thread
- Scrollable area, auto-scrolls to latest message.
- Dynamically renders components based on `response_type` (Text, ProductCard, OrderCard, Escalation).

### C-04 · Quick Replies Bar
- 2–3 pill buttons below the latest bot message.

### C-05 · Product Card (`metadata` driven)
- Renders product name, price, stock badge (In stock / Low stock / Out of stock).
- "View product" CTA opens `metadata.wc_url`.

### C-06 · Order Status Card (`metadata` driven)
- Renders order number, mapped status, items list, and total price.

### C-07 · Escalation Bubble (`response_type: "escalation"`)
- Visually distinct (amber/warning background).
- "Talk to someone" CTA (shows confirmation).
- "No thanks" CTA (dismisses).

### C-08 · Typing Indicator
- Animated dots while fetching API. If >8s show "Still looking...". If >15s timeout with retry button.

### C-09 · Input Bar
- Text input + Send button. Disabled while fetching API.

---

## 6. Styling & Design Aesthetics

**The design MUST be premium, modern, and trustworthy.**
1. **Framework:** You may use Vanilla CSS or TailwindCSS. If using Tailwind, ensure CSS is properly scoped/compiled into the final bundle so it doesn't conflict with the WordPress theme.
2. **Colors:** Use a modern primary accent color (e.g., `#6366f1` Indigo or `#0ea5e9` Sky). Backgrounds should be clean white `#ffffff` with subtle gray borders `#f3f4f6`.
3. **Typography:** Use a clean, modern sans-serif (e.g., Inter, Roboto, or system UI fonts).
4. **Shadows & Corners:** Use modern soft drop-shadows (`box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1)`) and rounded corners (`border-radius: 12px` or `16px`).
5. **Micro-animations:** Add smooth transitions for opening/closing the panel (`transform: translateY`), sending messages (slide up + fade in), and button hovers.

---

## 7. Error Handling

| Scenario | Widget behaviour |
|---|---|
| Django unreachable / 500 | Show inline message: *"Something went wrong. Please try again."* with Retry button |
| Response takes > 15s | Show *"Taking too long — try again."* with retry button |
| Order ID not found in WC | Handled by backend (returns `response_type: "text"` with error message) |

---

## 8. Build & Integration

### Development
```bash
cd widget
npm run dev          # Vite dev server on port 5173
```

### Production build
```bash
make wp-build        # Builds widget, copies to plugin/assets/woocs-widget.js
```

### Vite config notes
- Output format: UMD or IIFE (not ES modules — must work in any WP theme).
- CSS should be injected into the JS bundle (not a separate file).
- Entry point: `widget/src/main.jsx`.

---

## 9. ASCII Wireframes (From PRD)

### B1. Storefront — widget collapsed

```
┌─────────────────────────────────────────────────────────────┐
│  [store header]                                             │
│  [product grid]                                             │
│  [footer]                                            [💬]  │
└─────────────────────────────────────────────────────────────┘
                                                      ↑ C-01
```

### B2. Storefront — widget open, idle

```
│  [store header]                                             │
│  [product grid]        ┌────────────────────────────────┐  │
│                        │ C-02                        [×] │  │
│                        │ 🤖 Store assistant  ● Online    │  │
│                        │────────────────────────────────│  │
│                        │ C-03                           │  │
│                        │  Hi! I can help you find       │  │
│                        │  products, check stock,        │  │
│                        │  or track your order.          │  │
│                        │                                │  │
│                        │ C-04                           │  │
│                        │ [Check order][Returns][Browse] │  │
│                        │────────────────────────────────│  │
│                        │ C-09 [Ask anything...       ] >│  │
│                        │────────────────────────────────│  │
│                        │ C-10 Powered by WooCS.ai       │  │
│                        └────────────────────────────────┘  │
```

### B3. Storefront — product result (C-05)

```
│                        ┌────────────────────────────────┐  │
│                        │ 🤖 Store assistant          [×] │  │
│                        │────────────────────────────────│  │
│              [user] →  │  Do you have blue hoodie in M? │  │
│                        │                                │  │
│     [C-05 card] →      │  Yes! Here's what I found:     │  │
│                        │  ┌─────────────────────────┐   │  │
│                        │  │ [product image]          │   │  │
│                        │  │ Classic Hoodie           │   │  │
│                        │  │ Navy Blue · Size M       │   │  │
│                        │  │ $34.99      In stock (5) │   │  │
│                        │  │ [View product]           │   │  │
│                        │  └─────────────────────────┘   │  │
│                        │ [Other sizes] [View product]    │  │
│                        │ [Ask anything...            ] > │  │
│                        └────────────────────────────────┘  │
```

### B4. Storefront — escalation bubble (C-07)

```
│                        ┌────────────────────────────────┐  │
│                        │ 🤖 Store assistant          [×] │  │
│                        │────────────────────────────────│  │
│              [user] →  │  I got a damaged item + refund │  │
│                        │                                │  │
│     [C-07] →           │ ┌── amber ─────────────────┐   │  │
│                        │ │ ⚠ I'm not sure about this │   │  │
│                        │ │ Want me to connect you    │   │  │
│                        │ │ with the team?            │   │  │
│                        │ │ [Talk to someone][No thx] │   │  │
│                        │ └───────────────────────────┘   │  │
│                        │ [Continue chatting...       ] > │  │
│                        └────────────────────────────────┘  │
```

### B5. Storefront — order status card (C-06)

```
│                        ┌────────────────────────────────┐  │
│                        │ 🤖 Store assistant          [×] │  │
│                        │────────────────────────────────│  │
│              [user] →  │  Where is my order #4821?      │  │
│                        │                                │  │
│     [C-06 card] →      │  Order #4821                   │  │
│                        │  ─────────────────────────     │  │
│                        │  Status:  Processing           │  │
│                        │  Items:   Hoodie ×1            │  │
│                        │           Slim Jeans ×1        │  │
│                        │  Total:   $89.98               │  │
│                        │                                │  │
│                        │ [Track again] [Need help?]     │  │
│                        │ [Ask anything...           ] > │  │
│                        └────────────────────────────────┘  │
```

### B6. Storefront — typing indicator timeout (C-08)

```
│                        ┌────────────────────────────────┐  │
│                        │ 🤖 Store assistant          [×] │  │
│                        │────────────────────────────────│  │
│              [user] →  │  What fabrics do you use?      │  │
│                        │                                │  │
│  0–8s: C-08 dots →     │  ● ● ●                         │  │
│                        │        (animated)              │  │
│  8–15s: text →         │  Still looking…                │  │
│                        │                                │  │
│  15s+: timeout →       │  Taking too long — try again.  │  │
│                        │  [Retry]                       │  │
│                        │ [Ask anything...           ] > │  │
│                        └────────────────────────────────┘  │
```

