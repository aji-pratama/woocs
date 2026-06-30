<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$is_connected = !empty(get_option('woocs_store_id'));
$api_key      = get_option('woocs_api_key', '');

$error_msg   = get_transient('woocs_admin_error');
$success_msg = get_transient('woocs_admin_success');
if ($error_msg)   delete_transient('woocs_admin_error');
if ($success_msg) delete_transient('woocs_admin_success');

$active_tab = isset($_GET['tab']) ? sanitize_key($_GET['tab']) : 'connection';
$tabs = [
    'connection' => 'Connection',
    'widget'     => 'Widget',
    'prechat'    => 'Pre-chat Form',
    'advanced'   => 'Advanced',
];
?>
<div class="wrap woocs-wrap">
    <h1>WooCS &rsaquo; Settings</h1>

    <?php if ($error_msg): ?>
        <div class="notice notice-error is-dismissible"><p><?php echo esc_html($error_msg); ?></p></div>
    <?php endif; ?>
    <?php if ($success_msg): ?>
        <div class="notice notice-success is-dismissible"><p><?php echo esc_html($success_msg); ?></p></div>
    <?php endif; ?>

    <!-- Tabs -->
    <nav class="nav-tab-wrapper" style="margin-bottom:0;">
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
                        <tr>
                            <th scope="row">Store ID</th>
                            <td><code><?php echo esc_html(get_option('woocs_store_id', '—')); ?></code></td>
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

    <?php elseif ($active_tab === 'widget'): ?>
    <!-- ===== WIDGET TAB ===== -->
    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
        <?php wp_nonce_field('woocs_save_settings'); ?>
        <input type="hidden" name="action" value="woocs_save_settings">
        <input type="hidden" name="woocs_settings_tab" value="widget">

        <div class="woocs-card">
            <div class="woocs-card-header"><h2>Widget Appearance</h2></div>
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
                                <label><input type="radio" name="woocs_widget_position" value="bottom-left"  <?php checked(get_option('woocs_widget_position', 'bottom-right'), 'bottom-left'); ?>>  Bottom-left</label>
                            </fieldset>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Primary Color</th>
                        <td>
                            <input type="color" name="woocs_widget_primary_color"
                                   value="<?php echo esc_attr(get_option('woocs_widget_primary_color', '#2271b1')); ?>"
                                   style="width:48px;height:32px;padding:2px;cursor:pointer;">
                            <p class="description">Sets the color of the chat button and message bubbles.</p>
                        </td>
                    </tr>
                </table>
            </div>
        </div>
        <p class="submit"><button type="submit" class="button button-primary">Save Widget Settings</button></p>
    </form>

    <?php elseif ($active_tab === 'prechat'): ?>
    <!-- ===== PRE-CHAT FORM TAB ===== -->
    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
        <?php wp_nonce_field('woocs_save_settings'); ?>
        <input type="hidden" name="action" value="woocs_save_settings">
        <input type="hidden" name="woocs_settings_tab" value="prechat">

        <div class="woocs-card">
            <div class="woocs-card-header"><h2>Pre-chat Form</h2></div>
            <div class="woocs-card-body">
                <table class="form-table">
                    <tr>
                        <th scope="row">Enable Form</th>
                        <td>
                            <label>
                                <input type="checkbox" name="woocs_prechat_enabled" value="1" id="woocs-prechat-toggle"
                                       <?php checked(get_option('woocs_prechat_enabled', '0'), '1'); ?>>
                                Show a form before the first message to collect customer info
                            </label>
                        </td>
                    </tr>
                </table>
                <hr class="woocs-divider">
                <div id="woocs-prechat-fields-section">
                    <h3 style="margin-top:0;">Fields</h3>
                    <table class="wp-list-table widefat fixed striped" style="max-width:600px;">
                        <thead>
                            <tr>
                                <th style="width:140px;">Field</th>
                                <th style="width:100px;text-align:center;">Enabled</th>
                                <th style="width:100px;text-align:center;">Required</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php
                            $fields = [
                                'name'  => 'Name',
                                'email' => 'Email',
                                'phone' => 'Phone',
                            ];
                            foreach ($fields as $key => $label):
                                $enabled  = get_option("woocs_prechat_{$key}_enabled",  $key === 'email' ? '1' : '0');
                                $required = get_option("woocs_prechat_{$key}_required", $key === 'email' ? '1' : '0');
                            ?>
                            <tr>
                                <td><strong><?php echo esc_html($label); ?></strong></td>
                                <td style="text-align:center;">
                                    <input type="checkbox" name="woocs_prechat_<?php echo esc_attr($key); ?>_enabled" value="1" <?php checked($enabled, '1'); ?>>
                                </td>
                                <td style="text-align:center;">
                                    <input type="checkbox" name="woocs_prechat_<?php echo esc_attr($key); ?>_required" value="1" <?php checked($required, '1'); ?>>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                    <p class="description" style="margin-top:8px;">Fields that are enabled but not required will show as optional in the form.</p>
                </div>
            </div>
        </div>
        <p class="submit"><button type="submit" class="button button-primary">Save Pre-chat Settings</button></p>
    </form>

    <?php elseif ($active_tab === 'advanced'): ?>
    <!-- ===== ADVANCED TAB ===== -->
    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
        <?php wp_nonce_field('woocs_save_settings'); ?>
        <input type="hidden" name="action" value="woocs_save_settings">
        <input type="hidden" name="woocs_settings_tab" value="advanced">

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
