<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;
?>
<div class="wrap woocs-wrap">
    <h1 class="wp-heading-inline">WooCS &rsaquo; FAQs</h1>
    <a href="#" class="page-title-action" id="woocs-add-faq-btn">Add FAQ</a>
    <hr class="wp-header-end">

    <div class="woocs-card" id="woocs-faq-form-card" style="display: none;">
        <div class="woocs-card-header">
            <h2>Add FAQ</h2>
        </div>
        <div class="woocs-card-body">
            <form method="post" action="">
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
                </p>
            </form>
        </div>
    </div>

    <div class="woocs-card">
        <div class="woocs-card-header">
            <h2>FAQ List (3)</h2>
            <button type="button" class="button">Sync FAQs now</button>
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
                <tbody>
                    <tr>
                        <td class="column-primary" data-colname="Question">What is your return policy?</td>
                        <td data-colname="Answer">We accept returns within 30 days of purchase...</td>
                        <td data-colname="Updated">2 days ago</td>
                        <td data-colname="Actions">
                            <a href="#" class="dashicons dashicons-edit woocs-icon-action" title="Edit"></a>
                            <a href="#" class="dashicons dashicons-trash woocs-icon-action woocs-text-danger" title="Delete"></a>
                        </td>
                    </tr>
                    <tr>
                        <td class="column-primary" data-colname="Question">How long is shipping?</td>
                        <td data-colname="Answer">Standard shipping takes 3-5 business days...</td>
                        <td data-colname="Updated">5 days ago</td>
                        <td data-colname="Actions">
                            <a href="#" class="dashicons dashicons-edit woocs-icon-action" title="Edit"></a>
                            <a href="#" class="dashicons dashicons-trash woocs-icon-action woocs-text-danger" title="Delete"></a>
                        </td>
                    </tr>
                    <tr>
                        <td class="column-primary" data-colname="Question">Do you ship overseas?</td>
                        <td data-colname="Answer">Yes, we ship internationally via DHL...</td>
                        <td data-colname="Updated">1 week ago</td>
                        <td data-colname="Actions">
                            <a href="#" class="dashicons dashicons-edit woocs-icon-action" title="Edit"></a>
                            <a href="#" class="dashicons dashicons-trash woocs-icon-action woocs-text-danger" title="Delete"></a>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</div>

<script>
    document.getElementById('woocs-add-faq-btn').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('woocs-faq-form-card').style.display = 'block';
    });
    document.getElementById('woocs-cancel-faq-btn').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('woocs-faq-form-card').style.display = 'none';
    });
</script>
