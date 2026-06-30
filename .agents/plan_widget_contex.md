# Execution Plan — Widget Page Context Awareness

**Goal:** Widget becomes aware of which product page the customer is viewing, and prioritizes that product in chat responses.

**Status:** Not started
**Depends on:** Existing chat schema (`ChatRequestIn`, `ChatResponseOut`), existing widget, existing plugin

---

## Why this matters

Currently the widget treats every page the same — a customer on the Classic Hoodie product page and a customer on the homepage get identical behavior. This means ambiguous questions like "is this in stock?" or "do you have this in M?" cannot be resolved without the customer explicitly naming the product.

This plan makes the widget context-aware: it knows what product is currently being viewed and passes that to Django so retrieval and prompt construction can prioritize it.

---

## Scope

**In scope:**
- Plugin detects WooCommerce single product page and exposes product context to the widget
- Plugin settings page gets a toggle to enable/disable this feature
- Widget reads page context and sends it with every chat request
- Widget greeting message changes when on a product page
- Schema updated: `PageContextIn` added to `ChatRequestIn`
- Django chat view: direct product lookup takes priority over similarity search when `product_id` present
- Prompt template updated with a "customer is currently viewing" section
- `context_used` field added to response for debugging
- A4 Widget preview page: debug overlay shows which context path was used

**Out of scope (post-PoC):**
- Category page context
- Cart page context
- Variation-level context (selected size/color before opening chat)
- SPA-style page navigation detection (assumes full page reload between products, which is WooCommerce default behavior)

---

## Part 1 — Backend: schema and chat logic

### 1.1 Update Pydantic schemas

File: wherever `ChatRequestIn` / `ChatResponseOut` currently live (likely `chat/schemas.py`).

Add `PageContextIn` model. Add optional `page_context` field to `ChatRequestIn`. Add optional `context_used` field to `ChatResponseOut`.

```python
class PageContextIn(BaseModel):
    type: str = "general"  # general | product
    product_id: Optional[int] = None
    product_name: Optional[str] = None


class ChatRequestIn(BaseModel):
    store_id: UUID
    session_id: UUID
    message: str
    page_context: Optional[PageContextIn] = None


class ChatResponseOut(BaseModel):
    answer: Optional[str] = None
    confidence: Optional[float] = None
    escalated: bool = False
    escalation_reason: Optional[str] = None
    session_id: UUID
    response_type: str = "text"
    metadata: Optional[dict[str, Any]] = None
    context_used: Optional[str] = None  # "page_context" | "retrieval" | "order_lookup" | "keyword_trigger"
```

No changes needed to `ChatMessageOut`, `ChatHistoryResponseOut`, `OrderStatusRequestIn`, `OrderStatusResponseOut`.

- [x] Add `PageContextIn` model
- [x] Add `page_context` field to `ChatRequestIn`
- [x] Add `context_used` field to `ChatResponseOut`
- [x] Confirm backward compatibility — requests without `page_context` must still work (defaults to `None`, treated as general)

---

### 1.2 Update chat view logic

File: wherever the chat endpoint view/handler lives (likely `chat/views.py` or `chat/api.py`).

Before running keyword check and similarity search, check for `page_context.product_id`:

```python
primary_product = None
if request.page_context and request.page_context.product_id:
    primary_product = Product.objects.filter(
        store=store,
        wc_id=request.page_context.product_id
    ).first()
```

If `primary_product` is found via direct lookup (not vector search), it becomes the primary context block in the prompt. Similarity search (`retrieved_chunks`) still runs as normal — this handles questions that drift away from the current product (e.g. "do you have other colors of jackets?" while viewing a hoodie).

Logic flow:

