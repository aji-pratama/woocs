<?php

namespace WooCS\Tests;

use PHPUnit\Framework\TestCase;
use Brain\Monkey\Functions;
use WooCS\AdminMenu;

class AdminMenuTest extends TestCase {
    protected function setUp(): void {
        parent::setUp();
        \Brain\Monkey\setUp();
    }

    protected function tearDown(): void {
        \Brain\Monkey\tearDown();
        parent::tearDown();
    }

    public function testMenuRegistrationHooks() {
        Functions\expect('add_action')
            ->with('admin_menu', \Mockery::type('array'))
            ->once();

        Functions\expect('add_action')
            ->with('admin_enqueue_scripts', \Mockery::type('array'))
            ->once();

        Functions\expect('add_action')
            ->with('admin_post_woocs_save_settings', \Mockery::type('array'))
            ->once();

        Functions\expect('add_action')
            ->with('admin_post_woocs_disconnect_store', \Mockery::type('array'))
            ->once();

        Functions\expect('add_action')
            ->with('admin_post_woocs_start_checkout', \Mockery::type('array'))
            ->once();

        Functions\expect('add_action')
            ->with('admin_post_woocs_open_billing_portal', \Mockery::type('array'))
            ->once();

        Functions\expect('add_action')
            ->with('admin_post_woocs_export_chat', \Mockery::type('array'))
            ->once();

        new AdminMenu();
        $this->assertTrue(true);
    }

    public function testDisconnectStoreClearsOptions() {
        Functions\when('current_user_can')->justReturn(true);
        Functions\when('check_admin_referer')->justReturn(true);

        Functions\expect('delete_option')->with('woocs_store_id')->once();
        Functions\expect('delete_option')->with('woocs_api_key')->once();
        Functions\expect('set_transient')->with('woocs_admin_success', \Mockery::type('string'), 45)->once();
        Functions\expect('admin_url')->with('admin.php?page=woocs-settings')->andReturn('http://example.com/wp-admin/admin.php?page=woocs-settings');
        Functions\expect('wp_safe_redirect')->once()->andThrow(new \Exception('REDIRECT_EXIT'));

        $menu = new AdminMenu();
        try {
            $menu->handle_disconnect_store();
        } catch (\Exception $e) {
            $this->assertEquals('REDIRECT_EXIT', $e->getMessage());
        }
    }
}
