# Plan Initial Plugin: WooCS WordPress Wrapper

This document outlines the blueprint for the agent/developer to set up the `woocs` WordPress plugin repository, directory structure, and the automation scripts `dev.sh` and `build.sh`.

---

## 1. Main Directory Structure

```txt
plugin/
├── dist/                # Target output folder for production ZIP releases
├── scripts/
│   ├── dev.sh           # Automation script for local development environment
│   └── build.sh         # Build, obfuscation, and zipping automation script
├── src/                 # Raw WordPress plugin source code (Classes, Logic)
├── assets/              # Static assets storage (widget JS, CSS, Images)
│   └── woocs-widget.js
├── woocs.php         # Main WordPress plugin entry file
└── README.md
```

## 2. Tasks

- [ ] Initialize `plugin/` directory structure (`src/`, `dist/`, `scripts/`, `assets/`).
- [ ] Create `plugin/woocs.php` with standard WordPress plugin headers and basic class setup.
- [ ] Create `plugin/scripts/dev.sh` to facilitate local development.
- [ ] Create `plugin/scripts/build.sh` for obfuscation and zipping the plugin release.
- [ ] Add `plugin/README.md` for plugin-specific documentation.
- [ ] Integrate with backend

---

# Plugin UI/UX & Integration Implementation Plan

This plan outlines the UI/UX development and architecture for the `woocs` WordPress Plugin, based on the requirements in `PRD_v0.md`. The focus is on the WP Admin Dashboard pages (Layer A) and the Widget injection mechanism.

## User Review Required

> [!IMPORTANT]
> **Admin UI Technology Stack:** The PRD specifies PHP 8.1 for the plugin, but does not dictate the frontend stack for the WP Admin pages. I propose using **native WordPress HTML/CSS classes** combined with **Vanilla CSS** to deliver a premium, seamless, and performant admin experience without the overhead of bundling React for the admin dashboard. The actual chat widget (customer-facing) will still be React as per the PRD. Do you approve of this approach for the Admin UI?

## Proposed Changes

---

### Plugin Core & Navigation (PHP)

Set up the core plugin structure, menu registration, and asset enqueuing.

#### [NEW] `plugin/woocs.php` (Update)
- Register the `woocs-settings` menu and its submenus (`Sync`, `FAQs`, `Preview`).
- Enqueue admin-specific CSS/JS (Vanilla CSS).
- Implement `wp_enqueue_script` and `wp_localize_script` to inject the React widget on the storefront.

#### [NEW] `plugin/src/AdminMenu.php`
- Class responsible for defining `add_menu_page` and `add_submenu_page` hooks.
- Handles capability checks (`manage_woocommerce`).

---

### A1. Settings Page UI (`woocs-settings`)

#### [NEW] `plugin/src/Views/settings.php`
- **Connection Status Component:** Premium visual indicator (Green/Red/Amber dots) for Connected/Not Connected/Error states.
- **API Key Section:** Input field with masking and a copy-to-clipboard button.
- **WooCommerce Credentials Form:** Fields for Store URL, Consumer Key, Consumer Secret, and Merchant Email.
- **Widget Preferences:** Toggle for enabling/disabling the storefront widget and selecting its position (bottom-right vs. bottom-left).
- **Design:** Clean, card-based layout using standard WP meta-boxes enhanced with modern Vanilla CSS.

---

### A2. Sync Status Page UI (`woocs-sync`)

#### [NEW] `plugin/src/Views/sync.php`
- **Sync Summary Cards:** Dynamic grid displaying counts for Products, Variations, FAQs, and Orders API status.
- **Manual Sync CTA:** Prominent primary button to trigger a manual sync (`POST /api/stores/sync/`).
- **Sync Log Table:** A styled `WP_List_Table` (or custom responsive table) showing the last 10 sync events with timestamps, entities, and status icons.
- **Auto-Refresh:** Vanilla JS snippet to auto-poll the status every 10s when a sync is active.

---

### A3. FAQ Manager Page UI (`woocs-faqs`)

#### [NEW] `plugin/src/Views/faqs.php`
- **Add FAQ Form:** Modern, accessible form with textareas for Question and Answer.
- **FAQ List:** A responsive table displaying existing FAQs with inline edit and delete actions. Includes visual feedback (micro-animations) on row deletion.
- **Sync FAQs CTA:** Button to push just the FAQs to the Django backend.

---

### A4. Widget Preview Page UI (`woocs-preview`)

#### [NEW] `plugin/src/Views/preview.php`
- **Iframe Container:** An embedded view of the storefront homepage to render the widget in context.
- **Debug Overlay:** A sidebar or floating panel in the WP Admin specifically for testing (Test escalation CTA, clear session CTA, and latency/confidence score readouts).

---

### Admin Assets

#### [NEW] `plugin/assets/admin.css`
- **Styling:** Premium Vanilla CSS to elevate the default WordPress admin aesthetics (e.g., subtle shadows, rounded corners, modern typography, glassmorphism on active states).
- **Animations:** Micro-animations for button hovers and status transitions.

#### [NEW] `plugin/assets/admin.js`
- **Interactivity:** Vanilla JS for handling API key copying, form validation, and the auto-refresh logic on the Sync Status page.

## Verification Plan

### Automated Tests
- PHP linting on all new views and classes.

### Manual Verification
1. **Menu Navigation:** Verify all 4 admin pages appear under the WooCS menu and require `manage_woocommerce` capabilities.
2. **Settings State:** Test the transition between "Not connected" and "Connected" states visually.
3. **Widget Injection:** Verify the React widget bundle (`woocs-widget.js`) and `window.WooCS` config are correctly injected into the storefront footer, but excluded from WP Admin and Order Confirmation pages.
4. **Responsive UI:** Ensure all admin pages look premium and function correctly on both desktop and mobile views within the WP Dashboard.
