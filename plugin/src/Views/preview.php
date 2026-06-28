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
            <div style="width: 100%; max-width: 450px; height: 650px; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);">
                <div id="woocs-widget-root" style="width: 100%; height: 100%;"></div>
            </div>

            <script>
                window.WooCS = {
                    store_id: <?php echo wp_json_encode($store_id); ?>,
                    api_url: <?php echo wp_json_encode($api_url); ?>,
                    store_name: <?php echo wp_json_encode($store_name); ?>
                };
            </script>
            <script src="<?php echo esc_url($widget_js); ?>" type="module"></script>
        <?php endif; ?>
    </div>
</div>
