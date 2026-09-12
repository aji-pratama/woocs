<?php

require_once dirname(__DIR__) . '/vendor/autoload.php';

use Brain\Monkey;

Monkey\setUp();

// Mock WP core functions commonly used in plugin
if (!function_exists('is_wp_error')) {
    function is_wp_error($thing) {
        return false;
    }
}
