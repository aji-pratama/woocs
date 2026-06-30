<?php
declare(strict_types=1);

namespace WooCS;

class AjaxHandlers {

    public static function init() {
        add_action('wp_ajax_woocs_sync_now', [self::class, 'handle_sync_now']);
        add_action('wp_ajax_woocs_sync_status', [self::class, 'handle_sync_status']);
        add_action('wp_ajax_woocs_dashboard_stats', [self::class, 'handle_dashboard_stats']);
        add_action('wp_ajax_woocs_save_faq', [self::class, 'handle_save_faq']);
        add_action('wp_ajax_woocs_delete_faq', [self::class, 'handle_delete_faq']);
        add_action('wp_ajax_woocs_save_sync_log', [self::class, 'handle_save_sync_log']);
        add_action('wp_ajax_woocs_chat_history', [self::class, 'handle_chat_history']);
        add_action('wp_ajax_woocs_chat_session_detail', [self::class, 'handle_chat_session_detail']);
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

        // Auto-close dangling 'processing' logs
        $logs = get_option('woocs_sync_logs', []);
        if (!empty($logs) && is_array($logs)) {
            if ($logs[0]['status'] === 'processing' && isset($response['status']) && $response['status'] !== 'processing') {
                // If the backend has finished, but our top log is still 'processing', update it.
                // We'll insert a new success log rather than overwrite, so it acts as an append-only log.
                array_unshift($logs, [
                    'status' => 'success',
                    'message' => 'Catalog synced successfully',
                    'time' => current_time('mysql')
                ]);
                $logs = array_slice($logs, 0, 10);
                update_option('woocs_sync_logs', $logs);
                
                // Tell the frontend that logs were updated so it can refresh
                $response['logs_updated'] = true;
            }
        }

        wp_send_json_success($response);
    }

    public static function handle_dashboard_stats() {
        if (!current_user_can('manage_woocommerce')) {
            wp_send_json_error('Unauthorized', 403);
        }
        check_ajax_referer('woocs_dashboard_nonce', 'nonce');

        $client = new ApiClient();
        $response = $client->get_dashboard_stats();

        if (is_wp_error($response)) {
            wp_send_json_error(['message' => $response->get_error_message()], 500);
        }

        wp_send_json_success($response);
    }

    public static function handle_save_faq() {
        if (!current_user_can('manage_woocommerce')) {
            wp_send_json_error('Unauthorized', 403);
        }
        check_ajax_referer('woocs_faq_nonce', 'nonce');

        $question = sanitize_text_field($_POST['question'] ?? '');
        $answer = sanitize_textarea_field($_POST['answer'] ?? '');
        $index = isset($_POST['index']) && $_POST['index'] !== '' ? intval($_POST['index']) : -1;

        if (empty($question) || empty($answer)) {
            wp_send_json_error(['message' => 'Question and answer are required.']);
        }

        $faqs = get_option('woocs_faqs', []);
        if (!is_array($faqs)) $faqs = [];

        $faq = [
            'question' => $question,
            'answer' => $answer,
            'updated' => current_time('mysql')
        ];

        if ($index >= 0 && isset($faqs[$index])) {
            $faqs[$index] = $faq;
        } else {
            $faqs[] = $faq;
        }

        update_option('woocs_faqs', $faqs);
        wp_send_json_success(['faqs' => $faqs]);
    }

    public static function handle_delete_faq() {
        if (!current_user_can('manage_woocommerce')) {
            wp_send_json_error('Unauthorized', 403);
        }
        check_ajax_referer('woocs_faq_nonce', 'nonce');

        $index = isset($_POST['index']) ? intval($_POST['index']) : -1;
        $faqs = get_option('woocs_faqs', []);
        
        if (is_array($faqs) && isset($faqs[$index])) {
            array_splice($faqs, $index, 1);
            update_option('woocs_faqs', $faqs);
            wp_send_json_success(['faqs' => $faqs]);
        }

        wp_send_json_error(['message' => 'FAQ not found.']);
    }

    public static function handle_save_sync_log() {
        if (!current_user_can('manage_woocommerce')) {
            wp_send_json_error('Unauthorized', 403);
        }
        check_ajax_referer('woocs_sync_nonce', 'nonce');

        $status = sanitize_text_field($_POST['status'] ?? '');
        $message = sanitize_text_field($_POST['message'] ?? '');
        
        if (empty($status) || empty($message)) {
            wp_send_json_error(['message' => 'Status and message are required.']);
        }

        $logs = get_option('woocs_sync_logs', []);
        if (!is_array($logs)) $logs = [];

        // Prepend the new log
        array_unshift($logs, [
            'status' => $status,
            'message' => $message,
            'time' => current_time('mysql')
        ]);

        // Keep only the last 10 logs
        $logs = array_slice($logs, 0, 10);

        update_option('woocs_sync_logs', $logs);
        wp_send_json_success(['logs' => $logs]);
    }

    public static function handle_chat_history() {
        if (!current_user_can('manage_woocommerce')) {
            wp_send_json_error('Unauthorized', 403);
        }
        check_ajax_referer('woocs_chat_history_nonce', 'nonce');

        $page = max(1, intval($_POST['page'] ?? 1));
        $client = new ApiClient();
        $response = $client->get_chat_history($page, 20);

        if (is_wp_error($response)) {
            wp_send_json_error(['message' => $response->get_error_message()], 500);
        }

        wp_send_json_success($response);
    }

    public static function handle_chat_session_detail() {
        if (!current_user_can('manage_woocommerce')) {
            wp_send_json_error('Unauthorized', 403);
        }
        check_ajax_referer('woocs_chat_history_nonce', 'nonce');

        $session_id = sanitize_text_field($_POST['session_id'] ?? '');
        if (empty($session_id)) {
            wp_send_json_error(['message' => 'session_id required.']);
        }

        $client = new ApiClient();
        $response = $client->get_chat_session($session_id);

        if (is_wp_error($response)) {
            wp_send_json_error(['message' => $response->get_error_message()], 500);
        }

        wp_send_json_success($response);
    }
}