1. Keyword check (refund, damage, etc.) — runs first, unchanged. Bypasses everything else.
2. If `page_context.product_id` present → direct `Product` lookup by `wc_id` scoped to `store`.
3. If lookup succeeds → set `context_used = "page_context"`, build primary context block.
4. If lookup fails (product not synced yet, ID mismatch) → fall back to `product_name` from `page_context` as plain text hint, or fall back to normal retrieval if `product_name` also missing.
5. Run similarity search as normal regardless of step 2–4 result — needed for off-topic questions.
6. Build prompt with both primary context (if present) and retrieved chunks.
7. Call Haiku, evaluate confidence as normal.
8. Set `context_used` accordingly before returning response: `"page_context"`, `"retrieval"`, `"order_lookup"`, or `"keyword_trigger"`.

- [x] Add direct product lookup branch before similarity search
- [x] Handle lookup failure gracefully (fallback to `product_name` hint, then to normal retrieval)
- [x] Keep similarity search running regardless, for off-topic drift handling
- [x] Set `context_used` on every response path (all 4 values)
- [ ] Unit test: product page + on-topic question → primary_product used, confidence high
- [ ] Unit test: product page + off-topic question → retrieval used, primary_product ignored in answer
- [ ] Unit test: product_id present but not found in DB → falls back to product_name hint, does not crash

---

### 1.3 Update prompt template

File: wherever the prompt template lives (likely `chat/prompts.py`).

```
You are a customer support assistant for {store_name}.
Answer questions using ONLY the context below.
If the answer is not in the context, say you will connect the customer with the team.
Never invent product details, prices, or stock levels.

CUSTOMER IS CURRENTLY VIEWING:
{primary_product_document}

ADDITIONAL CONTEXT (use only if relevant to the question):
{retrieved_chunks}

ORDER STATUS (if queried):
{order_data}

CONVERSATION HISTORY:
{last_5_messages}

CUSTOMER: {user_message}
ASSISTANT:
```

If `primary_product_document` is empty (no page context), omit that section entirely from the rendered prompt — do not send an empty "CUSTOMER IS CURRENTLY VIEWING:" header.

- [ ] Add `CUSTOMER IS CURRENTLY VIEWING` section to prompt template
- [ ] Conditionally omit section when no primary product is present
- [ ] Verify Haiku prioritizes primary product section over additional context in test queries (e.g. "is this in stock?" should resolve to primary product, not the highest-similarity retrieved chunk)

---

### 1.4 Update ChatMessage persistence

File: wherever `ChatMessage` is saved after a response (likely in the same chat view).

When saving the assistant `ChatMessage`, dump the `page_context` that was used into the `metadata` JSON field, alongside `context_used`. This preserves an audit trail — useful when debugging old sessions in Django Admin (C3).

```python
ChatMessage.objects.create(
    session=session,
    role="assistant",
    content=answer,
    confidence_score=confidence,
    escalated=escalated,
    escalation_reason=escalation_reason,
    metadata={
        "page_context": page_context.dict() if page_context else None,
        "context_used": context_used,
    },
)
```

- [x] Store `page_context` and `context_used` in `ChatMessage.metadata`
- [x] Verify Django Admin C3 (chat session detail) can display this metadata for debugging

---

## Part 2 — WP Plugin: detect and expose product context

### 2.1 Add settings toggle

File: plugin settings page (A1, likely `includes/admin/settings-page.php` or equivalent).

Add a new toggle under the existing Widget section:

```
┌─ Widget ───────────────────────────────┐
│  Enable widget   [x] On storefront     │
│  Position        (●) Bottom-right      │
│                  ( ) Bottom-left       │
│  Product context [x] Aware of product  │
│                      pages (recommended)│
└─────────────────────────────────────────┘
```

Stored as a new `wp_options` key: `woocs_product_context_enabled` (default: `true`).

- [x] Add checkbox field to Settings page template
- [x] Save to `wp_options['woocs_product_context_enabled']` on form submit
- [x] Default value: enabled (`true`) — this is a quality improvement, not a risky feature, so opt-out makes more sense than opt-in
- [x] Add one-line help text under the checkbox: "When enabled, the assistant gives more specific answers about the product the customer is currently viewing."

