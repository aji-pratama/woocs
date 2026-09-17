<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$is_connected = !empty(get_option('woocs_store_id'));
?>
<div class="wrap woocs-wrap">
    <div class="woocs-page-header">
        <h1 class="wp-heading-inline">Conversations</h1>
    </div>
    <hr class="wp-header-end">

    <div class="woocs-page-toolbar">
        <p class="description">Review customer conversations, manage lead status, and export transcripts or contacts.</p>
        <?php if ($is_connected): ?>
        <div class="woocs-toolbar-actions">
            <a href="<?php echo esc_url(wp_nonce_url(admin_url('admin-post.php?action=woocs_export_chat&type=full'), 'woocs_export_chat')); ?>" class="button">
                Export Conversations (CSV)
            </a>
            <a href="<?php echo esc_url(wp_nonce_url(admin_url('admin-post.php?action=woocs_export_chat&type=leads'), 'woocs_export_chat')); ?>" class="button button-primary">
                Export Leads DB (CSV)
            </a>
        </div>
        <?php endif; ?>
    </div>

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
            <span id="woocs-ch-meta" class="woocs-card-header-desc"></span>
        </div>
        <div class="woocs-card-body p-0">
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th style="width:140px;">Date</th>
                        <th style="width:160px;">Customer</th>
                        <th style="width:125px;">Lead Status</th>
                        <th>First Message</th>
                        <th style="width:60px;text-align:center;">Msgs</th>
                        <th style="width:80px;text-align:center;">Escalated</th>
                        <th style="width:70px;"></th>
                    </tr>
                </thead>
                <tbody id="woocs-ch-body">
                    <tr><td colspan="7" class="woocs-p-16 woocs-text-muted">Loading&hellip;</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Pagination -->
    <div id="woocs-ch-pagination" class="woocs-toolbar-actions" style="margin-top:14px;">
        <button class="button" id="woocs-ch-prev">&#8592; Prev</button>
        <span id="woocs-ch-page-info" class="woocs-card-header-desc"></span>
        <button class="button" id="woocs-ch-next">Next &#8594;</button>
    </div>

    <!-- Session detail drawer -->
    <div id="woocs-ch-drawer" class="woocs-card" style="display:none;margin-top:20px;">
        <div class="woocs-card-header">
            <h2 id="woocs-ch-drawer-title">Conversation Detail</h2>
            <button type="button" class="button" id="woocs-ch-drawer-close">&times; Close</button>
        </div>
        <div class="woocs-card-body">
            <div id="woocs-ch-customer-info" class="woocs-drawer-customer-bar">
                <div id="woocs-ch-customer-details"></div>
                <div class="woocs-toolbar-actions">
                    <label for="woocs-drawer-lead-select"><strong>Lead Status:</strong></label>
                    <select id="woocs-drawer-lead-select" class="woocs-lead-select">
                        <option value="hot">Hot</option>
                        <option value="warm">Warm</option>
                        <option value="cold">Cold</option>
                        <option value="customer">Customer</option>
                        <option value="support">Support</option>
                        <option value="lead">Lead</option>
                    </select>
                </div>
            </div>
            <div id="woocs-ch-messages" class="woocs-drawer-messages"></div>
        </div>
    </div>

    <script>
    document.addEventListener('DOMContentLoaded', function() {
        var ajaxUrl = document.getElementById('woocs_ajax_url').value;
        var nonce   = document.getElementById('woocs_ch_nonce').value;
        var currentPage = 1;
        var totalPages  = 1;
        var currentDrawerSessionId = null;

        var tbody    = document.getElementById('woocs-ch-body');
        var meta     = document.getElementById('woocs-ch-meta');
        var pageInfo = document.getElementById('woocs-ch-page-info');
        var prevBtn  = document.getElementById('woocs-ch-prev');
        var nextBtn  = document.getElementById('woocs-ch-next');
        var drawer   = document.getElementById('woocs-ch-drawer');
        var drawerTitle = document.getElementById('woocs-ch-drawer-title');
        var customerDetails = document.getElementById('woocs-ch-customer-details');
        var drawerLeadSelect = document.getElementById('woocs-drawer-lead-select');
        var messagesEl   = document.getElementById('woocs-ch-messages');

        document.getElementById('woocs-ch-drawer-close').addEventListener('click', function() {
            drawer.style.display = 'none';
        });

        function esc(str) {
            var d = document.createElement('div');
            d.textContent = str || '';
            return d.innerHTML;
        }

        function updateLeadLabel(sessionId, label, callback) {
            var fd = new FormData();
            fd.append('action', 'woocs_update_session_label');
            fd.append('nonce', nonce);
            fd.append('session_id', sessionId);
            fd.append('lead_label', label);

            fetch(ajaxUrl, { method: 'POST', body: fd })
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (callback) callback(res.success);
                })
                .catch(function() {
                    if (callback) callback(false);
                });
        }

        if (drawerLeadSelect) {
            drawerLeadSelect.addEventListener('change', function() {
                if (!currentDrawerSessionId) return;
                var newLabel = this.value;
                drawerLeadSelect.disabled = true;
                updateLeadLabel(currentDrawerSessionId, newLabel, function(ok) {
                    drawerLeadSelect.disabled = false;
                    if (ok) {
                        var rowSelect = document.querySelector('.woocs-lead-select[data-sid="' + currentDrawerSessionId + '"]');
                        if (rowSelect) rowSelect.value = newLabel;
                    }
                });
            });
        }

        function loadPage(page) {
            tbody.innerHTML = '<tr><td colspan="7" style="padding:16px;color:#8c8f94;">Loading&hellip;</td></tr>';

            var fd = new FormData();
            fd.append('action', 'woocs_chat_history');
            fd.append('nonce', nonce);
            fd.append('page', page);

            fetch(ajaxUrl, { method: 'POST', body: fd })
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (!res.success) {
                        tbody.innerHTML = '<tr><td colspan="7" style="padding:16px;color:#d63638;">Failed to load history.</td></tr>';
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
                        tbody.innerHTML = '<tr><td colspan="7" class="woocs-p-16 woocs-text-muted">No conversations yet.</td></tr>';
                        return;
                    }

                    tbody.innerHTML = data.sessions.map(function(s) {
                        var customerValue = s.customer_name || s.customer_email || s.customer_phone;
                        var customer = customerValue ? esc(customerValue) : '<span class="woocs-text-muted">Anonymous</span>';
                        var date = s.created_at ? new Date(s.created_at).toLocaleString([], {dateStyle:'short',timeStyle:'short'}) : '—';
                        var escalated = s.escalated
                            ? '<span class="woocs-badge woocs-badge-warning">Escalated</span>'
                            : '<span class="woocs-text-muted">No</span>';
                        var preview = s.first_message ? esc(s.first_message.substring(0, 70)) + (s.first_message.length > 70 ? '…' : '') : '<span class="woocs-text-muted">—</span>';
                        var currentLabel = s.lead_label || 'lead';

                        var leadSelectHtml = '<select class="woocs-lead-select" data-sid="' + esc(s.session_id) + '">' +
                            '<option value="hot"' + (currentLabel === 'hot' ? ' selected' : '') + '>Hot</option>' +
                            '<option value="warm"' + (currentLabel === 'warm' ? ' selected' : '') + '>Warm</option>' +
                            '<option value="cold"' + (currentLabel === 'cold' ? ' selected' : '') + '>Cold</option>' +
                            '<option value="customer"' + (currentLabel === 'customer' ? ' selected' : '') + '>Customer</option>' +
                            '<option value="support"' + (currentLabel === 'support' ? ' selected' : '') + '>Support</option>' +
                            '<option value="lead"' + (currentLabel === 'lead' ? ' selected' : '') + '>Lead</option>' +
                        '</select>';

                        return '<tr>' +
                            '<td>' + esc(date) + '</td>' +
                            '<td>' + customer + '</td>' +
                            '<td>' + leadSelectHtml + '</td>' +
                            '<td>' + preview + '</td>' +
                            '<td style="text-align:center;">' + s.message_count + '</td>' +
                            '<td style="text-align:center;">' + escalated + '</td>' +
                            '<td><button class="button button-small woocs-ch-view" data-sid="' + esc(s.session_id) + '">View</button></td>' +
                        '</tr>';
                    }).join('');

                    // Bind lead label change events in table
                    document.querySelectorAll('.woocs-lead-select').forEach(function(sel) {
                        sel.addEventListener('change', function() {
                            var sid = this.getAttribute('data-sid');
                            var val = this.value;
                            this.disabled = true;
                            var self = this;
                            updateLeadLabel(sid, val, function(ok) {
                                self.disabled = false;
                                if (currentDrawerSessionId === sid && drawerLeadSelect) {
                                    drawerLeadSelect.value = val;
                                }
                            });
                        });
                    });

                    // Bind view buttons
                    document.querySelectorAll('.woocs-ch-view').forEach(function(btn) {
                        btn.addEventListener('click', function() {
                            loadSession(this.getAttribute('data-sid'));
                        });
                    });
                })
                .catch(function(err) {
                    console.error(err);
                    tbody.innerHTML = '<tr><td colspan="7" class="woocs-p-16 woocs-text-error">Network error.</td></tr>';
                });
        }

        function loadSession(sessionId) {
            currentDrawerSessionId = sessionId;
            drawer.style.display = 'block';
            drawerTitle.textContent = 'Conversation Detail';
            customerDetails.innerHTML = 'Loading&hellip;';
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
                        customerDetails.innerHTML = '<span class="woocs-text-error">Failed to load session.</span>';
                        return;
                    }
                    var s = res.data;
                    drawerTitle.textContent = 'Conversation — ' + new Date(s.created_at).toLocaleDateString();

                    var parts = [];
                    if (s.customer_name)  parts.push('<strong>Name:</strong> ' + esc(s.customer_name));
                    if (s.customer_email) parts.push('<strong>Email:</strong> ' + esc(s.customer_email));
                    if (s.customer_phone) parts.push('<strong>Phone:</strong> ' + esc(s.customer_phone));
                    customerDetails.innerHTML = parts.length ? parts.join('&nbsp;&nbsp;|&nbsp;&nbsp;') : '<span class="woocs-text-muted">Anonymous session</span>';

                    if (drawerLeadSelect) {
                        drawerLeadSelect.value = s.lead_label || 'lead';
                    }

                    if (!s.messages || s.messages.length === 0) {
                        messagesEl.innerHTML = '<p class="woocs-text-muted">No messages.</p>';
                        return;
                    }

                    messagesEl.innerHTML = s.messages.map(function(m) {
                        var isBot = m.role === 'assistant';
                        var bubbleClass = isBot ? 'woocs-chat-bubble-bot' : 'woocs-chat-bubble-user';
                        var align = isBot ? 'flex-start' : 'flex-end';
                        return '<div style="display:flex;justify-content:' + align + ';">' +
                            '<div class="' + bubbleClass + '">' +
                            '<span class="woocs-chat-bubble-label">' + (isBot ? 'Assistant' : 'Customer') + '</span>' +
                            esc(m.content) +
                            '</div></div>';
                    }).join('');
                })
                .catch(function(err) {
                    console.error(err);
                    customerDetails.innerHTML = '<span class="woocs-text-error">Network error.</span>';
                });
        }

        prevBtn.addEventListener('click', function() { if (currentPage > 1) loadPage(currentPage - 1); });
        nextBtn.addEventListener('click', function() { if (currentPage < totalPages) loadPage(currentPage + 1); });

        loadPage(1);
    });
    </script>
    <?php endif; ?>
</div>
