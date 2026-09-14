<?php

namespace WooCS\Tests;

use PHPUnit\Framework\TestCase;
use Brain\Monkey\Functions;
use WooCS\ApiClient;

class ApiClientTest extends TestCase {
    protected function tearDown(): void {
        \Brain\Monkey\tearDown();
        parent::tearDown();
    }

    private function setupApiClientMocks(string $apiKey = 'test_key_123', string $apiUrl = 'http://localhost:8001') {
        Functions\when('get_option')->alias(function($key, $default = '') use ($apiKey, $apiUrl) {
            if ($key === 'woocs_api_key') return $apiKey;
            if ($key === 'woocs_api_url') return $apiUrl;
            return $default;
        });
    }

    public function testRegisterStoreSuccess() {
        $this->setupApiClientMocks();

        $expectedResponse = [
            'store_id' => 'store-uuid-456',
            'api_key' => 'new_key_789',
            'valid' => true
        ];

        Functions\expect('wp_remote_post')
            ->once()
            ->with('http://localhost:8001/api/stores/register/', \Mockery::on(function($args) {
                $body = json_decode($args['body'], true);
                return $body['wc_url'] === 'http://example.com' && $body['merchant_email'] === 'admin@example.com';
            }))
            ->andReturn(['response' => ['code' => 200], 'body' => json_encode($expectedResponse)]);

        Functions\when('wp_remote_retrieve_response_code')->justReturn(200);
        Functions\when('wp_remote_retrieve_body')->justReturn(json_encode($expectedResponse));

        $client = new ApiClient();
        $result = $client->register_store('http://example.com', 'admin@example.com');

        $this->assertIsArray($result);
        $this->assertEquals('store-uuid-456', $result['store_id']);
        $this->assertEquals('new_key_789', $result['api_key']);
    }

    public function testSyncCatalogSendsXApiKeyHeader() {
        $this->setupApiClientMocks('store_secret_api_key');

        Functions\expect('wp_remote_post')
            ->once()
            ->with('http://localhost:8001/api/stores/sync/', \Mockery::on(function($args) {
                return isset($args['headers']['X-API-Key']) && $args['headers']['X-API-Key'] === 'store_secret_api_key';
            }))
            ->andReturn(['response' => ['code' => 202], 'body' => json_encode(['task_id' => 'task-1'])]);

        Functions\when('wp_remote_retrieve_response_code')->justReturn(202);
        Functions\when('wp_remote_retrieve_body')->justReturn(json_encode(['task_id' => 'task-1']));

        $client = new ApiClient();
        $result = $client->sync_catalog([['id' => 1, 'name' => 'T-Shirt']], []);

        $this->assertIsArray($result);
        $this->assertEquals('task-1', $result['task_id']);
    }

    public function testGetChatHistorySendsQueryParams() {
        $this->setupApiClientMocks('key_abc');

        $expectedUrl = 'http://localhost:8001/api/stores/chat-history/?page=2&page_size=15';

        Functions\expect('wp_remote_get')
            ->once()
            ->with($expectedUrl, \Mockery::any())
            ->andReturn(['response' => ['code' => 200], 'body' => json_encode(['sessions' => [], 'total' => 0])]);

        Functions\when('wp_remote_retrieve_response_code')->justReturn(200);
        Functions\when('wp_remote_retrieve_body')->justReturn(json_encode(['sessions' => [], 'total' => 0]));

        $client = new ApiClient();
        $result = $client->get_chat_history(2, 15);

        $this->assertIsArray($result);
        $this->assertEquals(0, $result['total']);
    }

    public function testUpdateChatSessionLabelSendsPatch() {
        $this->setupApiClientMocks('key_abc');

        Functions\expect('wp_remote_request')
            ->once()
            ->with('http://localhost:8001/api/stores/chat-history/session-123/label', \Mockery::on(function($args) {
                $body = json_decode($args['body'], true);
                return $args['method'] === 'PATCH' && $body['lead_label'] === 'hot_lead';
            }))
            ->andReturn(['response' => ['code' => 200], 'body' => json_encode(['success' => true, 'lead_label' => 'hot_lead'])]);

        Functions\when('wp_remote_retrieve_response_code')->justReturn(200);
        Functions\when('wp_remote_retrieve_body')->justReturn(json_encode(['success' => true, 'lead_label' => 'hot_lead']));

        $client = new ApiClient();
        $result = $client->update_chat_session_label('session-123', 'hot_lead');

        $this->assertIsArray($result);
        $this->assertEquals('hot_lead', $result['lead_label']);
    }

    public function testExportChatHistoryReturnsCsvString() {
        $this->setupApiClientMocks('key_abc');

        $csvData = "session_id,customer_name,lead_label\n123,John Doe,lead";

        Functions\expect('wp_remote_get')
            ->once()
            ->with('http://localhost:8001/api/stores/chat-history/export?type=leads', \Mockery::any())
            ->andReturn(['response' => ['code' => 200], 'body' => $csvData]);

        Functions\when('wp_remote_retrieve_response_code')->justReturn(200);
        Functions\when('wp_remote_retrieve_body')->justReturn($csvData);

        $client = new ApiClient();
        $result = $client->export_chat_history('leads');

        $this->assertIsString($result);
        $this->assertStringContainsString('John Doe', $result);
    }

    public function testHandleApiErrorReturnsWpError() {
        $this->setupApiClientMocks('key_abc');

        $errorPayload = json_encode(['error' => 'Store not found']);

        Functions\expect('wp_remote_get')
            ->once()
            ->andReturn(['response' => ['code' => 404], 'body' => $errorPayload]);

        Functions\when('wp_remote_retrieve_response_code')->justReturn(404);
        Functions\when('wp_remote_retrieve_body')->justReturn($errorPayload);

        $client = new ApiClient();
        $result = $client->get_chat_history(1, 20);

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertEquals('Store not found', $result->get_error_message());
    }
}
