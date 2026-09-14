<?php

namespace WooCS\Tests;

use PHPUnit\Framework\TestCase;
use Brain\Monkey\Functions;
use WooCS\SyncService;

class SyncServiceTest extends TestCase {
    protected function tearDown(): void {
        \Brain\Monkey\tearDown();
        parent::tearDown();
    }

    public function testGetFaqsUsesCustomFaqsWhenConfigured() {
        Functions\when('get_option')->alias(function($key, $default = '') {
            if ($key === 'woocs_api_url') return 'http://localhost:8001';
            if ($key === 'woocs_api_key') return 'test_key';
            if ($key === 'woocs_faqs') return [
                ['question' => 'Berapa lama pengiriman?', 'answer' => '2-3 hari kerja.']
            ];
            return $default;
        });

        Functions\expect('wp_remote_post')
            ->once()
            ->with(\Mockery::any(), \Mockery::on(function($args) {
                $body = json_decode($args['body'], true);
                return isset($body['faqs']) && count($body['faqs']) === 1 && $body['faqs'][0]['question'] === 'Berapa lama pengiriman?';
            }))
            ->andReturn(['response' => ['code' => 202], 'body' => json_encode(['task_id' => 'sync-123'])]);

        Functions\when('wp_remote_retrieve_response_code')->justReturn(202);
        Functions\when('wp_remote_retrieve_body')->justReturn(json_encode(['task_id' => 'sync-123']));

        $result = SyncService::run();
        $this->assertIsArray($result);
        $this->assertEquals('sync-123', $result['task_id']);
    }

    public function testGetProductsFallsBackToDefaultFaqsWhenNoCustomFaqs() {
        Functions\when('get_option')->alias(function($key, $default = '') {
            if ($key === 'woocs_api_url') return 'http://localhost:8001';
            if ($key === 'woocs_api_key') return 'test_key';
            if ($key === 'woocs_faqs') return [];
            return $default;
        });

        Functions\expect('wp_remote_post')
            ->once()
            ->with(\Mockery::any(), \Mockery::on(function($args) {
                $body = json_decode($args['body'], true);
                return empty($body['products']) && count($body['faqs']) === 2 && $body['faqs'][0]['question'] === 'What is your return policy?';
            }))
            ->andReturn(['response' => ['code' => 202], 'body' => json_encode(['task_id' => 'default-faq-sync'])]);

        Functions\when('wp_remote_retrieve_response_code')->justReturn(202);
        Functions\when('wp_remote_retrieve_body')->justReturn(json_encode(['task_id' => 'default-faq-sync']));

        $result = SyncService::run();
        $this->assertIsArray($result);
        $this->assertEquals('default-faq-sync', $result['task_id']);
    }
}
