<?php
declare(strict_types=1);

namespace WooCS;

class SyncService {

    public static function run(): array|\WP_Error {
        // Fetch Products
        $products_payload = self::get_products();
        
        // Fetch FAQs
        $faqs_payload = self::get_faqs();

        $client = new ApiClient();
        return $client->sync_catalog($products_payload, $faqs_payload);
    }

    private static function get_products(): array {
        if (!function_exists('wc_get_products')) {
            return [];
        }

        // For PoC, let's limit to 100 products to avoid timeout
        $products = wc_get_products(['limit' => 100, 'status' => 'publish']);
        $payload = [];

        foreach ($products as $product) {
            $categories = array_map(function($term) {
                return $term->name;
            }, wp_get_post_terms($product->get_id(), 'product_cat'));

            $tags = array_map(function($term) {
                return $term->name;
            }, wp_get_post_terms($product->get_id(), 'product_tag'));

            $variations_payload = [];
            if ($product->is_type('variable')) {
                $variations = $product->get_available_variations();
                foreach ($variations as $var) {
                    $var_obj = wc_get_product($var['variation_id']);
                    if (!$var_obj) continue;
                    
                    $variations_payload[] = [
                        'wc_variation_id' => $var['variation_id'],
                        'attributes' => $var['attributes'],
                        'stock_quantity' => $var_obj->get_manage_stock() ? $var_obj->get_stock_quantity() : null,
                        'price' => (float) $var_obj->get_price(),
                    ];
                }
            }

            $payload[] = [
                'wc_id' => $product->get_id(),
                'name' => $product->get_name(),
                'description' => $product->get_short_description() ?: $product->get_description(),
                'price' => $product->get_price() !== '' ? (float) $product->get_price() : null,
                'stock_status' => $product->get_stock_status(),
                'stock_quantity' => $product->get_manage_stock() ? $product->get_stock_quantity() : null,
                'categories' => $categories,
                'tags' => $tags,
                'variations' => $variations_payload,
            ];
        }

        return $payload;
    }

    private static function get_faqs(): array {
        global $wpdb;
        $table_name = $wpdb->prefix . 'woocs_faqs';
        
        // For PoC: Check if table exists, if not return dummy
        if ($wpdb->get_var("SHOW TABLES LIKE '$table_name'") != $table_name) {
            return [
                ['question' => 'What is your return policy?', 'answer' => 'We accept returns within 30 days.'],
                ['question' => 'How long is shipping?', 'answer' => 'Standard shipping takes 3-5 business days.']
            ];
        }

        $results = $wpdb->get_results("SELECT question, answer FROM $table_name", ARRAY_A);
        return $results ?: [];
    }
}
