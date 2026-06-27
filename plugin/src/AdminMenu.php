<?php
namespace WooCS;

declare(strict_types=1);

class AdminMenu {

    public function __construct() {
        add_action('admin_menu', [$this, 'register_menus']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
    }

    public function enqueue_assets($hook) {
        if (strpos($hook, 'woocs') === false) {
            return;
        }

        wp_enqueue_style('woocs-admin-css', WOOCS_PLUGIN_URL . 'assets/admin.css', [], WOOCS_VERSION);
        wp_enqueue_script('woocs-admin-js', WOOCS_PLUGIN_URL . 'assets/admin.js', [], WOOCS_VERSION, true);
    }

    public function register_menus() {
        $capability = 'manage_woocommerce';

        add_menu_page(
            'WooCS.ai Settings',
            'WooCS.ai',
            $capability,
            'woocs-settings',
            [$this, 'render_settings_page'],
            'dashicons-format-chat',
            56
        );

        add_submenu_page(
            'woocs-settings',
            'WooCS.ai Settings',
            'Settings',
            $capability,
            'woocs-settings',
            [$this, 'render_settings_page']
        );

        add_submenu_page(
            'woocs-settings',
            'WooCS.ai Sync Status',
            'Sync',
            $capability,
            'woocs-sync',
            [$this, 'render_sync_page']
        );

        add_submenu_page(
            'woocs-settings',
            'WooCS.ai FAQs',
            'FAQs',
            $capability,
            'woocs-faqs',
            [$this, 'render_faqs_page']
        );

        add_submenu_page(
            'woocs-settings',
            'WooCS.ai Preview',
            'Preview',
            $capability,
            'woocs-preview',
            [$this, 'render_preview_page']
        );
    }

    public function render_settings_page() {
        require WOOCS_PLUGIN_DIR . 'src/Views/settings.php';
    }

    public function render_sync_page() {
        require WOOCS_PLUGIN_DIR . 'src/Views/sync.php';
    }

    public function render_faqs_page() {
        require WOOCS_PLUGIN_DIR . 'src/Views/faqs.php';
    }

    public function render_preview_page() {
        require WOOCS_PLUGIN_DIR . 'src/Views/preview.php';
    }
}
