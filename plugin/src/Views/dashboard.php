<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$is_connected = !empty(get_option('woocs_store_id'));
?>
<div class="wrap woocs-wrap">
    <h1 class="wp-heading-inline">WooCS Dashboard</h1>
    <hr class="wp-header-end">

    <?php if (!$is_connected): ?>
        <div class="woocs-card">
            <div class="woocs-card-header">
                <h2>Connection Status</h2>
                <span class="woocs-badge woocs-badge-neutral">
                    <span class="dashicons dashicons-warning" style="font-size:14px;width:14px;height:14px;"></span>
                    Not connected
                </span>
            </div>
            <div class="woocs-card-body">
                <p>Your store is not connected to WooCS yet. Set up your credentials in Settings to get started.</p>
                <a href="<?php echo esc_url(admin_url('admin.php?page=woocs-settings')); ?>" class="button button-primary">
                    Go to Settings
                </a>
            </div>
        </div>
    <?php else: ?>
        <input type="hidden" id="woocs_dashboard_nonce" value="<?php echo esc_attr(wp_create_nonce('woocs_dashboard_nonce')); ?>">
        <input type="hidden" id="woocs_ajax_url" value="<?php echo esc_url(admin_url('admin-ajax.php')); ?>">

        <div class="woocs-card">
            <div class="woocs-card-header">
                <h2>Activity Overview</h2>
                <span id="woocs-dash-refresh-status" style="font-size:12px;color:#646970;">Auto-refreshes every 60s</span>
            </div>
            <div class="woocs-card-body">
                <div class="woocs-stat-grid">
                    <div class="woocs-stat-card">
                        <span class="woocs-stat-label">Chat Sessions</span>
                        <span class="woocs-stat-value is-blue" id="stat-sessions">—</span>
                    </div>
                    <div class="woocs-stat-card">
                        <span class="woocs-stat-label">Total Messages</span>
                        <span class="woocs-stat-value is-blue" id="stat-messages">—</span>
                    </div>
                    <div class="woocs-stat-card">
                        <span class="woocs-stat-label">Products Synced</span>
                        <span class="woocs-stat-value is-green" id="stat-products">—</span>
                    </div>
                    <div class="woocs-stat-card">
                        <span class="woocs-stat-label">Escalations</span>
                        <span class="woocs-stat-value is-red" id="stat-escalations">—</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="woocs-card">
            <div class="woocs-card-header">
                <h2>Quick Links</h2>
            </div>
            <div class="woocs-card-body">
                <p style="margin-top:0;">
                    <a href="<?php echo esc_url(admin_url('admin.php?page=woocs-sync')); ?>" class="button">
                        <span class="dashicons dashicons-update" style="margin-top:3px;"></span>
                        Sync Catalog
                    </a>
                    &nbsp;
                    <a href="<?php echo esc_url(admin_url('admin.php?page=woocs-faqs')); ?>" class="button">
                        <span class="dashicons dashicons-editor-help" style="margin-top:3px;"></span>
                        Manage FAQs
                    </a>
                    &nbsp;
                    <a href="<?php echo esc_url(admin_url('admin.php?page=woocs-preview')); ?>" class="button">
                        <span class="dashicons dashicons-visibility" style="margin-top:3px;"></span>
                        Preview Widget
                    </a>
                    &nbsp;
                    <a href="<?php echo esc_url(admin_url('admin.php?page=woocs-settings')); ?>" class="button">
                        <span class="dashicons dashicons-admin-settings" style="margin-top:3px;"></span>
                        Settings
                    </a>
                </p>
            </div>
        </div>

        <script>
        document.addEventListener('DOMContentLoaded', function() {
            var ajaxUrl = document.getElementById('woocs_ajax_url').value;
            var nonce   = document.getElementById('woocs_dashboard_nonce').value;
            var status  = document.getElementById('woocs-dash-refresh-status');

            function setVal(id, val) {
                var el = document.getElementById(id);
                if (el) el.textContent = (val !== undefined && val !== null) ? val : '—';
            }

            function fetchStats() {
                var fd = new FormData();
                fd.append('action', 'woocs_dashboard_stats');
                fd.append('nonce', nonce);

                fetch(ajaxUrl, { method: 'POST', body: fd })
                    .then(function(r) { return r.json(); })
                    .then(function(res) {
                        if (res.success && res.data) {
                            setVal('stat-sessions',    res.data.chat_sessions);
                            setVal('stat-messages',    res.data.total_messages);
                            setVal('stat-products',    res.data.products_synced);
                            setVal('stat-escalations', res.data.escalations);
                            if (status) {
                                var d = new Date();
                                status.textContent = 'Last updated: ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                            }
                        }
                    })
                    .catch(function(err) { console.error('Dashboard fetch error', err); });
            }

            fetchStats();
            setInterval(fetchStats, 60000);
        });
        </script>
    <?php endif; ?>
</div>
