<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$api = new WooCS\ApiClient();
$docs_response = $api->get_knowledge_documents();
$documents = [];
if (!is_wp_error($docs_response) && isset($docs_response['documents'])) {
    $documents = $docs_response['documents'];
}
?>
    <p>
        <button type="button" class="button button-primary" id="woocs-add-text-btn">Add Text Document</button>
        <button type="button" class="button" id="woocs-add-pdf-btn">Upload PDF</button>
        <!-- TODO: Re-enable URL fetch once robust scraper / headless browser service is ready
        <button type="button" class="button" id="woocs-add-url-btn">Add URL</button>
        -->
    </p>
    <p class="description">General Knowledge allows the AI to answer customer questions using your store policies (e.g. Return Policy, Shipping Details, FAQ) or documents.</p>
    <p class="description"><strong>Note:</strong> Documents are synced to AI vector embeddings. You can remove and re-add them at any time.</p>

    <input type="hidden" id="woocs_knowledge_nonce" value="<?php echo esc_attr(wp_create_nonce('woocs_knowledge_nonce')); ?>">
    <input type="hidden" id="woocs_ajax_url" value="<?php echo esc_url(admin_url('admin-ajax.php')); ?>">

    <!-- Add Text / Policy Card -->
    <div class="woocs-card" id="woocs-text-form-card" style="display: none;">
        <div class="woocs-card-header">
            <h2>Add Knowledge Document (Text / Markdown)</h2>
        </div>
        <div class="woocs-card-body">
            <form id="woocs-text-form">
                <table class="form-table">
                    <tr>
                        <th scope="row"><label for="knowledge_title">Document Title</label></th>
                        <td>
                            <input name="knowledge_title" type="text" id="knowledge_title" class="regular-text large-text" required placeholder="e.g. Return & Refund Policy, Shipping Terms, Operating Hours">
                            <p class="description">A recognizable title to identify this document.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="knowledge_content">Content (Markdown / Text)</label></th>
                        <td>
                            <textarea name="knowledge_content" id="knowledge_content" rows="12" class="large-text code" required placeholder="Type or paste your policies, guidelines, or FAQ details here... Markdown is supported!"></textarea>
                            <p class="description" style="margin-top: 8px;">
                                Write plain text or Markdown (headings, bullet points, tables).
                                <label style="margin-left: 15px; cursor: pointer; color: #2271b1;">
                                    <input type="file" id="woocs-load-file" accept=".txt,.md" style="display:none;">
                                    Import from .txt / .md file
                                </label>
                            </p>
                        </td>
                    </tr>
                </table>
                <p class="submit">
                    <button type="submit" class="button button-primary">Save & Sync Document</button>
                    <button type="button" class="button cancel-btn">Cancel</button>
                    <span class="spinner" id="woocs-text-spinner"></span>
                </p>
            </form>
        </div>
    </div>

    <!-- TODO: Re-enable URL fetch once robust scraper / headless browser service is ready
    <div class="woocs-card" id="woocs-url-form-card" style="display: none;">
        <div class="woocs-card-header">
            <h2>Add Website URL</h2>
        </div>
        <div class="woocs-card-body">
            <form id="woocs-url-form">
                <table class="form-table">
                    <tr>
                        <th scope="row"><label for="knowledge_url">Page URL</label></th>
                        <td>
                            <input name="knowledge_url" type="url" id="knowledge_url" class="regular-text large-text" required placeholder="https://example.com/shipping-policy">
                            <p class="description">The AI will crawl this page and extract the text.</p>
                        </td>
                    </tr>
                </table>
                <p class="submit">
                    <button type="submit" class="button button-primary">Sync URL</button>
                    <button type="button" class="button cancel-btn">Cancel</button>
                    <span class="spinner" id="woocs-url-spinner"></span>
                </p>
            </form>
        </div>
    </div>
    -->

    <!-- Upload PDF Card -->
    <div class="woocs-card" id="woocs-pdf-form-card" style="display: none;">
        <div class="woocs-card-header">
            <h2>Upload PDF Document</h2>
        </div>
        <div class="woocs-card-body">
            <form id="woocs-pdf-form">
                <table class="form-table">
                    <tr>
                        <th scope="row"><label for="knowledge_pdf">PDF File</label></th>
                        <td>
                            <input name="knowledge_pdf" type="file" id="knowledge_pdf" accept="application/pdf" required>
                            <p class="description">Max file size: 10MB.</p>
                        </td>
                    </tr>
                </table>
                <p class="submit">
                    <button type="submit" class="button button-primary">Upload & Sync PDF</button>
                    <button type="button" class="button cancel-btn">Cancel</button>
                    <span class="spinner" id="woocs-pdf-spinner"></span>
                </p>
            </form>
        </div>
    </div>

    <!-- Document List -->
    <div class="woocs-card">
        <div class="woocs-card-header">
            <h2>Active Documents (<span id="doc-count"><?php echo count($documents); ?></span>)</h2>
        </div>
        <div class="woocs-card-body p-0">
            <table class="wp-list-table widefat fixed striped table-view-list">
                <thead>
                    <tr>
                        <th style="width: 80px;">Type</th>
                        <th class="column-primary">Source</th>
                        <th>Status</th>
                        <th>Last Updated</th>
                        <th style="width: 100px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($documents)): ?>
                        <tr class="no-items"><td class="colspanchange" colspan="5">No documents found. Click "Add Text / Policy" to get started.</td></tr>
                    <?php else: ?>
                        <?php foreach ($documents as $doc): ?>
                            <tr data-id="<?php echo esc_attr($doc['id']); ?>">
                                <td>
                                    <?php 
                                        $type_badge = 'woocs-badge-neutral';
                                        if ($doc['type'] === 'text') $type_badge = 'woocs-badge-primary';
                                    ?>
                                    <span class="woocs-badge <?php echo $type_badge; ?>"><?php echo esc_html(strtoupper($doc['type'])); ?></span>
                                </td>
                                <td class="column-primary" data-colname="Source">
                                    <?php if ($doc['type'] === 'url'): ?>
                                        <a href="<?php echo esc_url($doc['source']); ?>" target="_blank"><?php echo esc_html($doc['source']); ?></a>
                                    <?php else: ?>
                                        <strong><?php echo esc_html($doc['source']); ?></strong>
                                    <?php endif; ?>
                                </td>
                                <td data-colname="Status">
                                    <?php 
                                        $status_class = 'woocs-badge-neutral';
                                        if ($doc['status'] === 'completed') $status_class = 'woocs-badge-success';
                                        if ($doc['status'] === 'error') $status_class = 'woocs-badge-danger';
                                        if (in_array($doc['status'], ['pending', 'processing'])) $status_class = 'woocs-badge-primary';
                                    ?>
                                    <span class="woocs-badge <?php echo $status_class; ?>"><?php echo esc_html(ucfirst($doc['status'])); ?></span>
                                </td>
                                <td data-colname="Updated"><?php echo esc_html(date('M j, Y H:i', strtotime($doc['updatedAt']))); ?></td>
                                <td data-colname="Actions">
                                    <a href="#" class="dashicons dashicons-trash woocs-icon-action woocs-text-danger delete-doc" title="Delete"></a>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Premium Upgrade Modal (Dynamic Paywall) -->
    <div id="woocs-premium-modal" class="woocs-modal-overlay" style="display: none;">
        <div class="woocs-modal-content woocs-theme-charcoal">
            <div class="woocs-modal-header">
                <h3>Upgrade to Pro</h3>
                <span class="woocs-modal-close dashicons dashicons-no-alt"></span>
            </div>
            <div class="woocs-modal-body">
                <p>You've reached the limit of the Free plan for General Knowledge.</p>
                <ul class="woocs-features-list">
                    <li><span class="dashicons dashicons-yes"></span> Sync up to 10 Text / Policy Documents</li>
                    <li><span class="dashicons dashicons-yes"></span> Upload up to 5 PDF Documents</li>
                    <li><span class="dashicons dashicons-yes"></span> 20 Manual Syncs per month</li>
                </ul>
                <p style="margin-top: 20px;">
                    <a href="<?php echo esc_url(admin_url('admin.php?page=woocs-settings&tab=billing')); ?>" class="button button-primary button-large" style="width: 100%; text-align: center;">View Pro Plan</a>
                </p>
            </div>
        </div>
    </div>

