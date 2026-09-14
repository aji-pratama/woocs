<?php

namespace WooCS\Tests;

use PHPUnit\Framework\TestCase;
use Brain\Monkey\Functions;
use WooCS\WidgetRenderer;

class WidgetRendererTest extends TestCase {
    protected function tearDown(): void {
        \Brain\Monkey\tearDown();
        parent::tearDown();
    }

    public function testInjectFrontendBailsIfInAdminArea() {
        Functions\when('is_admin')->justReturn(true);

        ob_start();
        WidgetRenderer::inject_frontend();
        $output = ob_get_clean();

        $this->assertEmpty($output);
    }

    public function testInjectFrontendBailsIfWidgetDisabled() {
        Functions\when('is_admin')->justReturn(false);
        Functions\when('get_option')->alias(function($key, $default = '') {
            if ($key === 'woocs_widget_enabled') return '0';
            return $default;
        });

        ob_start();
        WidgetRenderer::inject_frontend();
        $output = ob_get_clean();

        $this->assertEmpty($output);
    }
}
