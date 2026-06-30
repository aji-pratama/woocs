<?php
declare(strict_types=1);

namespace WooCS;

class AdminMenu {

    public function __construct() {
        add_action('admin_menu', [$this, 'register_menus']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('admin_post_woocs_save_settings', [$this, 'handle_save_settings']);
        add_action('admin_post_woocs_disconnect_store', [$this, 'handle_disconnect_store']);
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
            'WooCS Settings',
            'WooCS',
            $capability,
            'woocs-settings',
            [$this, 'render_settings_page'],
            'dashicons-format-chat',
            56
        );

        add_submenu_page(
            'woocs-settings',
            'WooCS Settings',
            'Settings',
            $capability,
            'woocs-settings',
            [$this, 'render_settings_page']
        );

        add_submenu_page(
            'woocs-settings',
            'WooCS Sync Status',
            'Sync',
            $capability,
            'woocs-sync',
            [$this, 'render_sync_page']
        );

        add_submenu_page(
            'woocs-settings',
            'WooCS FAQs',
            'FAQs',
            $capability,
            'woocs-faqs',
            [$this, 'render_faqs_page']
        );

        add_submenu_page(
            'woocs-settings',
            'WooCS Preview',
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

    public function handle_save_settings() {
        if (!current_user_can('manage_woocommerce')) {
            wp_die('Unauthorized');
        }

        check_admin_referer('woocs_save_settings');

        $wc_url = sanitize_url($_POST['woocs_wc_url'] ?? get_site_url());
        $merchant_email = sanitize_email($_POST['woocs_merchant_email'] ?? get_option('admin_email'));
        $api_key = sanitize_text_field($_POST['woocs_api_key'] ?? '');
        
        $wc_consumer_key = sanitize_text_field($_POST['woocs_wc_consumer_key'] ?? '');
        $wc_consumer_secret = sanitize_text_field($_POST['woocs_wc_consumer_secret'] ?? '');

        $client = new ApiClient();
        $response = $client->register_store($wc_url, $merchant_email, $api_key, $wc_consumer_key, $wc_consumer_secret);

        if (is_wp_error($response)) {
            set_transient('woocs_admin_error', $response->get_error_message(), 45);
        } else {
            update_option('woocs_store_id', sanitize_text_field($response['store_id']));
            update_option('woocs_wc_url', $wc_url);
            update_option('woocs_merchant_email', $merchant_email);
            
            if (isset($_POST['woocs_wc_consumer_key'])) {
                update_option('woocs_wc_consumer_key', sanitize_text_field($_POST['woocs_wc_consumer_key']));
            }
            if (isset($_POST['woocs_wc_consumer_secret'])) {
                update_option('woocs_wc_consumer_secret', sanitize_text_field($_POST['woocs_wc_consumer_secret']));
            }
            if (isset($_POST['woocs_widget_enabled'])) {
                update_option('woocs_widget_enabled', '1');
            } else {
                update_option('woocs_widget_enabled', '0');
            }
            if (isset($_POST['woocs_product_context_enabled'])) {
                update_option('woocs_product_context_enabled', '1');
            } else {
                update_option('woocs_product_context_enabled', '0');
            }
            if (isset($_POST['woocs_widget_position'])) {
                update_option('woocs_widget_position', sanitize_text_field($_POST['woocs_widget_position']));
            }
            if (!empty($response['api_key'])) {
                update_option('woocs_api_key', sanitize_text_field($response['api_key']));
            }

            set_transient('woocs_admin_success', 'Settings saved and store connected successfully!', 45);
        }

        wp_safe_redirect(admin_url('admin.php?page=woocs-settings'));
        exit;
    }

    public function handle_disconnect_store() {
        if (!current_user_can('manage_woocommerce')) {
            wp_die('Unauthorized');
        }

        check_admin_referer('woocs_disconnect_store');

        delete_option('woocs_store_id');
        delete_option('woocs_api_key');

        set_transient('woocs_admin_success', 'Store disconnected successfully.', 45);
        wp_safe_redirect(admin_url('admin.php?page=woocs-settings'));
        exit;
    }
}