---

### 2.2 Detect product page and build context payload

File: wherever the widget script is enqueued (likely `includes/widget-loader.php` or equivalent).

Use WooCommerce's native template detection:

```php
function woocs_get_page_context() {
    if ( ! get_option( 'woocs_product_context_enabled', true ) ) {
        return array( 'type' => 'general' );
    }

    if ( function_exists( 'is_product' ) && is_product() ) {
        global $product;
        if ( $product instanceof WC_Product ) {
            return array(
                'type'         => 'product',
                'product_id'   => $product->get_id(),
                'product_name' => $product->get_name(),
            );
        }
    }

    return array( 'type' => 'general' );
}
```

Pass this into the existing `wp_localize_script()` call that already sets up `window.WooCS`:

```php
wp_localize_script( 'woocs-widget', 'WooCS', array(
    'store_id'     => get_option( 'woocs_store_id' ),
    'api_url'      => get_option( 'woocs_api_url' ),
    'store_name'   => get_bloginfo( 'name' ),
    'page_context' => woocs_get_page_context(),
) );
```

- [x] Implement `woocs_get_page_context()` function
- [x] Respect the settings toggle — return `general` immediately if disabled
- [x] Hook into existing `wp_localize_script()` call, add `page_context` key
- [ ] Test on a real WooCommerce product page — verify `is_product()` returns true and `$product->get_id()` matches the actual product
- [ ] Test on non-product pages (homepage, cart, category) — verify `type: general` is returned

---



## Part 4 — Frontend preview page (A4) — currently missing, add to plugin

This page does not exist yet per the request. It needs to be built as part of this plan, not just modified.

### 4.1 Build A4 Widget preview page

Route: `/wp-admin/admin.php?page=woocs-preview`

This page was specified in the PRD (Section 14, A4) but has not been implemented. Required for testing page context behavior before going live — without it, there's no way to verify product context detection works without leaving WP Admin.

**Minimum viable version for this plan:**

- [ ] Create new admin page registered in plugin menu, under WooCS.ai parent menu
- [ ] Embed an iframe pointing to a real product page on the merchant's storefront (or a dropdown to pick which product to preview)
- [ ] Render the actual widget inside that iframe (uses real `window.WooCS` injection, so page context detection is naturally tested)
- [ ] Add debug overlay (per 3.5 above) showing `confidence` and `context_used` per response
- [ ] Add a dropdown: "Preview as page type" with options General / Product — lets merchant manually test without navigating to an actual product page
- [ ] Add "Test escalation" button (sends hardcoded refund-keyword message)
- [ ] Add response latency display in ms

This is a larger task than the rest of this plan — treat as its own sub-deliverable. The other A4 features (escalation test, latency display) were already speced in the PRD; this plan adds the product context dropdown specifically.

---

## Testing checklist (end-to-end)

- [ ] Visit a real product page on test store → widget greeting shows product name
- [ ] Ask "is this in stock?" on product page → answer resolves to the viewed product, not a similarity-matched guess
- [ ] Ask an off-topic question on product page (e.g. "do you have shoes?") → similarity search still works, doesn't force-fit the viewed product
- [ ] Disable "Product context" toggle in plugin settings → greeting reverts to generic, `page_context` sent as `general` regardless of page
- [ ] Visit homepage → `page_context: general`, generic greeting, generic quick replies
- [ ] Navigate from Product A page to Product B page (full reload) → context updates correctly, no stale Product A context bleeding into Product B session
- [ ] Product ID sent but not yet synced/embedded in Django (race condition) → falls back gracefully to `product_name` hint or general retrieval, no error shown to customer
- [ ] A4 preview page: switch "Preview as page type" dropdown → debug overlay shows correct `context_used` value

---

## Out of scope reminder

Do not implement in this pass: category page context, cart page context, variation-level context (pre-selected size/color), SPA navigation detection. These are explicitly deferred — revisit only after PoC validates the core product-context feature.
