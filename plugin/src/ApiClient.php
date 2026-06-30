<?php
declare(strict_types=1);

namespace WooCS;

class ApiClient {
    private string $base_url;
    private string $api_key;

    public function __construct() {
        $this->base_url = rtrim(get_option('woocs_api_url', 'http://host.docker.internal:8000'), '/');
        $this->api_key = get_option('woocs_api_key', '');
    }

    public function register_store(string $wc_url, string $merchant_email, string $api_key = '', string $wc_consumer_key = '', string $wc_consumer_secret = ''): array|\WP_Error {
        $url = $this->base_url . '/api/stores/register/';
        
        $body = [
            'wc_url' => $wc_url,
            'merchant_email' => $merchant_email,
        ];
        
        if (!empty($api_key)) {
            $body['api_key'] = $api_key;
        }
        if (!empty($wc_consumer_key)) {
            $body['wc_consumer_key'] = $wc_consumer_key;
        }
        if (!empty($wc_consumer_secret)) {
            $body['wc_consumer_secret'] = $wc_consumer_secret;
        }

        $response = wp_remote_post($url, [
            'headers' => ['Content-Type' => 'application/json'],
            'body' => wp_json_encode($body),
            'timeout' => 15,
        ]);

        return $this->handle_response($response);
    }

    public function sync_catalog(array $products, array $faqs): array|\WP_Error {
        $url = $this->base_url . '/api/stores/sync/';
        
        $body = [
            'products' => $products,
            'faqs' => $faqs,
        ];

        $response = wp_remote_post($url, [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-API-Key' => $this->api_key,
            ],
            'body' => wp_json_encode($body),
            'timeout' => 30, // Sync might take a bit longer
        ]);

        return $this->handle_response($response);
    }

    public function get_sync_status(): array|\WP_Error {
        $url = $this->base_url . '/api/stores/sync/status/';

        $response = wp_remote_get($url, [
            'headers' => [
                'X-API-Key' => $this->api_key,
            ],
            'timeout' => 10,
        ]);

        return $this->handle_response($response);
    }

    public function get_dashboard_stats(): array|\WP_Error {
        $url = $this->base_url . '/api/stores/dashboard/stats/';

        $response = wp_remote_get($url, [
            'headers' => [
                'X-API-Key' => $this->api_key,
            ],
            'timeout' => 10,
        ]);

        return $this->handle_response($response);
    }

    private function handle_response($response): array|\WP_Error {
        if (is_wp_error($response)) {
            return $response;
        }

        $status_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if ($status_code >= 200 && $status_code < 300) {
            return $data ?? [];
        }

        $error_message = isset($data['detail']) ? $data['detail'] : 'Unknown error from WooCS';
        return new \WP_Error('woocs_api_error', $error_message, ['status' => $status_code]);
    }
}
