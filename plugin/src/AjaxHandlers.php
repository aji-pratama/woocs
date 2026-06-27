<?php
declare(strict_types=1);

namespace WooCS;

class AjaxHandlers {

    public static function init() {
        add_action('wp_ajax_woocs_sync_now', [self::class, 'handle_sync_now']);
        add_action('wp_ajax_woocs_sync_status', [self::class, 'handle_sync_status']);
    }

    public static function handle_sync_now() {
        if (!current_user_can('manage_woocommerce')) {
            wp_send_json_error('Unauthorized', 403);
        }
        check_ajax_referer('woocs_sync_nonce', 'nonce');

        $response = SyncService::run();

        if (is_wp_error($response)) {
            wp_send_json_error(['message' => $response->get_error_message()], 500);
        }

        wp_send_json_success($response);
    }

    public static function handle_sync_status() {
        if (!current_user_can('manage_woocommerce')) {
            wp_send_json_error('Unauthorized', 403);
        }
        check_ajax_referer('woocs_sync_nonce', 'nonce');

        $client = new ApiClient();
        $response = $client->get_sync_status();

        if (is_wp_error($response)) {
            wp_send_json_error(['message' => $response->get_error_message()], 500);
        }

        wp_send_json_success($response);
    }
}
