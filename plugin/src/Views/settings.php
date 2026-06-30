<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

// Mock states for PoC
$is_connected = !empty(get_option('woocs_store_id'));
$api_key = get_option('woocs_api_key', '');

$error_msg = get_transient('woocs_admin_error');
$success_msg = get_transient('woocs_admin_success');
if ($error_msg) delete_transient('woocs_admin_error');
if ($success_msg) delete_transient('woocs_admin_success');
?>
<div class="wrap woocs-wrap">
    <h1>WooCS &rsaquo; Settings</h1>

    <?php if ($error_msg): ?>
        <div class="notice notice-error is-dismissible"><p><?php echo esc_html($error_msg); ?></p></div>
    <?php endif; ?>
    <?php if ($success_msg): ?>
        <div class="notice notice-success is-dismissible"><p><?php echo esc_html($success_msg); ?></p></div>
    <?php endif; ?>

    <?php if (!$is_connected): ?>
        <div class="woocs-card woocs-connect-card">
            <div class="woocs-card-header">
                <h2>Connection</h2>
                <span class="woocs-badge woocs-badge-neutral"><span class="woocs-dot"></span> Not connected</span>
            </div>
            <div class="woocs-card-body">
                <p>Connect your store to start automating support.<br>
                Free 14-day trial — no credit card required.</p>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:inline;">
                    <?php wp_nonce_field('woocs_save_settings'); ?>
                    <input type="hidden" name="action" value="woocs_save_settings">
                    <button type="submit" class="button button-primary button-hero">Connect to WooCS</button>
                </form>
                
                <hr class="woocs-divider">
                
                <p>Already have an API key? <a href="#" onclick="document.getElementById('manual-key-form').style.display='block'; return false;">Enter key manually &triangledown;</a></p>
                <div id="manual-key-form" style="display: none;">
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
                    <span class="woocs-badge woocs-badge-success"><span class="woocs-dot"></span> Connected</span>
                </div>
                <div class="woocs-card-body">
                    <table class="form-table">
                        <tr>
                            <th scope="row">Store ID</th>
                            <td><code><?php echo esc_html(get_option('woocs_store_id', 'xxxxxxxx-xxxx-xxxx')); ?></code></td>
                        </tr>
                        <tr>
                            <th scope="row">API Key</th>
                            <td>
                                <div class="woocs-input-group">
                                    <input type="password" value="<?php echo esc_attr($api_key); ?>" class="regular-text" readonly id="woocs-api-key">
                                    <button type="button" class="button woocs-copy-btn" data-target="woocs-api-key">Copy</button>
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>
            </div>

            <div class="woocs-card">
                <div class="woocs-card-header">
                    <h2>WooCommerce Credentials</h2>
                </div>
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
                            <th scope="row">Email</th>
                            <td><input type="email" name="woocs_merchant_email" value="<?php echo esc_attr(get_option('woocs_merchant_email', get_option('admin_email'))); ?>" class="regular-text"></td>
                        </tr>
                    </table>
                </div>
            </div>

            <div class="woocs-card">
                <div class="woocs-card-header">
                    <h2>Widget Settings</h2>
                </div>
                <div class="woocs-card-body">
                    <table class="form-table">
                        <tr>
                            <th scope="row">Enable Widget</th>
                            <td>
                                <label>
                                    <input type="checkbox" name="woocs_widget_enabled" value="1" <?php checked(get_option('woocs_widget_enabled', '1'), '1'); ?>>
                                    Show chat widget on storefront
                                </label>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">Position</th>
                            <td>
                                <fieldset>
                                    <label><input type="radio" name="woocs_widget_position" value="bottom-right" <?php checked(get_option('woocs_widget_position', 'bottom-right'), 'bottom-right'); ?>> Bottom-right</label><br>
                                    <label><input type="radio" name="woocs_widget_position" value="bottom-left" <?php checked(get_option('woocs_widget_position', 'bottom-right'), 'bottom-left'); ?>> Bottom-left</label>
                                </fieldset>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">Product Context</th>
                            <td>
                                <label>
                                    <input type="checkbox" name="woocs_product_context_enabled" value="1" <?php checked(get_option('woocs_product_context_enabled', '1'), '1'); ?>>
                                    Aware of product pages (recommended)<br>
                                    <span class="description" style="font-weight:normal; font-size:13px; color:#666;">When enabled, the assistant gives more specific answers about the product the customer is currently viewing.</span>
                                </label>
                            </td>
                        </tr>
                    </table>
                </div>
            </div>

            <p class="submit">
                <button type="submit" class="button button-primary">Save settings</button>
                <a href="<?php echo esc_url(wp_nonce_url(admin_url('admin-post.php?action=woocs_disconnect_store'), 'woocs_disconnect_store')); ?>" class="button woocs-text-danger" style="float: right;">Disconnect store</a>
            </p>
        </form>
    <?php endif; ?>
</div>
