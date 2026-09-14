<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$logs = get_option('woocs_sync_logs', []);
if (!is_array($logs)) $logs = [];
?>

    <input type="hidden" id="woocs_sync_nonce" value="<?php echo esc_attr(wp_create_nonce('woocs_sync_nonce')); ?>">
    <input type="hidden" id="woocs_ajax_url" value="<?php echo esc_url(admin_url('admin-ajax.php')); ?>">

    <div class="woocs-paywall-wrapper">
        <?php if (!empty($is_free_plan)): ?>
            <div class="woocs-paywall-overlay">
                <div class="woocs-paywall-card">
                    <span class="dashicons dashicons-lock"></span>
                    <h3>Upgrade to Pro</h3>
                    <p>Automatic catalog syncing is a Pro feature. Upgrade to enable seamless product updates, real-time inventory sync, and multi-channel support.</p>
                    <a href="<?php echo esc_url(admin_url('admin.php?page=woocs-settings&tab=billing')); ?>" class="button button-primary">View Pricing Plans</a>
                </div>
            </div>
        <?php endif; ?>

        <div class="woocs-paywall-content <?php echo !empty($is_free_plan) ? 'is-locked' : ''; ?>">
            <div class="woocs-card">
                <div class="woocs-card-header">
                    <h2>Catalog Summary</h2>
                    <button type="button" class="button button-primary" id="woocs-sync-now-btn" <?php echo !empty($is_free_plan) ? 'disabled' : ''; ?>>
                        <span class="dashicons dashicons-update woocs-btn-icon"></span>
                        Sync now
                    </button>
                </div>
                <div class="woocs-card-body">
                    <div class="woocs-sync-grid">
                        <div class="woocs-sync-item">
                            <span class="woocs-sync-label">Products</span>
                            <span class="woocs-sync-value" id="count-products">—</span>
                        </div>
                        <div class="woocs-sync-item">
                            <span class="woocs-sync-label">Variations</span>
                            <span class="woocs-sync-value" id="count-variations">—</span>
                        </div>
                        <div class="woocs-sync-item">
                            <span class="woocs-sync-label">FAQs</span>
                            <span class="woocs-sync-value" id="count-faqs">—</span>
                        </div>
                    </div>
                    <p class="woocs-sync-time">
                        <span class="dashicons dashicons-clock woocs-icon-clock"></span>
                        Last sync: <strong><span id="last-sync-time"><?php echo !empty($logs) ? esc_html(date('M j, Y H:i', strtotime($logs[0]['time']))) : 'Never'; ?></span></strong>
                    </p>
                </div>
            </div>

    <div class="woocs-card">
        <div class="woocs-card-header">
            <h2>Sync Log <span class="woocs-card-header-desc">(last <?php echo count($logs); ?> entries)</span></h2>
        </div>
        <div class="woocs-card-body p-0">
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th class="woocs-col-time">Time</th>
                        <th>Message</th>
                        <th class="woocs-col-status">Status</th>
                    </tr>
                </thead>
                <tbody id="woocs-sync-log">
                    <?php if (empty($logs)): ?>
                        <tr>
                            <td colspan="3" class="woocs-text-muted woocs-p-16">No sync activity recorded yet.</td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($logs as $log): ?>
                            <tr>
                                <td><?php echo esc_html(date('M j, Y H:i', strtotime($log['time']))); ?></td>
                                <td><?php echo esc_html($log['message']); ?></td>
                                <td>
                                    <?php if ($log['status'] === 'success'): ?>
                                        <span class="woocs-badge woocs-badge-success">
                                            <span class="dashicons dashicons-yes-alt woocs-icon-small"></span>
                                            Success
                                        </span>
                                    <?php elseif ($log['status'] === 'processing'): ?>
                                        <span class="woocs-badge woocs-badge-warning">
                                            Processing&hellip;
                                        </span>
                                    <?php else: ?>
                                        <span class="woocs-text-error">&#10007; Failed</span>
                                    <?php endif; ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
    </div> <!-- .woocs-paywall-content -->
    </div> <!-- .woocs-paywall-wrapper -->
<script>
document.addEventListener('DOMContentLoaded', function() {
    var syncBtn = document.getElementById('woocs-sync-now-btn');
    var ajaxUrl = document.getElementById('woocs_ajax_url').value;
    var nonce   = document.getElementById('woocs_sync_nonce').value;
    var currentStatus = 'idle';

    function updateUI(data) {
        if (data.logs_updated) {
            location.reload();
            return;
        }

        function setCount(id, val) {
            var el = document.getElementById(id);
            if (!el) return;
            if (val !== undefined && val !== null) {
                el.textContent = val;
            }
        }

        setCount('count-products',   data.products_count);
        setCount('count-variations', data.variations_count);
        setCount('count-faqs',       data.faqs_count);

        if (data.status === 'processing') {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<span class="dashicons dashicons-update woocs-btn-icon"></span> Syncing&hellip;';
            currentStatus = 'processing';
            setTimeout(fetchStatus, 3000);
        } else {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<span class="dashicons dashicons-update woocs-btn-icon"></span> Sync now';
            if (currentStatus === 'processing') {
                currentStatus = 'success';
                pushLog('success', 'Catalog synced successfully');
            }
        }
    }

    function pushLog(status, message) {
        var fd = new FormData();
        fd.append('action', 'woocs_save_sync_log');
        fd.append('nonce', nonce);
        fd.append('status', status);
        fd.append('message', message);

        fetch(ajaxUrl, { method: 'POST', body: fd })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.success) location.reload();
            })
            .catch(function(err) { console.error(err); });
    }

    function fetchStatus() {
        var fd = new FormData();
        fd.append('action', 'woocs_sync_status');
        fd.append('nonce', nonce);

        fetch(ajaxUrl, { method: 'POST', body: fd })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.success && res.data) updateUI(res.data);
            })
            .catch(function(err) { console.error('Status fetch error', err); });
    }

    syncBtn.addEventListener('click', function() {
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<span class="dashicons dashicons-update woocs-btn-icon"></span> Syncing&hellip;';

        var fd = new FormData();
        fd.append('action', 'woocs_sync_now');
        fd.append('nonce', nonce);

        fetch(ajaxUrl, { method: 'POST', body: fd })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.success) {
                    pushLog('processing', 'Catalog Sync Initiated');
                } else {
                    pushLog('failed', 'Sync Failed');
                    syncBtn.disabled = false;
                    syncBtn.innerHTML = '<span class="dashicons dashicons-update woocs-btn-icon"></span> Sync now';
                }
            })
            .catch(function(err) {
                console.error(err);
                pushLog('failed', 'Network Error');
                syncBtn.disabled = false;
                syncBtn.innerHTML = '<span class="dashicons dashicons-update woocs-btn-icon"></span> Sync now';
            });
    });

    fetchStatus();
});
</script>
