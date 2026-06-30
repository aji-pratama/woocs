<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$faqs = get_option('woocs_faqs', []);
if (!is_array($faqs)) $faqs = [];
?>
<div class="wrap woocs-wrap">
    <h1 class="wp-heading-inline">WooCS &rsaquo; FAQs</h1>
    <a href="#" class="page-title-action" id="woocs-add-faq-btn">Add FAQ</a>
    <hr class="wp-header-end">

    <input type="hidden" id="woocs_faq_nonce" value="<?php echo esc_attr(wp_create_nonce('woocs_faq_nonce')); ?>">
    <input type="hidden" id="woocs_ajax_url" value="<?php echo esc_url(admin_url('admin-ajax.php')); ?>">

    <div class="woocs-card" id="woocs-faq-form-card" style="display: none;">
        <div class="woocs-card-header">
            <h2 id="woocs-faq-form-title">Add FAQ</h2>
        </div>
        <div class="woocs-card-body">
            <form id="woocs-faq-form">
                <input type="hidden" id="faq_index" name="faq_index" value="">
                <table class="form-table">
                    <tr>
                        <th scope="row"><label for="faq_question">Question</label></th>
                        <td><input name="faq_question" type="text" id="faq_question" class="regular-text large-text" required placeholder="What is your return policy?"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="faq_answer">Answer</label></th>
                        <td><textarea name="faq_answer" id="faq_answer" rows="4" class="large-text" required placeholder="We accept returns within 30 days..."></textarea></td>
                    </tr>
                </table>
                <p class="submit">
                    <button type="submit" class="button button-primary">Save FAQ</button>
                    <button type="button" class="button" id="woocs-cancel-faq-btn">Cancel</button>
                    <span class="spinner" id="woocs-faq-spinner"></span>
                </p>
            </form>
        </div>
    </div>

    <div class="woocs-card">
        <div class="woocs-card-header">
            <h2>FAQ List (<span id="faq-count"><?php echo count($faqs); ?></span>)</h2>
        </div>
        <div class="woocs-card-body p-0">
            <table class="wp-list-table widefat fixed striped table-view-list">
                <thead>
                    <tr>
                        <th class="column-primary">Question</th>
                        <th>Answer</th>
                        <th>Updated</th>
                        <th style="width: 80px;">Actions</th>
                    </tr>
                </thead>
                <tbody id="faq-list-body">
                    <?php if (empty($faqs)): ?>
                        <tr class="no-items"><td class="colspanchange" colspan="4">No FAQs found. Click "Add FAQ" to create one.</td></tr>
                    <?php else: ?>
                        <?php foreach ($faqs as $index => $faq): ?>
                            <tr data-index="<?php echo esc_attr((string)$index); ?>">
                                <td class="column-primary" data-colname="Question"><?php echo esc_html($faq['question'] ?? ''); ?></td>
                                <td data-colname="Answer"><?php echo esc_html($faq['answer'] ?? ''); ?></td>
                                <td data-colname="Updated"><?php echo esc_html($faq['updated'] ?? ''); ?></td>
                                <td data-colname="Actions">
                                    <a href="#" class="dashicons dashicons-edit woocs-icon-action edit-faq" title="Edit"></a>
                                    <a href="#" class="dashicons dashicons-trash woocs-icon-action woocs-text-danger delete-faq" title="Delete"></a>
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
    const addBtn = document.getElementById('woocs-add-faq-btn');
    const cancelBtn = document.getElementById('woocs-cancel-faq-btn');
    const formCard = document.getElementById('woocs-faq-form-card');
    const form = document.getElementById('woocs-faq-form');
    const title = document.getElementById('woocs-faq-form-title');
    const indexInput = document.getElementById('faq_index');
    const questionInput = document.getElementById('faq_question');
    const answerInput = document.getElementById('faq_answer');
    const spinner = document.getElementById('woocs-faq-spinner');
    
    const ajaxUrl = document.getElementById('woocs_ajax_url').value;
    const nonce = document.getElementById('woocs_faq_nonce').value;

    function resetForm() {
        form.reset();
        indexInput.value = '';
        title.innerText = 'Add FAQ';
        formCard.style.display = 'none';
    }

    addBtn.addEventListener('click', function(e) {
        e.preventDefault();
        resetForm();
        formCard.style.display = 'block';
    });

    cancelBtn.addEventListener('click', function(e) {
        e.preventDefault();
        resetForm();
    });

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        spinner.classList.add('is-active');
        
        const formData = new FormData();
        formData.append('action', 'woocs_save_faq');
        formData.append('nonce', nonce);
        formData.append('question', questionInput.value);
        formData.append('answer', answerInput.value);
        if (indexInput.value !== '') {
            formData.append('index', indexInput.value);
        }

        fetch(ajaxUrl, { method: 'POST', body: formData })
            .then(res => res.json())
            .then(res => {
                spinner.classList.remove('is-active');
                if (res.success) {
                    location.reload(); // Simple reload to show updated list
                } else {
                    alert(res.data.message || 'Error saving FAQ');
                }
            })
            .catch(err => {
                spinner.classList.remove('is-active');
                alert('Network error');
            });
    });

    document.querySelectorAll('.edit-faq').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const tr = this.closest('tr');
            const index = tr.getAttribute('data-index');
            const question = tr.querySelector('[data-colname="Question"]').innerText;
            const answer = tr.querySelector('[data-colname="Answer"]').innerText;

            indexInput.value = index;
            questionInput.value = question;
            answerInput.value = answer;
            title.innerText = 'Edit FAQ';
            formCard.style.display = 'block';
        });
    });

    document.querySelectorAll('.delete-faq').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            if (!confirm('Are you sure you want to delete this FAQ?')) return;
            
            const tr = this.closest('tr');
            const index = tr.getAttribute('data-index');

            const formData = new FormData();
            formData.append('action', 'woocs_delete_faq');
            formData.append('nonce', nonce);
            formData.append('index', index);

            fetch(ajaxUrl, { method: 'POST', body: formData })
                .then(res => res.json())
                .then(res => {
                    if (res.success) {
                        location.reload();
                    } else {
                        alert(res.data.message || 'Error deleting FAQ');
                    }
                })
                .catch(err => alert('Network error'));
        });
    });
});
</script>
