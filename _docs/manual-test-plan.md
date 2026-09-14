# Manual Test Plan

## 1. Catalog & Context
- **Product Search:** Ask "Apakah ada T-Shirt warna hitam?" -> Expect product card & "View product" button.
- **Page Context:** Open a product page and ask "Berapa harganya?" -> Expect price based on the active page without mentioning the product name.

## 2. Inventory
- **Out of stock:** Ask for an out-of-stock product -> Expect "Out of stock" badge on card, no "Add to Cart" button.
- **In stock:** Ask for quantity of an in-stock item -> Expect specific quantity in chat & "In stock (X)" badge.

## 3. Order Tracking
- **Valid Order:** Ask "Cek pesanan #123" -> Expect real-time Order Card from WooCommerce API.
- **Invalid Order:** Ask "Cek pesanan #9999" -> Expect polite error message and no Order Card.

## 4. FAQ
- **General Q&A:** Ask a synced FAQ (e.g., shipping time) -> Expect direct text answer based on FAQ chunk.

## 5. Escalation
- **Human Handoff:** Ask "Bicara dengan admin" -> Expect AI to render Escalation Card. Form submission triggers email simulation in backend logs.

## 6. Pre-Chat Form
- **Validation:** Try submitting without required fields -> Expect "This field is required" or "Invalid format" for bad emails/phones.
- **Auto-fill:** Submit pre-chat, then trigger escalation -> Expect escalation form to auto-fill name/email.
