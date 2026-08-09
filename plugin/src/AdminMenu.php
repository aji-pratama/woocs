<?php
declare(strict_types=1);

namespace WooCS;

class AdminMenu {

    public function __construct() {
        add_action('admin_menu', [$this, 'register_menus']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('admin_post_woocs_save_settings', [$this, 'handle_save_settings']);
        add_action('admin_post_woocs_disconnect_store', [$this, 'handle_disconnect_store']);
        add_action('admin_post_woocs_start_checkout', [$this, 'handle_start_checkout']);
        add_action('admin_post_woocs_open_billing_portal', [$this, 'handle_open_billing_portal']);
        add_action('admin_head', [$this, 'hide_preview_submenu']);
    }

    public function enqueue_assets($hook) {
        if (strpos($hook, 'woocs') === false) {
            return;
        }

        $css_ver = file_exists(WOOCS_PLUGIN_DIR . 'assets/admin.css') ? (string) filemtime(WOOCS_PLUGIN_DIR . 'assets/admin.css') : WOOCS_VERSION;
        wp_enqueue_style('woocs-admin-css', WOOCS_PLUGIN_URL . 'assets/admin.css', [], $css_ver);
        wp_enqueue_script('woocs-admin-js', WOOCS_PLUGIN_URL . 'assets/admin.js', [], WOOCS_VERSION, true);
    }

    public function register_menus() {
        $capability = 'manage_woocommerce';

        add_menu_page(
            'WooCS Overview',
            'WooCS',
            $capability,
            'woocs-dashboard',
            [$this, 'render_dashboard_page'],
            'dashicons-format-chat',
            56
        );

        add_submenu_page(
            'woocs-dashboard',
            'WooCS Overview',
            'Overview',
            $capability,
            'woocs-dashboard',
            [$this, 'render_dashboard_page']
        );

        add_submenu_page(
            'woocs-dashboard',
            'WooCS Knowledge',
            'Knowledge',
            $capability,
            'woocs-knowledge',
            [$this, 'render_knowledge_page']
        );

        add_submenu_page(
            'woocs-dashboard',
            'WooCS Conversations',
            'Conversations',
            $capability,
            'woocs-chat-history',
            [$this, 'render_chat_history_page']
        );

        add_submenu_page(
            'woocs-dashboard',
            'WooCS Settings',
            'Settings',
            $capability,
            'woocs-settings',
            [$this, 'render_settings_page']
        );

        add_submenu_page(
            'woocs-dashboard',
            'WooCS Widget Preview',
            'Widget Preview',
            $capability,
            'woocs-preview',
            [$this, 'render_preview_page']
        );
    }

    public function render_dashboard_page() {
        require WOOCS_PLUGIN_DIR . 'src/Views/dashboard.php';
    }

    public function render_chat_history_page() {
        require WOOCS_PLUGIN_DIR . 'src/Views/chat-history.php';
    }

    public function render_settings_page() {
        require WOOCS_PLUGIN_DIR . 'src/Views/settings.php';
    }

    public function render_knowledge_page() {
        require WOOCS_PLUGIN_DIR . 'src/Views/knowledge.php';
    }

    public function render_preview_page() {
        require WOOCS_PLUGIN_DIR . 'src/Views/preview.php';
    }

    public function hide_preview_submenu(): void {
        remove_submenu_page('woocs-dashboard', 'woocs-preview');
    }

    public function handle_save_settings() {
        if (!current_user_can('manage_woocommerce')) {
            wp_die('Unauthorized');
        }

        check_admin_referer('woocs_save_settings');

        $tab = sanitize_key($_POST['woocs_settings_tab'] ?? 'connection');

        if ($tab === 'widget') {
            // Widget tab
            update_option('woocs_widget_enabled', isset($_POST['woocs_widget_enabled']) ? '1' : '0');
            update_option('woocs_widget_position', sanitize_text_field($_POST['woocs_widget_position'] ?? 'bottom-right'));
            update_option('woocs_widget_primary_color', sanitize_hex_color($_POST['woocs_widget_primary_color'] ?? '#2271b1') ?: '#2271b1');
            set_transient('woocs_admin_success', 'Widget settings saved.', 45);

        } elseif ($tab === 'prechat') {
            // Pre-chat form tab
            update_option('woocs_prechat_enabled', isset($_POST['woocs_prechat_enabled']) ? '1' : '0');
            foreach (['name', 'email', 'phone'] as $field) {
                update_option("woocs_prechat_{$field}_enabled",  isset($_POST["woocs_prechat_{$field}_enabled"])  ? '1' : '0');
                update_option("woocs_prechat_{$field}_required", isset($_POST["woocs_prechat_{$field}_required"]) ? '1' : '0');
            }
            set_transient('woocs_admin_success', 'Pre-chat form settings saved.', 45);

        } elseif ($tab === 'advanced') {
            // Advanced tab
            update_option('woocs_wc_url', sanitize_url($_POST['woocs_wc_url'] ?? get_site_url()));
            update_option('woocs_merchant_email', sanitize_email($_POST['woocs_merchant_email'] ?? ''));
            update_option('woocs_wc_consumer_key', sanitize_text_field($_POST['woocs_wc_consumer_key'] ?? ''));
            update_option('woocs_wc_consumer_secret', sanitize_text_field($_POST['woocs_wc_consumer_secret'] ?? ''));
            update_option('woocs_product_context_enabled', isset($_POST['woocs_product_context_enabled']) ? '1' : '0');
            set_transient('woocs_admin_success', 'Advanced settings saved.', 45);

        } else {
            // Connection tab — register/connect store
            $wc_url             = sanitize_url($_POST['woocs_wc_url'] ?? get_site_url());
            $merchant_email     = sanitize_email($_POST['woocs_merchant_email'] ?? get_option('admin_email'));
            $api_key            = sanitize_text_field($_POST['woocs_api_key'] ?? '');
            $wc_consumer_key    = sanitize_text_field($_POST['woocs_wc_consumer_key'] ?? '');
            $wc_consumer_secret = sanitize_text_field($_POST['woocs_wc_consumer_secret'] ?? '');

            $client   = new ApiClient();
            $response = $client->register_store($wc_url, $merchant_email, $api_key, $wc_consumer_key, $wc_consumer_secret);

            if (is_wp_error($response)) {
                set_transient('woocs_admin_error', $response->get_error_message(), 45);
            } else {
                update_option('woocs_store_id', sanitize_text_field($response['store_id']));
                update_option('woocs_wc_url', $wc_url);
                update_option('woocs_merchant_email', $merchant_email);
                if (!empty($response['api_key'])) {
                    update_option('woocs_api_key', sanitize_text_field($response['api_key']));
                }
                set_transient('woocs_admin_success', 'Store connected successfully!', 45);
            }
        }

        $redirect_tab = in_array($tab, ['widget', 'prechat', 'advanced']) ? $tab : 'connection';
        wp_safe_redirect(admin_url('admin.php?page=woocs-settings&tab=' . $redirect_tab));
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

    public function handle_start_checkout() {
        $this->guard_billing_action('woocs_start_checkout');

        $plan_key = sanitize_key($_POST['plan_key'] ?? '');
        if (!in_array($plan_key, ['starter', 'growth', 'pro'], true)) {
            $this->redirect_billing_error('Please choose a valid plan.');
        }

        $response = (new ApiClient())->create_checkout($plan_key);
        $this->redirect_to_billing_url($response);
    }

    public function handle_open_billing_portal() {
        $this->guard_billing_action('woocs_open_billing_portal');
        $response = (new ApiClient())->create_billing_portal();
        $this->redirect_to_billing_url($response);
    }

    private function guard_billing_action(string $nonce_action): void {
        if (!current_user_can('manage_woocommerce')) {
            wp_die('Unauthorized');
        }
        check_admin_referer($nonce_action);

        if (empty(get_option('woocs_api_key'))) {
            $this->redirect_billing_error('Connect your store before managing billing.');
        }
    }

    private function redirect_to_billing_url(array|\WP_Error $response): never {
        if (is_wp_error($response)) {
            $this->redirect_billing_error($response->get_error_message());
        }

        $url = wp_http_validate_url($response['url'] ?? '');
        if (!$url || wp_parse_url($url, PHP_URL_SCHEME) !== 'https') {
            $this->redirect_billing_error('The billing provider returned an invalid URL.');
        }

        wp_redirect($url);
        exit;
    }

    private function redirect_billing_error(string $message): never {
        set_transient('woocs_billing_error', sanitize_text_field($message), 45);
        wp_safe_redirect(admin_url('admin.php?page=woocs-settings&tab=billing'));
        exit;
    }
}
