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

// Initialize Widget Renderer for Frontend
WooCS\WidgetRenderer::init();
