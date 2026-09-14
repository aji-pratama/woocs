<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$is_connected = !empty(get_option('woocs_store_id'));
$api_key      = get_option('woocs_api_key', '');

$error_msg   = get_transient('woocs_admin_error');
$success_msg = get_transient('woocs_admin_success');
if ($error_msg)   delete_transient('woocs_admin_error');
if ($success_msg) delete_transient('woocs_admin_success');

$tabs = [
    'connection' => 'Connection',
    'billing'    => 'Billing',
    'advanced'   => 'Advanced',
];
$active_tab = isset($_GET['tab']) ? sanitize_key($_GET['tab']) : 'connection';
$active_tab = array_key_exists($active_tab, $tabs) ? $active_tab : 'connection';
?>
<div class="wrap woocs-wrap">
    <div class="woocs-page-header">
        <h1 class="wp-heading-inline">Settings</h1>
    </div>
    <hr class="wp-header-end">

    <?php if ($error_msg): ?>
        <div class="notice notice-error is-dismissible"><p><?php echo esc_html($error_msg); ?></p></div>
    <?php endif; ?>
    <?php if ($success_msg): ?>
        <div class="notice notice-success is-dismissible"><p><?php echo esc_html($success_msg); ?></p></div>
    <?php endif; ?>

    <div class="woocs-page-toolbar">
        <p class="description">Configure your store connection, subscription plan, and integration settings.</p>
    </div>

    <!-- Tabs -->
    <nav class="nav-tab-wrapper woocs-nav-tab-wrapper">
        <?php foreach ($tabs as $slug => $label): ?>
            <a href="<?php echo esc_url(add_query_arg('tab', $slug, admin_url('admin.php?page=woocs-settings'))); ?>"
               class="nav-tab <?php echo $active_tab === $slug ? 'nav-tab-active' : ''; ?>">
                <?php echo esc_html($label); ?>
            </a>
        <?php endforeach; ?>
    </nav>

    <?php if ($active_tab === 'connection'): ?>
    <!-- ===== CONNECTION TAB ===== -->
    <?php if (!$is_connected): ?>
        <div class="woocs-card">
            <div class="woocs-card-header"><h2>Connect your store</h2></div>
            <div class="woocs-card-body">
                <p>Connect your store to start automating support.<br>Free 14-day trial — no credit card required.</p>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:inline;">
                    <?php wp_nonce_field('woocs_save_settings'); ?>
                    <input type="hidden" name="action" value="woocs_save_settings">
                    <button type="submit" class="button button-primary button-hero">Connect to WooCS</button>
                </form>
                <hr class="woocs-divider">
                <p>Already have an API key?
                    <a href="#" onclick="document.getElementById('manual-key-form').style.display='block';return false;">Enter key manually &#9660;</a>
                </p>
                <div id="manual-key-form" style="display:none;">
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                        <?php wp_nonce_field('woocs_save_settings'); ?>
                        <input type="hidden" name="action" value="woocs_save_settings">
                        <input type="text" name="woocs_api_key" class="regular-text" placeholder="Enter API Key" required>
                        <button type="submit" class="button">Connect</button>
                    </form>
                </div>
            </div>
        </div>
    <?php else: ?>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <?php wp_nonce_field('woocs_save_settings'); ?>
            <input type="hidden" name="action" value="woocs_save_settings">
            <div class="woocs-card">
                <div class="woocs-card-header">
                    <h2>Connection</h2>
                    <span class="woocs-badge woocs-badge-success">
                        <span class="dashicons dashicons-yes-alt" style="font-size:14px;width:14px;height:14px;"></span>
                        Connected
                    </span>
                </div>
                <div class="woocs-card-body">
                    <table class="form-table">
                        <tr><th scope="row">Store</th><td><?php echo esc_html(get_option('woocs_wc_url', get_site_url())); ?></td></tr>
                    </table>
                    <details class="woocs-diagnostics">
                        <summary>Connection details</summary>
                        <p>Store ID: <code><?php echo esc_html(get_option('woocs_store_id', '—')); ?></code></p>
                        <div class="woocs-input-group">
                            <input type="password" value="<?php echo esc_attr($api_key); ?>" class="regular-text" readonly id="woocs-api-key">
                            <button type="button" class="button woocs-copy-btn" data-target="woocs-api-key">Copy API key</button>
                        </div>
                    </details>
                    <p>
                        <a href="<?php echo esc_url(wp_nonce_url(admin_url('admin-post.php?action=woocs_disconnect_store'), 'woocs_disconnect_store')); ?>"
                           class="button" style="color:#d63638;"
                           onclick="return confirm('Disconnect this store? The widget will stop working.');">
                            Disconnect store
                        </a>
                    </p>
                </div>
            </div>
        </form>
    <?php endif; ?>



    <?php elseif ($active_tab === 'billing'): ?>
        <?php require WOOCS_PLUGIN_DIR . 'src/Views/billing.php'; ?>

    <?php elseif ($active_tab === 'advanced'): ?>
    <!-- ===== ADVANCED TAB ===== -->
    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
        <?php wp_nonce_field('woocs_save_settings'); ?>
        <input type="hidden" name="action" value="woocs_save_settings">
        <input type="hidden" name="woocs_settings_tab" value="advanced">

        <div class="woocs-card">
            <div class="woocs-card-header"><h2>Backend & API Configuration</h2></div>
            <div class="woocs-card-body">
                <table class="form-table">
                    <tr>
                        <th scope="row">API Server URL</th>
                        <td>
                            <input type="url" name="woocs_api_url" value="<?php echo esc_attr(get_option('woocs_api_url', 'http://host.containers.internal:8001')); ?>" class="regular-text" placeholder="http://host.containers.internal:8001">
                            <p class="description">URL of the WooCS Hono backend (use <code>http://host.containers.internal:8001</code> for local Podman dev, or your Cloudflare Worker URL).</p>
                        </td>
                    </tr>
                </table>
            </div>
        </div>

        <div class="woocs-card">
            <div class="woocs-card-header"><h2>WooCommerce Credentials</h2></div>
            <div class="woocs-card-body">
                <table class="form-table">
                    <tr>
                        <th scope="row">Store URL</th>
                        <td><input type="url" name="woocs_wc_url" value="<?php echo esc_attr(get_option('woocs_wc_url', get_site_url())); ?>" class="regular-text"></td>
                    </tr>
                    <tr>
                        <th scope="row">Consumer Key</th>
                        <td><input type="text" name="woocs_wc_consumer_key" value="<?php echo esc_attr(get_option('woocs_wc_consumer_key')); ?>" class="regular-text" placeholder="ck_..."></td>
                    </tr>
                    <tr>
                        <th scope="row">Consumer Secret</th>
                        <td><input type="password" name="woocs_wc_consumer_secret" value="<?php echo esc_attr(get_option('woocs_wc_consumer_secret')); ?>" class="regular-text" placeholder="cs_..."></td>
                    </tr>
                    <tr>
                        <th scope="row">Merchant Email</th>
                        <td><input type="email" name="woocs_merchant_email" value="<?php echo esc_attr(get_option('woocs_merchant_email', get_option('admin_email'))); ?>" class="regular-text"></td>
                    </tr>
                </table>
            </div>
        </div>

        <div class="woocs-card">
            <div class="woocs-card-header"><h2>AI Behavior</h2></div>
            <div class="woocs-card-body">
                <table class="form-table">
                    <tr>
                        <th scope="row">Product Context</th>
                        <td>
                            <label>
                                <input type="checkbox" name="woocs_product_context_enabled" value="1" <?php checked(get_option('woocs_product_context_enabled', '1'), '1'); ?>>
                                Product-aware answers (recommended)
                            </label>
                            <p class="description">When enabled, the assistant gives more specific answers about the product the customer is currently viewing.</p>
                        </td>
                    </tr>
                </table>
            </div>
        </div>

        <p class="submit"><button type="submit" class="button button-primary">Save Advanced Settings</button></p>
    </form>
    <?php endif; ?>
</div>
