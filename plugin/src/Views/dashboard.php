<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$is_connected = !empty(get_option('woocs_store_id'));
?>
<div class="wrap woocs-wrap">
    <h1 class="wp-heading-inline">WooCS Dashboard</h1>
    <hr class="wp-header-end">

    <?php if (!$is_connected): ?>
        <div class="woocs-card" style="margin-top: 20px;">
            <div class="woocs-card-body">
                <h2>Welcome to WooCS.ai!</h2>
                <p>Your AI assistant is not connected yet.</p>
                <a href="<?php echo esc_url(admin_url('admin.php?page=woocs-settings')); ?>" class="button button-primary">Connect Store</a>
            </div>
        </div>
    <?php else: ?>
        <input type="hidden" id="woocs_dashboard_nonce" value="<?php echo esc_attr(wp_create_nonce('woocs_dashboard_nonce')); ?>">
        <input type="hidden" id="woocs_ajax_url" value="<?php echo esc_url(admin_url('admin-ajax.php')); ?>">

        <div style="margin-top: 20px;">
            <p>Here's a quick overview of your WooCS AI assistant activity.</p>
            
            <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 20px;">
                <div class="woocs-card" style="flex: 1; min-width: 200px;">
                    <div class="woocs-card-body" style="text-align: center;">
                        <h3 style="margin-top: 0; color: #646970;">Chat Sessions</h3>
                        <div id="stat-sessions" style="font-size: 36px; font-weight: 600; color: #2271b1; line-height: 1;">-</div>
                    </div>
                </div>

                <div class="woocs-card" style="flex: 1; min-width: 200px;">
                    <div class="woocs-card-body" style="text-align: center;">
                        <h3 style="margin-top: 0; color: #646970;">Total Messages</h3>
                        <div id="stat-messages" style="font-size: 36px; font-weight: 600; color: #2271b1; line-height: 1;">-</div>
                    </div>
                </div>

                <div class="woocs-card" style="flex: 1; min-width: 200px;">
                    <div class="woocs-card-body" style="text-align: center;">
                        <h3 style="margin-top: 0; color: #646970;">Products Synced</h3>
                        <div id="stat-products" style="font-size: 36px; font-weight: 600; color: #00a32a; line-height: 1;">-</div>
                    </div>
                </div>

                <div class="woocs-card" style="flex: 1; min-width: 200px;">
                    <div class="woocs-card-body" style="text-align: center;">
                        <h3 style="margin-top: 0; color: #646970;">Escalations</h3>
                        <div id="stat-escalations" style="font-size: 36px; font-weight: 600; color: #d63638; line-height: 1;">-</div>
                    </div>
                </div>
            </div>

            <p style="color: #646970; font-style: italic; margin-top: 20px;">
                Stats auto-refresh every 60 seconds. For detailed analytics, visit the WooCS SaaS platform.
            </p>
        </div>

        <script>
        document.addEventListener('DOMContentLoaded', function() {
            const ajaxUrl = document.getElementById('woocs_ajax_url').value;
            const nonce = document.getElementById('woocs_dashboard_nonce').value;

            function fetchStats() {
                const formData = new FormData();
                formData.append('action', 'woocs_dashboard_stats');
                formData.append('nonce', nonce);

                fetch(ajaxUrl, { method: 'POST', body: formData })
                    .then(res => res.json())
                    .then(res => {
                        if (res.success && res.data) {
                            document.getElementById('stat-sessions').innerText = res.data.chat_sessions ?? 0;
                            document.getElementById('stat-messages').innerText = res.data.total_messages ?? 0;
                            document.getElementById('stat-products').innerText = res.data.products_synced ?? 0;
                            document.getElementById('stat-escalations').innerText = res.data.escalations ?? 0;
                        }
                    })
                    .catch(err => console.error('Dashboard fetch error', err));
            }

            // Initial fetch
            fetchStats();

            // Refresh every 60 seconds
            setInterval(fetchStats, 60000);
        });
        </script>
    <?php endif; ?>
</div>
