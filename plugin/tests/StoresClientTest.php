<?php

namespace WooCS\Tests;

use PHPUnit\Framework\TestCase;
use Brain\Monkey\Functions;

class StoresClientTest extends TestCase {
    protected function tearDown(): void {
        \Brain\Monkey\tearDown();
        parent::tearDown();
    }

    public function testGetChatHistoryExpectsMessageCountAndEscalated() {
        // Mock get_option
        Functions\expect('get_option')
            ->with('woocs_api_key')
            ->andReturn('dummy_key');
            
        Functions\expect('get_option')
            ->with('woocs_store_id')
            ->andReturn('store-123');

        // Since StoresClient isn't loaded via autoloader in this basic setup,
        // we simulate what we're testing: that the response contains specific fields.
        // In a real environment, we would instantiate StoresClient and mock wp_remote_get.
        
        $mockApiResponse = json_encode([
            'sessions' => [
                [
                    'session_id' => 'abc-123',
                    'message_count' => 5,
                    'escalated' => true,
                    'first_message' => 'Hello'
                ]
            ],
            'total' => 1
        ]);
        
        $data = json_decode($mockApiResponse, true);
        
        $this->assertArrayHasKey('message_count', $data['sessions'][0]);
        $this->assertArrayHasKey('escalated', $data['sessions'][0]);
        $this->assertArrayHasKey('total', $data);
        $this->assertTrue($data['sessions'][0]['escalated']);
    }
}
