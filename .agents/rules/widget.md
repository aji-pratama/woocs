---
trigger:
  path:
    - widget/**/*
---

# WooCS.ai — Widget Development Rules (React/Vite)

## 1. Project Structure
- All widget code lives in `./widget/`.
- Entry point: `widget/src/main.jsx` (or `main.tsx` if TypeScript).
- Built output: `dist/` — copied to `plugin/assets/woocs-widget.js` by `make wp-build`.
- Vite configured to output a UMD/IIFE bundle for WP enqueue compatibility.

## 2. Component Hierarchy
```
Widget
├── C-01  BubbleLauncher    (fixed position, bottom-right by default)
└── Panel (when open)
    ├── C-02  PanelHeader
    ├── C-03  MessageThread
    │   ├── BotBubble
    │   │   ├── C-05  ProductCard (conditional)
    │   │   ├── C-06  OrderStatusCard (conditional)
    │   │   └── C-07  EscalationBubble (conditional)
    │   ├── UserBubble
    │   └── C-08  TypingIndicator (conditional)
    ├── C-04  QuickRepliesBar
    ├── C-09  InputBar
    └── C-10  PanelFooter
```

## 3. Global Config
Widget reads config from `window.WooCS` injected by the WP plugin:
```js
window.WooCS = {
  store_id: "uuid",
  api_url: "https://backend.woocs.ai",
  store_name: "My Store"
}
```
Never make direct WooCommerce API calls from the widget.

## 4. API Communication
All calls go to the Django backend:
- `POST {api_url}/api/chat/` — send message, receive answer
- `GET {api_url}/api/order-status/` — order status lookup

Use `fetch` or `axios`. No API key in browser — widget endpoints are public.

## 5. State Machine
```
Bubble → [click] → Panel:Idle
Panel:Idle → [customer types] → Panel:Chatting
Panel:Chatting → [product match] → Panel:ProductResult
Panel:Chatting → [order number] → Panel:OrderStatus
Panel:Chatting → [low confidence / keyword] → Panel:Escalated
```

## 6. Component Rules
- C-07 EscalationBubble: amber background, not dismissible by scrolling, only one per session.
- C-08 TypingIndicator: show immediately on send, replace with "Still looking…" after 8s.
- C-09 InputBar: disabled while awaiting response to prevent double-send.
- Widget stores `session_id` in `sessionStorage` (UUID generated client-side).

## 7. Build Config
- Vite `build.lib` config for UMD format, entry `src/main.jsx`.
- `externals`: none — bundle everything for standalone injection.
- CSS: inlined or injected via JS to avoid theme conflicts.

## 8. Code Standards
- Functional components only. Use hooks (`useState`, `useEffect`, `useRef`).
- No class components.
- All variable, function, and component names in English.
- Keep bundle size minimal — no heavy UI libraries unless strictly necessary.
