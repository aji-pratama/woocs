<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$store_id = get_option('woocs_store_id');
$api_url = get_option('woocs_api_url', 'http://localhost:8000');
$store_name = get_bloginfo('name');

// Fetch up to 50 products for the context dropdown
$products = function_exists('wc_get_products') ? wc_get_products(['limit' => 50, 'status' => 'publish', 'return' => 'objects']) : [];
?>
<div class="wrap woocs-wrap">
    <h1 class="wp-heading-inline">WooCS &rsaquo; Widget Preview</h1>
    <hr class="wp-header-end">

    <div class="woocs-preview-container">
        <!-- Control Panel -->
        <div class="woocs-preview-controls">
            <h2>Test Controls</h2>
            <p class="description">Simulate different page contexts without leaving the admin.</p>

            <label for="woocs-test-context-type">Page Context</label>
            <select id="woocs-test-context-type">
                <option value="general">General (Homepage, Cart, etc)</option>
                <option value="product">Product Page</option>
            </select>

            <div id="woocs-test-product-wrap" style="display:none;">
                <label for="woocs-test-product-id">Select Product</label>
                <select id="woocs-test-product-id">
                    <?php foreach ($products as $p): ?>
                        <option value="<?php echo esc_attr($p->get_id()); ?>" data-name="<?php echo esc_attr($p->get_name()); ?>">
                            <?php echo esc_html($p->get_name()); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>

            <button type="button" id="woocs-test-simulate-btn" class="button button-primary" style="width:100%;margin-bottom:16px;">Apply Context</button>

            <hr class="woocs-divider">

            <p style="margin:0 0 8px;font-weight:600;font-size:13px;">Trigger Events</p>
            <button type="button" id="woocs-test-escalate-btn" class="button" style="width:100%;">Test Escalation</button>
        </div>

        <!-- Widget Area -->
        <div class="woocs-preview-widget-area">
            <?php if (!$store_id): ?>
                <div class="notice notice-error inline"><p>Please connect your store in the Settings page first.</p></div>
            <?php else: ?>
                <div class="notice notice-info inline" style="margin-top:0;">
                    <p>The widget floats at the bottom right of the screen. Interact with it as your customers would.</p>
                </div>
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

    // Restore from localStorage
    const savedType = localStorage.getItem('woocs_preview_context_type');
    if (savedType) {
        typeSelect.value = savedType;
        if (savedType === 'product') {
            productWrap.style.display = 'block';
            const savedProduct = localStorage.getItem('woocs_preview_product_id');
            if (savedProduct) {
                productSelect.value = savedProduct;
            }
        }
    }

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
        localStorage.setItem('woocs_preview_context_type', type);

        if (type === 'product') {
            const selectedOption = productSelect.options[productSelect.selectedIndex];
            localStorage.setItem('woocs_preview_product_id', selectedOption.value);
            window.WooCS.page_context = {
                type: 'product',
                product_id: parseInt(selectedOption.value, 10),
                product_name: selectedOption.getAttribute('data-name')
            };
        } else {
            localStorage.removeItem('woocs_preview_product_id');
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
    
    // Automatically apply saved context if it exists
    if (savedType && window.WooCS) {
        if (savedType === 'product') {
            const selectedOption = productSelect.options[productSelect.selectedIndex];
            window.WooCS.page_context = {
                type: 'product',
                product_id: parseInt(selectedOption.value, 10),
                product_name: selectedOption.getAttribute('data-name')
            };
        } else {
            window.WooCS.page_context = { type: 'general' };
        }
    }
});
</script>
