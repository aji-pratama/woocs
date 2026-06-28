<?php
declare(strict_types=1);

namespace WooCS;

class WidgetRenderer {

    /**
     * Initialize the widget renderer and hook into wp_footer.
     */
    public static function init() {
        add_action('wp_footer', [self::class, 'inject_frontend']);
    }

    /**
     * Hook callback for injecting the widget into the storefront footer.
     */
    public static function inject_frontend() {
        // Exclude on order confirmation page (is_order_received_page) and admin
        if (is_admin() || (function_exists('is_wc_endpoint_url') && is_wc_endpoint_url('order-received'))) {
            return;
        }

        $store_id = get_option('woocs_store_id');
        $widget_enabled = get_option('woocs_widget_enabled', '1');
        
        if ($widget_enabled !== '1') {
            return;
        }

        // Output the widget HTML
        self::render($store_id ?: 'test-store-id');
    }

    /**
     * Core method to render the widget DOM and load React/Vite assets.
     * Can be called directly (e.g. from the Preview page).
     *
     * @param string $store_id The connected store ID or a test fallback.
     */
    public static function render(string $store_id) {
        $api_url = get_option('woocs_api_url', 'http://localhost:8000'); // Default to local for dev
        $store_name = get_bloginfo('name');

        echo '<!-- WooCS Widget Injected by PHP -->';
        echo '<div id="woocs-widget-root"></div>';
        
        $css_url = '';
        if (file_exists(WOOCS_PLUGIN_DIR . 'assets/woocs-widget.css')) {
            $css_url = esc_url(WOOCS_PLUGIN_URL . 'assets/woocs-widget.css');
        }

        echo '<script>
            window.WooCS = ' . wp_json_encode([
            'store_id' => $store_id,
            'api_url' => $api_url,
            'store_name' => $store_name,
            'css_url' => $css_url,
        ]) . ';
        </script>';

        // Load static build if it exists
        if (file_exists(WOOCS_PLUGIN_DIR . 'assets/woocs-widget.js')) {
            echo '<script type="module" src="' . esc_url(WOOCS_PLUGIN_URL . 'assets/woocs-widget.js') . '"></script>';
        } else {
            // Fallback to Vite Dev Server for local development
            echo '<script type="module">
import RefreshRuntime from "http://localhost:5173/@react-refresh"
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
</script>';
            echo '<script type="module" src="http://localhost:5173/@vite/client" onerror="console.error(\'[WooCS] Failed to load Vite Client. Is make dev-widget running?\')"></script>';
            echo '<script type="module" src="http://localhost:5173/src/main.tsx" onerror="console.error(\'[WooCS] Failed to load main.tsx.\')"></script>';
        }
    }
}
