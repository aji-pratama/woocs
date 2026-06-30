<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$store_id = get_option('woocs_store_id');
$api_url = get_option('woocs_api_url', 'http://localhost:8000');
$store_name = get_bloginfo('name');
$widget_js = WOOCS_PLUGIN_URL . 'assets/woocs-widget.js';

// Fetch up to 50 products for the context dropdown
$products = function_exists('wc_get_products') ? wc_get_products(['limit' => 50, 'status' => 'publish', 'return' => 'objects']) : [];
?>
<div class="wrap woocs-wrap">
    <h1 class="wp-heading-inline">WooCS &rsaquo; Widget Preview</h1>
    <hr class="wp-header-end">

    <div class="woocs-preview-container" style="margin-top: 20px; display: flex; gap: 40px;">
        <!-- Control Panel -->
        <div class="woocs-preview-controls" style="flex: 0 0 320px; background: #fff; padding: 20px; border: 1px solid #ccd0d4; border-radius: 4px; box-shadow: 0 1px 1px rgba(0,0,0,.04);">
            <h2 style="margin-top: 0;">Test Controls</h2>
            <p class="description">Simulate different customer environments without leaving the admin.</p>
            
            <div style="margin-bottom: 15px;">
                <label for="woocs-test-context-type" style="display: block; font-weight: 600; margin-bottom: 5px;">Page Context</label>
                <select id="woocs-test-context-type" style="width: 100%;">
                    <option value="general">General (Homepage, Cart, etc)</option>
                    <option value="product">Product Page</option>
                </select>
            </div>

            <div id="woocs-test-product-wrap" style="margin-bottom: 15px; display: none;">
                <label for="woocs-test-product-id" style="display: block; font-weight: 600; margin-bottom: 5px;">Select Product</label>
                <select id="woocs-test-product-id" style="width: 100%;">
                    <?php foreach ($products as $p): ?>
                        <option value="<?php echo esc_attr($p->get_id()); ?>" data-name="<?php echo esc_attr($p->get_name()); ?>">
                            <?php echo esc_html($p->get_name()); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>

            <button type="button" id="woocs-test-simulate-btn" class="button button-primary" style="margin-bottom: 25px; width: 100%;">Apply Context</button>

            <hr style="margin-bottom: 20px; border-top: 1px solid #eee; border-bottom: none;" />

            <h2 style="margin-top: 0; font-size: 14px;">Trigger Events</h2>
            <button type="button" id="woocs-test-escalate-btn" class="button" style="width: 100%;">Test Escalation ("I want a refund")</button>
        </div>

        <!-- Widget Area -->
        <div class="woocs-preview-widget-area" style="flex: 1;">
            <?php if (!$store_id): ?>
                <div class="notice notice-error inline"><p>Please connect your store in the Settings page first.</p></div>
            <?php else: ?>
                <p><strong>Note:</strong> The widget floats at the bottom right of the screen. Interact with it below.</p>
                <?php \WooCS\WidgetRenderer::render($store_id ?: 'test-store-id'); ?>
            <?php endif; ?>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const typeSelect = document.getElementById('woocs-test-context-type');
    const productWrap = document.getElementById('woocs-test-product-wrap');
    const productSelect = document.getElementById('woocs-test-product-id');
    const applyBtn = document.getElementById('woocs-test-simulate-btn');
    const escalateBtn = document.getElementById('woocs-test-escalate-btn');

    typeSelect.addEventListener('change', function() {
        if (this.value === 'product') {
            productWrap.style.display = 'block';
        } else {
            productWrap.style.display = 'none';
        }
    });

    applyBtn.addEventListener('click', function() {
        if (!window.WooCS) return;
        
        const type = typeSelect.value;
        if (type === 'product') {
            const selectedOption = productSelect.options[productSelect.selectedIndex];
            window.WooCS.page_context = {
                type: 'product',
                product_id: parseInt(selectedOption.value, 10),
                product_name: selectedOption.getAttribute('data-name')
            };
        } else {
            window.WooCS.page_context = { type: 'general' };
        }

        if (window.WooCS_Test && typeof window.WooCS_Test.resetWidget === 'function') {
            window.WooCS_Test.resetWidget();
        } else {
            alert('Widget re-mount helper not available yet.');
        }
    });

    escalateBtn.addEventListener('click', function() {
        if (window.WooCS_Test && typeof window.WooCS_Test.triggerMessage === 'function') {
            window.WooCS_Test.triggerMessage("I want a refund");
        } else {
            alert('Widget message helper not available yet.');
        }
    });
});
</script>
