<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;
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
            <p class="woocs-sync-time">Last sync: 2 minutes ago</p>
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
                        <th class="column-entity">Entity</th>
                        <th class="column-status">Status</th>
                    </tr>
                </thead>
                <tbody id="woocs-sync-log">
                    <tr>
                        <td colspan="3" class="woocs-text-muted">No recent sync activity.</td>
                    </tr>
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
    
    function updateUI(data) {
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
            setTimeout(fetchStatus, 3000);
        } else {
            syncBtn.disabled = false;
            syncBtn.textContent = 'Sync now';
        }
    }

    function addLog(entity, status, isError = false) {
        const tbody = document.getElementById('woocs-sync-log');
        if (tbody.querySelector('.woocs-text-muted')) {
            tbody.innerHTML = ''; // clear empty message
        }
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const statusHtml = isError 
            ? `<span class="woocs-text-danger">Failed &#10007;</span>`
            : `<span class="woocs-text-success">Processing &#8987;</span>`;
            
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${time}</td><td>${entity}</td><td>${statusHtml}</td>`;
        tbody.prepend(tr);
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
        addLog('Catalog Sync', 'Processing', false);

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
                // The backend API triggers async task, so it returns "processing"
                setTimeout(fetchStatus, 2000);
            } else {
                addLog('Sync Failed', 'Failed', true);
                syncBtn.disabled = false;
                syncBtn.textContent = 'Sync now';
            }
        })
        .catch(err => {
            console.error(err);
            addLog('Network Error', 'Failed', true);
            syncBtn.disabled = false;
            syncBtn.textContent = 'Sync now';
        });
    });

    // Initial fetch
    fetchStatus();
});
</script>
