<?php
/**
 * Plugin Name: WooCS
 * Plugin URI: https://woocs.ai
 * Description: AI-powered customer support widget for WooCommerce.
 * Version: 0.1.0
 * Author: WooCS
 * Author URI: https://woocs.ai
 * License: GPL v2 or later
 * Text Domain: woocs
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

define('WOOCS_VERSION', '0.1.0');
define('WOOCS_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('WOOCS_PLUGIN_URL', plugin_dir_url(__FILE__));

// Simple autoloader for PoC
spl_autoload_register(function ($class) {
    $prefix = 'WooCS\\';
    $base_dir = WOOCS_PLUGIN_DIR . 'src/';

    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }

    $relative_class = substr($class, $len);
    $file = $base_dir . str_replace('\\', '/', $relative_class) . '.php';

    if (file_exists($file)) {
        require $file;
    }
});

// Initialize Admin Menu & AJAX
if (is_admin()) {
    new WooCS\AdminMenu();
    WooCS\AjaxHandlers::init();
}

// Inject Widget on Frontend
add_action('wp_enqueue_scripts', function() {
    // Exclude on order confirmation page (is_order_received_page) and admin
    if (is_admin() || (function_exists('is_wc_endpoint_url') && is_wc_endpoint_url('order-received'))) {
        return;
    }

    // Only inject if widget is enabled and store is connected
    $store_id = get_option('woocs_store_id');
    $widget_enabled = get_option('woocs_widget_enabled', '1');
    
    if (!$store_id || $widget_enabled !== '1') {
        return;
    }

    $widget_js = WOOCS_PLUGIN_URL . 'assets/woocs-widget.js';
    
    wp_enqueue_script('woocs-widget', $widget_js, [], WOOCS_VERSION, true);

    $api_url = get_option('woocs_api_url', 'http://host.docker.internal:8000');
    $store_name = get_bloginfo('name');
    
    wp_localize_script('woocs-widget', 'WooCS', [
        'store_id' => $store_id,
        'api_url' => $api_url,
        'store_name' => $store_name,
    ]);
});
