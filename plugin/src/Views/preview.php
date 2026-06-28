<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$store_id = get_option('woocs_store_id');
$api_url = get_option('woocs_api_url', 'http://localhost:8000');
$store_name = get_bloginfo('name');
$widget_js = WOOCS_PLUGIN_URL . 'assets/woocs-widget.js';
?>
<div class="wrap woocs-wrap">
    <h1 class="wp-heading-inline">WooCS &rsaquo; Widget Preview</h1>
    <hr class="wp-header-end">

    <div class="woocs-preview-container" style="margin-top: 20px;">
        <p>This is the actual widget loaded inside the WP admin. You can chat with it exactly as your customers would.</p>
        
        <?php if (!$store_id): ?>
            <div class="notice notice-error inline"><p>Please connect your store in the Settings page first.</p></div>
        <?php else: ?>
            <!-- The widget will mount here and float at the bottom right as designed -->
            <?php \WooCS\WidgetRenderer::render($store_id ?: 'test-store-id'); ?>
        <?php endif; ?>
    </div>
</div>
