<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$store_id = get_option('woocs_store_id');
update_option('woocs_previewed', '1', false);

// Fetch up to 50 products for the context dropdown
$products = function_exists('wc_get_products') ? wc_get_products(['limit' => 50, 'status' => 'publish', 'return' => 'objects']) : [];

$error_msg   = get_transient('woocs_admin_error');
$success_msg = get_transient('woocs_admin_success');
if ($error_msg)   delete_transient('woocs_admin_error');
if ($success_msg) delete_transient('woocs_admin_success');
?>
<div class="wrap woocs-wrap">
    <h1 class="wp-heading-inline">Widget Appearance</h1>
    <hr class="wp-header-end">

    <?php if ($error_msg): ?>
        <div class="notice notice-error is-dismissible"><p><?php echo esc_html($error_msg); ?></p></div>
    <?php endif; ?>
    <?php if ($success_msg): ?>
        <div class="notice notice-success is-dismissible"><p><?php echo esc_html($success_msg); ?></p></div>
    <?php endif; ?>

    <!-- ROW 1: SETTINGS -->
    <div style="margin-bottom: 30px;">
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <?php wp_nonce_field('woocs_save_settings'); ?>
            <input type="hidden" name="action" value="woocs_save_settings">
            <input type="hidden" name="woocs_settings_tab" value="appearance">
            
            <div class="woocs-card">
                <div class="woocs-card-header"><h2>Appearance Settings</h2></div>
                <div class="woocs-card-body">
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 40px;">
                        
                        <!-- Left Column: Widget Settings -->
                        <div>
                            <h3 style="margin-top:0;">Widget Configuration</h3>
                            <table class="form-table" style="margin-top:0;">
                                <tr>
                                    <th scope="row" style="padding-top:0;">Enable Widget</th>
                                    <td style="padding-top:0;">
                                        <label>
                                            <input type="checkbox" name="woocs_widget_enabled" value="1" <?php checked(get_option('woocs_widget_enabled', '1'), '1'); ?>>
                                            Show chat widget on storefront
                                        </label>
                                    </td>
                                </tr>
                                <tr>
                                    <th scope="row" style="padding-top:10px;">Quick Replies</th>
                                    <td style="padding-top:10px;">
                                        <label>
                                            <input type="checkbox" name="woocs_enable_quick_replies" value="1" <?php checked(get_option('woocs_enable_quick_replies', '1'), '1'); ?>>
                                            Enable Chat Templates
                                        </label>
                                    </td>
                                </tr>
                                <tr>
                                    <th scope="row" style="padding-top:10px;">Commerce Actions</th>
                                    <td style="padding-top:10px;">
                                        <label style="display:block; margin-bottom: 8px;">
                                            <input type="checkbox" name="woocs_enable_cart_action" value="1" <?php checked(get_option('woocs_enable_cart_action', '1'), '1'); ?>>
                                            Enable "Add to Cart" button in chat
                                        </label>
                                        <label>
                                            <input type="checkbox" name="woocs_enable_carousel" value="1" <?php checked(get_option('woocs_enable_carousel', '1'), '1'); ?>>
                                            Enable Product Carousel (multi-product recommendations)
                                        </label>
                                    </td>
                                </tr>
                                <tr>
                                    <th scope="row">Primary Color</th>
                                    <td>
                                        <input type="color" name="woocs_widget_primary_color"
                                               value="<?php echo esc_attr(get_option('woocs_widget_primary_color', '#2271b1')); ?>"
                                               style="width:48px;height:32px;padding:2px;cursor:pointer;">
                                    </td>
                                </tr>
                                <tr>
                                    <th scope="row">Widget Icon</th>
                                    <td>
                                        <?php 
                                        $icon_id = get_option('woocs_widget_icon_id');
                                        $icon_url = $icon_id ? wp_get_attachment_image_url($icon_id, 'woocs_widget_icon') : '';
                                        // Fallback to original url if custom size isn't generated yet (e.g., SVG)
                                        if ($icon_id && !$icon_url) {
                                            $icon_url = wp_get_attachment_url($icon_id);
                                        }
                                        ?>
                                        <div style="display: flex; align-items: center; gap: 10px;">
                                            <div id="woocs-icon-preview" style="width: 50px; height: 50px; border: 1px dashed #ccc; border-radius: 4px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff;">
                                                <?php if ($icon_url): ?>
                                                    <img src="<?php echo esc_url($icon_url); ?>" style="max-width: 100%; max-height: 100%;">
                                                <?php else: ?>
                                                    <span style="color: #999; font-size: 12px; text-align: center;">No icon</span>
                                                <?php endif; ?>
                                            </div>
                                            <input type="hidden" name="woocs_widget_icon_id" id="woocs_widget_icon_id" value="<?php echo esc_attr($icon_id); ?>">
                                            <div>
                                                <button type="button" class="button" id="woocs-upload-icon-btn">Select Icon</button>
                                                <button type="button" class="button" id="woocs-remove-icon-btn" style="color: #d63638; <?php echo !$icon_id ? 'display: none;' : ''; ?>">Remove</button>
                                            </div>
                                        </div>
                                        <p class="description">Upload a custom icon (PNG or SVG). We'll optimize it to 50x50px.</p>
                                    </td>
                                </tr>
                            </table>
                        </div>

                        <!-- Right Column: Pre-chat Settings -->
                        <div>
                            <h3 style="margin-top:0;">Pre-chat Form</h3>
                            <table class="form-table" style="margin-top:0;">
                                <tr>
                                    <th scope="row" style="padding-top:0; width: 120px;">Enable Form</th>
                                    <td style="padding-top:0;">
                                        <label>
                                            <input type="checkbox" name="woocs_prechat_enabled" value="1" <?php checked(get_option('woocs_prechat_enabled', '0'), '1'); ?>>
                                            Show form before first message
                                        </label>
                                    </td>
                                </tr>
                            </table>
                            
                            <table class="wp-list-table widefat striped" style="margin-top:10px; width: 100%; border: 1px solid #c3c4c7; box-shadow: none;">
                                <thead>
                                    <tr>
                                        <th style="padding-left: 10px;">Field</th>
                                        <th style="text-align:center; width: 80px;">Enabled</th>
                                        <th style="text-align:center; width: 80px;">Required</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php
                                    $fields = ['name' => 'Name', 'email' => 'Email', 'phone' => 'Phone'];
                                    foreach ($fields as $key => $label):
                                        $enabled  = get_option("woocs_prechat_{$key}_enabled",  $key === 'email' ? '1' : '0');
                                        $required = get_option("woocs_prechat_{$key}_required", $key === 'email' ? '1' : '0');
                                    ?>
                                    <tr>
                                        <td style="padding-left: 10px;"><strong><?php echo esc_html($label); ?></strong></td>
                                        <td style="text-align:center;"><input type="checkbox" name="woocs_prechat_<?php echo esc_attr($key); ?>_enabled" value="1" <?php checked($enabled, '1'); ?>></td>
                                        <td style="text-align:center;"><input type="checkbox" name="woocs_prechat_<?php echo esc_attr($key); ?>_required" value="1" <?php checked($required, '1'); ?>></td>
                                    </tr>
                                    <?php endforeach; ?>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                
                <div class="woocs-card-body" style="border-top: 1px solid #ccd0d4; background: #f9f9f9; padding: 15px 20px;">
                    <p class="submit" style="margin: 0; padding: 0;">
                        <button type="submit" class="button button-primary">Save Appearance Settings</button>
                    </p>
                </div>
            </div>
        </form>
    </div>

    <!-- ROW 2: PREVIEW -->
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

            <?php if (defined('WP_DEBUG') && WP_DEBUG): ?>
                <hr class="woocs-divider">
                <p class="woocs-control-label">Developer tools</p>
                <button type="button" id="woocs-test-escalate-btn" class="button woocs-full-width">Test escalation</button>
            <?php endif; ?>
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

    if (escalateBtn) {
        escalateBtn.addEventListener('click', function() {
            if (window.WooCS_Test && typeof window.WooCS_Test.triggerMessage === 'function') {
                window.WooCS_Test.triggerMessage("I want a refund");
            } else {
                alert('Widget message helper not available yet.');
            }
        });
    }
    
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

    // Icon Uploader
    const uploadBtn = document.getElementById('woocs-upload-icon-btn');
    const removeBtn = document.getElementById('woocs-remove-icon-btn');
    const iconPreview = document.getElementById('woocs-icon-preview');
    const iconIdInput = document.getElementById('woocs_widget_icon_id');
    let mediaFrame;

    if (uploadBtn) {
        uploadBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (mediaFrame) {
                mediaFrame.open();
                return;
            }
            mediaFrame = wp.media({
                title: 'Select or Upload Widget Icon',
                button: { text: 'Use this icon' },
                multiple: false
            });
            mediaFrame.on('select', function() {
                const attachment = mediaFrame.state().get('selection').first().toJSON();
                iconIdInput.value = attachment.id;
                const url = attachment.sizes && attachment.sizes.thumbnail ? attachment.sizes.thumbnail.url : attachment.url;
                iconPreview.innerHTML = '<img src="' + url + '" style="max-width: 100%; max-height: 100%;">';
                removeBtn.style.display = 'inline-block';
            });
            mediaFrame.open();
        });
    }

    if (removeBtn) {
        removeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            iconIdInput.value = '';
            iconPreview.innerHTML = '<span style="color: #999; font-size: 12px; text-align: center;">No icon</span>';
            removeBtn.style.display = 'none';
        });
    }
});
</script>
