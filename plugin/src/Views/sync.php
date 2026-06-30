<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$logs = get_option('woocs_sync_logs', []);
if (!is_array($logs)) $logs = [];
?>
<div class="wrap woocs-wrap">
    <h1 class="wp-heading-inline">WooCS &rsaquo; Sync</h1>
    <hr class="wp-header-end">

    <input type="hidden" id="woocs_sync_nonce" value="<?php echo esc_attr(wp_create_nonce('woocs_sync_nonce')); ?>">
    <input type="hidden" id="woocs_ajax_url" value="<?php echo esc_url(admin_url('admin-ajax.php')); ?>">

    <div class="woocs-card">
        <div class="woocs-card-header">
            <h2>Catalog Summary</h2>
            <button type="button" class="button button-primary" id="woocs-sync-now-btn">
                <span class="dashicons dashicons-update" style="margin-top:3px;"></span>
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
                <div class="woocs-sync-item">
                    <span class="woocs-sync-label">Orders API</span>
                    <span class="woocs-sync-value">
                        Live&nbsp;<span class="dashicons dashicons-yes-alt woocs-text-success" style="font-size:18px;width:18px;height:18px;"></span>
                    </span>
                </div>
            </div>
            <p class="woocs-sync-time">
                Last sync: <strong><span id="last-sync-time"><?php echo !empty($logs) ? esc_html(date('M j, Y H:i', strtotime($logs[0]['time']))) : 'Never'; ?></span></strong>
            </p>
        </div>
    </div>

    <div class="woocs-card">
        <div class="woocs-card-header">
            <h2>Sync Log <span style="font-size:12px;font-weight:400;color:#646970;">(last <?php echo count($logs); ?> entries)</span></h2>
        </div>
        <div class="woocs-card-body p-0">
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th style="width:170px;">Time</th>
                        <th>Message</th>
                        <th style="width:110px;">Status</th>
                    </tr>
                </thead>
                <tbody id="woocs-sync-log">
                    <?php if (empty($logs)): ?>
                        <tr>
                            <td colspan="3" class="woocs-text-muted" style="padding:16px;">No sync activity recorded yet.</td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($logs as $log): ?>
                            <tr>
                                <td><?php echo esc_html(date('M j, Y H:i', strtotime($log['time']))); ?></td>
                                <td><?php echo esc_html($log['message']); ?></td>
                                <td>
                                    <?php if ($log['status'] === 'success'): ?>
                                        <span class="woocs-badge woocs-badge-success">
                                            <span class="dashicons dashicons-yes-alt" style="font-size:13px;width:13px;height:13px;"></span>
                                            Success
                                        </span>
                                    <?php elseif ($log['status'] === 'processing'): ?>
                                        <span class="woocs-badge woocs-badge-warning">
                                            Processing&hellip;
                                        </span>
                                    <?php else: ?>
                                        <span style="color:#d63638;font-weight:600;">&#10007; Failed</span>
                                    <?php endif; ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

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
            if (val !== undefined) {
                el.innerHTML = val + ' <span class="dashicons dashicons-yes-alt woocs-text-success" style="font-size:16px;width:16px;height:16px;vertical-align:middle;"></span>';
            }
        }

        setCount('count-products',   data.products_count);
        setCount('count-variations', data.variations_count);
        setCount('count-faqs',       data.faqs_count);

        if (data.status === 'processing') {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<span class="dashicons dashicons-update" style="margin-top:3px;"></span> Syncing&hellip;';
            currentStatus = 'processing';
            setTimeout(fetchStatus, 3000);
        } else {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<span class="dashicons dashicons-update" style="margin-top:3px;"></span> Sync now';
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
        syncBtn.innerHTML = '<span class="dashicons dashicons-update" style="margin-top:3px;"></span> Syncing&hellip;';

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
                    syncBtn.innerHTML = '<span class="dashicons dashicons-update" style="margin-top:3px;"></span> Sync now';
                }
            })
            .catch(function(err) {
                console.error(err);
                pushLog('failed', 'Network Error');
                syncBtn.disabled = false;
                syncBtn.innerHTML = '<span class="dashicons dashicons-update" style="margin-top:3px;"></span> Sync now';
            });
    });

    fetchStatus();
});
</script>
