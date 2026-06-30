<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$is_connected = !empty(get_option('woocs_store_id'));
?>
<div class="wrap woocs-wrap">
    <h1 class="wp-heading-inline">WooCS &rsaquo; Chat History</h1>
    <hr class="wp-header-end">

    <?php if (!$is_connected): ?>
        <div class="woocs-card">
            <div class="woocs-card-body">
                <p>Please <a href="<?php echo esc_url(admin_url('admin.php?page=woocs-settings')); ?>">connect your store</a> first.</p>
            </div>
        </div>
    <?php else: ?>
    <input type="hidden" id="woocs_ch_nonce"    value="<?php echo esc_attr(wp_create_nonce('woocs_chat_history_nonce')); ?>">
    <input type="hidden" id="woocs_ajax_url"    value="<?php echo esc_url(admin_url('admin-ajax.php')); ?>">

    <div class="woocs-card">
        <div class="woocs-card-header">
            <h2>Conversations</h2>
            <span id="woocs-ch-meta" style="font-size:12px;color:#646970;"></span>
        </div>
        <div class="woocs-card-body p-0">
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th style="width:160px;">Date</th>
                        <th style="width:180px;">Customer</th>
                        <th>First Message</th>
                        <th style="width:70px;text-align:center;">Msgs</th>
                        <th style="width:90px;text-align:center;">Escalated</th>
                        <th style="width:80px;"></th>
                    </tr>
                </thead>
                <tbody id="woocs-ch-body">
                    <tr><td colspan="6" style="padding:16px;color:#8c8f94;">Loading&hellip;</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Pagination -->
    <div id="woocs-ch-pagination" style="margin-top:12px;display:flex;gap:8px;align-items:center;">
        <button class="button" id="woocs-ch-prev">&#8592; Prev</button>
        <span id="woocs-ch-page-info" style="font-size:13px;color:#646970;"></span>
        <button class="button" id="woocs-ch-next">Next &#8594;</button>
    </div>

    <!-- Session detail drawer -->
    <div id="woocs-ch-drawer" class="woocs-card" style="display:none;margin-top:20px;">
        <div class="woocs-card-header">
            <h2 id="woocs-ch-drawer-title">Conversation Detail</h2>
            <button type="button" class="button" id="woocs-ch-drawer-close">&times; Close</button>
        </div>
        <div class="woocs-card-body">
            <div id="woocs-ch-customer-info" style="margin-bottom:16px;padding:12px;background:#f6f7f7;border-radius:3px;font-size:13px;"></div>
            <div id="woocs-ch-messages" style="max-height:480px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;"></div>
        </div>
    </div>

    <script>
    document.addEventListener('DOMContentLoaded', function() {
        var ajaxUrl = document.getElementById('woocs_ajax_url').value;
        var nonce   = document.getElementById('woocs_ch_nonce').value;
        var currentPage = 1;
        var totalPages  = 1;

        var tbody    = document.getElementById('woocs-ch-body');
        var meta     = document.getElementById('woocs-ch-meta');
        var pageInfo = document.getElementById('woocs-ch-page-info');
        var prevBtn  = document.getElementById('woocs-ch-prev');
        var nextBtn  = document.getElementById('woocs-ch-next');
        var drawer   = document.getElementById('woocs-ch-drawer');
        var drawerTitle = document.getElementById('woocs-ch-drawer-title');
        var customerInfo = document.getElementById('woocs-ch-customer-info');
        var messagesEl   = document.getElementById('woocs-ch-messages');
        document.getElementById('woocs-ch-drawer-close').addEventListener('click', function() {
            drawer.style.display = 'none';
        });

        function esc(str) {
            var d = document.createElement('div');
            d.textContent = str || '';
            return d.innerHTML;
        }

        function loadPage(page) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;color:#8c8f94;">Loading&hellip;</td></tr>';

            var fd = new FormData();
            fd.append('action', 'woocs_chat_history');
            fd.append('nonce', nonce);
            fd.append('page', page);

            fetch(ajaxUrl, { method: 'POST', body: fd })
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (!res.success) {
                        tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;color:#d63638;">Failed to load history.</td></tr>';
                        return;
                    }
                    var data = res.data;
                    totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
                    currentPage = data.page;

                    meta.textContent = data.total + ' conversation' + (data.total !== 1 ? 's' : '');
                    pageInfo.textContent = 'Page ' + currentPage + ' of ' + totalPages;
                    prevBtn.disabled = currentPage <= 1;
                    nextBtn.disabled = currentPage >= totalPages;

                    if (!data.sessions || data.sessions.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;color:#8c8f94;">No conversations yet.</td></tr>';
                        return;
                    }

                    tbody.innerHTML = data.sessions.map(function(s) {
                        var customer = s.customer_name || s.customer_email || s.customer_phone || '<span style="color:#8c8f94;">Anonymous</span>';
                        var date = s.created_at ? new Date(s.created_at).toLocaleString([], {dateStyle:'medium',timeStyle:'short'}) : '—';
                        var escalated = s.escalated
                            ? '<span class="woocs-badge woocs-badge-warning">Escalated</span>'
                            : '<span style="color:#8c8f94;">No</span>';
                        var preview = s.first_message ? esc(s.first_message.substring(0, 80)) + (s.first_message.length > 80 ? '…' : '') : '<span style="color:#8c8f94;">—</span>';

                        return '<tr>' +
                            '<td>' + esc(date) + '</td>' +
                            '<td>' + customer + '</td>' +
                            '<td>' + preview + '</td>' +
                            '<td style="text-align:center;">' + s.message_count + '</td>' +
                            '<td style="text-align:center;">' + escalated + '</td>' +
                            '<td><button class="button button-small woocs-ch-view" data-sid="' + esc(s.session_id) + '">View</button></td>' +
                        '</tr>';
                    }).join('');

                    // Bind view buttons
                    document.querySelectorAll('.woocs-ch-view').forEach(function(btn) {
                        btn.addEventListener('click', function() {
                            loadSession(this.getAttribute('data-sid'));
                        });
                    });
                })
                .catch(function(err) {
                    console.error(err);
                    tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;color:#d63638;">Network error.</td></tr>';
                });
        }

        function loadSession(sessionId) {
            drawer.style.display = 'block';
            drawerTitle.textContent = 'Conversation Detail';
            customerInfo.innerHTML = 'Loading&hellip;';
            messagesEl.innerHTML   = '';
            drawer.scrollIntoView({ behavior: 'smooth', block: 'start' });

            var fd = new FormData();
            fd.append('action', 'woocs_chat_session_detail');
            fd.append('nonce', nonce);
            fd.append('session_id', sessionId);

            fetch(ajaxUrl, { method: 'POST', body: fd })
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (!res.success) {
                        customerInfo.innerHTML = '<span style="color:#d63638;">Failed to load session.</span>';
                        return;
                    }
                    var s = res.data;
                    drawerTitle.textContent = 'Conversation — ' + new Date(s.created_at).toLocaleDateString();

                    var parts = [];
                    if (s.customer_name)  parts.push('<strong>Name:</strong> ' + esc(s.customer_name));
                    if (s.customer_email) parts.push('<strong>Email:</strong> ' + esc(s.customer_email));
                    if (s.customer_phone) parts.push('<strong>Phone:</strong> ' + esc(s.customer_phone));
                    customerInfo.innerHTML = parts.length ? parts.join('&nbsp;&nbsp;|&nbsp;&nbsp;') : '<span style="color:#8c8f94;">Anonymous session</span>';

                    if (!s.messages || s.messages.length === 0) {
                        messagesEl.innerHTML = '<p style="color:#8c8f94;">No messages.</p>';
                        return;
                    }

                    messagesEl.innerHTML = s.messages.map(function(m) {
                        var isBot = m.role === 'assistant';
                        var bg    = isBot ? '#f6f7f7' : '#eaf4ff';
                        var align = isBot ? 'flex-start' : 'flex-end';
                        return '<div style="display:flex;justify-content:' + align + ';">' +
                            '<div style="max-width:70%;background:' + bg + ';border-radius:6px;padding:8px 12px;font-size:13px;line-height:1.5;">' +
                            '<span style="font-size:11px;font-weight:600;color:#646970;display:block;margin-bottom:3px;">' + (isBot ? 'Assistant' : 'Customer') + '</span>' +
                            esc(m.content) +
                            '</div></div>';
                    }).join('');
                })
                .catch(function(err) {
                    console.error(err);
                    customerInfo.innerHTML = '<span style="color:#d63638;">Network error.</span>';
                });
        }

        prevBtn.addEventListener('click', function() { if (currentPage > 1) loadPage(currentPage - 1); });
        nextBtn.addEventListener('click', function() { if (currentPage < totalPages) loadPage(currentPage + 1); });

        loadPage(1);
    });
    </script>
    <?php endif; ?>
</div>
