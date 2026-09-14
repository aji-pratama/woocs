<?php

require_once dirname(__DIR__) . '/vendor/autoload.php';

use Brain\Monkey;

Monkey\setUp();

// Mock WP core classes & functions commonly used in plugin
if (!class_exists('WP_Error')) {
    class WP_Error {
        public $code;
        public $message;
        public $data;
        public function __construct($code = '', $message = '', $data = '') {
            $this->code = $code;
            $this->message = $message;
            $this->data = $data;
        }
        public function get_error_message() { return $this->message; }
        public function get_error_code() { return $this->code; }
        public function get_error_data() { return $this->data; }
    }
}

if (!function_exists('is_wp_error')) {
    function is_wp_error($thing) {
        return $thing instanceof \WP_Error;
    }
}

if (!function_exists('wp_json_encode')) {
    function wp_json_encode($data, $options = 0, $depth = 512) {
        return json_encode($data, $options, $depth);
    }
}

if (!function_exists('add_query_arg')) {
    function add_query_arg($args, $url = '') {
        $query = http_build_query($args);
        $sep = strpos($url, '?') !== false ? '&' : '?';
        return $url . $sep . $query;
    }
}
