<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$logs = get_option('woocs_sync_logs', []);
if (!is_array($logs)) $logs = [];
?>
<div class="wrap woocs-wrap">
    <h1>WooCS &rsaquo; Sync Status</h1>
    
    <input type="hidden" id="woocs_sync_nonce" value="<?php echo esc_attr(wp_create_nonce('woocs_sync_nonce')); ?>">
    <input type="hidden" id="woocs_ajax_url" value="<?php echo esc_url(admin_url('admin-ajax.php')); ?>">

    <div class="woocs-card">
        <div class="woocs-card-header">
            <h2>Sync Summary</h2>
            <button type="button" class="button button-primary" id="woocs-sync-now-btn">Sync now</button>
        </div>
        <div class="woocs-card-body">
            <div class="woocs-sync-grid">
                <div class="woocs-sync-item">
                    <span class="woocs-sync-label">Products</span>
                    <span class="woocs-sync-value" id="count-products">-</span>
                </div>
                <div class="woocs-sync-item">
                    <span class="woocs-sync-label">Variations</span>
                    <span class="woocs-sync-value" id="count-variations">-</span>
                </div>
                <div class="woocs-sync-item">
                    <span class="woocs-sync-label">FAQs</span>
                    <span class="woocs-sync-value" id="count-faqs">-</span>
                </div>
                <div class="woocs-sync-item">
                    <span class="woocs-sync-label">Orders API</span>
                    <span class="woocs-sync-value">Live <span class="dashicons dashicons-yes-alt woocs-text-success"></span></span>
                </div>
            </div>
            <p class="woocs-sync-time">Last sync: <span id="last-sync-time"><?php echo !empty($logs) ? esc_html(date('M j, Y H:i', strtotime($logs[0]['time']))) : 'Never'; ?></span></p>
        </div>
    </div>

    <div class="woocs-card">
        <div class="woocs-card-header">
            <h2>Sync Log</h2>
        </div>
        <div class="woocs-card-body p-0">
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th class="column-time">Time</th>
                        <th class="column-entity">Message</th>
                        <th class="column-status">Status</th>
                    </tr>
                </thead>
                <tbody id="woocs-sync-log">
                    <?php if (empty($logs)): ?>
                        <tr>
                            <td colspan="3" class="woocs-text-muted">No recent sync activity.</td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($logs as $log): ?>
                            <tr>
                                <td><?php echo esc_html(date('M j, Y H:i', strtotime($log['time']))); ?></td>
                                <td><?php echo esc_html($log['message']); ?></td>
                                <td>
                                    <?php if ($log['status'] === 'success'): ?>
                                        <span class="woocs-text-success">Success &#10003;</span>
                                    <?php elseif ($log['status'] === 'processing'): ?>
                                        <span class="woocs-text-success">Processing &#8987;</span>
                                    <?php else: ?>
                                        <span class="woocs-text-danger">Failed &#10007;</span>
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
    const syncBtn = document.getElementById('woocs-sync-now-btn');
    const ajaxUrl = document.getElementById('woocs_ajax_url').value;
    const nonce = document.getElementById('woocs_sync_nonce').value;
    
    // We only need to check status to know when it transitions from processing to success.
    // The previous state helps us trigger a log push when it finishes.
    let currentStatus = 'idle'; 

    function updateUI(data) {
        if (data.logs_updated) {
            location.reload();
            return;
        }

        if (data.products_count !== undefined) {
            document.getElementById('count-products').innerHTML = data.products_count + ' <span class="dashicons dashicons-yes-alt woocs-text-success"></span>';
        }
        if (data.variations_count !== undefined) {
            document.getElementById('count-variations').innerHTML = data.variations_count + ' <span class="dashicons dashicons-yes-alt woocs-text-success"></span>';
        }
        if (data.faqs_count !== undefined) {
            document.getElementById('count-faqs').innerHTML = data.faqs_count + ' <span class="dashicons dashicons-yes-alt woocs-text-success"></span>';
        }
        
        if (data.status === 'processing') {
            syncBtn.disabled = true;
            syncBtn.textContent = 'Syncing...';
            currentStatus = 'processing';
            setTimeout(fetchStatus, 3000);
        } else {
            syncBtn.disabled = false;
            syncBtn.textContent = 'Sync now';
            if (currentStatus === 'processing') {
                // It just finished
                currentStatus = 'success';
                pushLog('success', 'Catalog synced successfully');
            }
        }
    }

    function pushLog(status, message) {
        const formData = new FormData();
        formData.append('action', 'woocs_save_sync_log');
        formData.append('nonce', nonce);
        formData.append('status', status);
        formData.append('message', message);

        // We use fetch without reloading immediately to avoid interrupting other API calls
        fetch(ajaxUrl, { method: 'POST', body: formData })
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    location.reload();
                }
            })
            .catch(err => console.error(err));
    }

    function fetchStatus() {
        const formData = new FormData();
        formData.append('action', 'woocs_sync_status');
        formData.append('nonce', nonce);

        fetch(ajaxUrl, { method: 'POST', body: formData })
            .then(res => res.json())
            .then(res => {
                if (res.success && res.data) {
                    updateUI(res.data);
                }
            })
            .catch(err => console.error('Status fetch error', err));
    }

    syncBtn.addEventListener('click', function() {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing...';
        
        const formData = new FormData();
        formData.append('action', 'woocs_sync_now');
        formData.append('nonce', nonce);

        fetch(ajaxUrl, {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(res => {
            if (res.success) {
                // Now push the processing log so it doesn't interrupt woocs_sync_now
                pushLog('processing', 'Catalog Sync Initiated');
            } else {
                pushLog('failed', 'Sync Failed');
                syncBtn.disabled = false;
                syncBtn.textContent = 'Sync now';
            }
        })
        .catch(err => {
            console.error(err);
            pushLog('failed', 'Network Error');
            syncBtn.disabled = false;
            syncBtn.textContent = 'Sync now';
        });
    });

    // Initial fetch
    fetchStatus();
});
</script>