<style>
/* Charcoal Modal Styles */
.woocs-modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.6); z-index: 9999;
    display: flex; align-items: center; justify-content: center;
}
.woocs-modal-content.woocs-theme-charcoal {
    background: #2b2b2b;
    border: 1px solid #111;
    border-radius: 6px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
    color: #eee;
    width: 400px;
    max-width: 90%;
}
.woocs-theme-charcoal .woocs-modal-header {
    background: linear-gradient(to bottom, #3c3c3c, #222);
    padding: 12px 15px;
    border-bottom: 1px solid #111;
    border-radius: 6px 6px 0 0;
    display: flex; justify-content: space-between; align-items: center;
}
.woocs-theme-charcoal .woocs-modal-header h3 {
    margin: 0; color: #fff; text-shadow: 0 -1px 0 rgba(0,0,0,0.8);
}
.woocs-theme-charcoal .woocs-modal-close {
    cursor: pointer; color: #aaa;
}
.woocs-theme-charcoal .woocs-modal-close:hover { color: #fff; }
.woocs-theme-charcoal .woocs-modal-body {
    padding: 20px;
}
.woocs-features-list { list-style: none; padding: 0; margin: 15px 0; }
.woocs-features-list li { margin-bottom: 8px; display: flex; align-items: center; }
.woocs-features-list .dashicons { color: #51a351; margin-right: 8px; }
</style>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const addTextBtn = document.getElementById('woocs-add-text-btn');
    const addPdfBtn = document.getElementById('woocs-add-pdf-btn');
    const addUrlBtn = document.getElementById('woocs-add-url-btn');

    const textCard = document.getElementById('woocs-text-form-card');
    const pdfCard = document.getElementById('woocs-pdf-form-card');
    const urlCard = document.getElementById('woocs-url-form-card');

    const textForm = document.getElementById('woocs-text-form');
    const pdfForm = document.getElementById('woocs-pdf-form');
    const urlForm = document.getElementById('woocs-url-form');

    const textSpinner = document.getElementById('woocs-text-spinner');
    const pdfSpinner = document.getElementById('woocs-pdf-spinner');
    const urlSpinner = document.getElementById('woocs-url-spinner');

    const loadFileInput = document.getElementById('woocs-load-file');
    const premiumModal = document.getElementById('woocs-premium-modal');

    const ajaxUrl = document.getElementById('woocs_ajax_url').value;
    const nonce = document.getElementById('woocs_knowledge_nonce').value;

    function hideForms() {
        if (textCard) textCard.style.display = 'none';
        if (pdfCard) pdfCard.style.display = 'none';
        if (urlCard) urlCard.style.display = 'none';
        if (textForm) textForm.reset();
        if (pdfForm) pdfForm.reset();
        if (urlForm) urlForm.reset();
    }

    document.querySelectorAll('.cancel-btn').forEach(btn => btn.addEventListener('click', hideForms));

    const modalClose = document.querySelector('.woocs-modal-close');
    if (modalClose) {
        modalClose.addEventListener('click', () => {
            premiumModal.style.display = 'none';
        });
    }

    if (addTextBtn && textCard) {
        addTextBtn.addEventListener('click', function(e) {
            e.preventDefault();
            hideForms();
            textCard.style.display = 'block';
            document.getElementById('knowledge_title')?.focus();
        });
    }

    if (addPdfBtn && pdfCard) {
        addPdfBtn.addEventListener('click', function(e) {
            e.preventDefault();
            hideForms();
            pdfCard.style.display = 'block';
        });
    }

    if (addUrlBtn && urlCard) {
        addUrlBtn.addEventListener('click', function(e) {
            e.preventDefault();
            hideForms();
            urlCard.style.display = 'block';
        });
    }

    // Helper: Import .txt / .md file into Text Area
    if (loadFileInput) {
        loadFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(evt) {
                const content = evt.target.result;
                const contentEl = document.getElementById('knowledge_content');
                const titleEl = document.getElementById('knowledge_title');
                if (contentEl) contentEl.value = content;
                if (titleEl && !titleEl.value) {
                    // Pre-fill title with filename without extension
                    titleEl.value = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' ');
                }
            };
            reader.readAsText(file);
        });
    }

    function handleApiError(res) {
        if (!res.success && res.data && res.data.upgrade_required) {
            hideForms();
            premiumModal.style.display = 'flex';
            return true;
        }
        if (!res.success) {
            alert(res.data?.message || 'Error processing request');
            return true;
        }
        return false;
    }

    // Submit Text / Markdown Form
    if (textForm) {
        textForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (textSpinner) textSpinner.classList.add('is-active');

            const formData = new FormData();
            formData.append('action', 'woocs_add_knowledge_text');
            formData.append('nonce', nonce);
            formData.append('title', document.getElementById('knowledge_title').value);
            formData.append('content', document.getElementById('knowledge_content').value);

            fetch(ajaxUrl, { method: 'POST', body: formData })
                .then(res => res.json())
                .then(res => {
                    if (textSpinner) textSpinner.classList.remove('is-active');
                    if (!handleApiError(res)) {
                        location.reload();
                    }
                })
                .catch(err => {
                    if (textSpinner) textSpinner.classList.remove('is-active');
                    alert('Network error');
                });
        });
    }

    // Submit PDF Form
    if (pdfForm) {
        pdfForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (pdfSpinner) pdfSpinner.classList.add('is-active');

            const formData = new FormData();
            formData.append('action', 'woocs_add_knowledge_pdf');
            formData.append('nonce', nonce);

            const fileInput = document.getElementById('knowledge_pdf');
            if (fileInput.files.length > 0) {
                formData.append('pdf', fileInput.files[0]);
            }

            fetch(ajaxUrl, { method: 'POST', body: formData })
                .then(res => res.json())
                .then(res => {
                    if (pdfSpinner) pdfSpinner.classList.remove('is-active');
                    if (!handleApiError(res)) {
                        location.reload();
                    }
                })
                .catch(err => {
                    if (pdfSpinner) pdfSpinner.classList.remove('is-active');
                    alert('Network error');
                });
        });
    }

    // Submit URL Form (if active)
    if (urlForm) {
        urlForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (urlSpinner) urlSpinner.classList.add('is-active');

            const formData = new FormData();
            formData.append('action', 'woocs_add_knowledge_url');
            formData.append('nonce', nonce);
            formData.append('url', document.getElementById('knowledge_url').value);

            fetch(ajaxUrl, { method: 'POST', body: formData })
                .then(res => res.json())
                .then(res => {
                    if (urlSpinner) urlSpinner.classList.remove('is-active');
                    if (!handleApiError(res)) {
                        location.reload();
                    }
                })
                .catch(err => {
                    if (urlSpinner) urlSpinner.classList.remove('is-active');
                    alert('Network error');
                });
        });
    }

    // Delete handler
    document.querySelectorAll('.delete-doc').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            if (!confirm('Are you sure you want to delete this document?')) return;

            const tr = this.closest('tr');
            const docId = tr.getAttribute('data-id');

            const formData = new FormData();
            formData.append('action', 'woocs_delete_knowledge_doc');
            formData.append('nonce', nonce);
            formData.append('id', docId);

            fetch(ajaxUrl, { method: 'POST', body: formData })
                .then(res => res.json())
                .then(res => {
                    if (res.success) {
                        location.reload();
                    } else {
                        alert(res.data.message || 'Error deleting document');
                    }
                })
                .catch(err => alert('Network error'));
        });
    });
});
</script>
