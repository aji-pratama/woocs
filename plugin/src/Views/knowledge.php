<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$active_tab = isset($_GET['tab']) ? sanitize_key($_GET['tab']) : 'catalog';
$active_tab = in_array($active_tab, ['catalog', 'faqs', 'general'], true) ? $active_tab : 'catalog';
$tabs = ['catalog' => 'Catalog', 'faqs' => 'FAQs', 'general' => 'General'];

$subscription = (new WooCS\ApiClient())->get_subscription();
$is_free_plan = !is_wp_error($subscription) && isset($subscription['plan_key']) && in_array($subscription['plan_key'], ['free', 'trial'], true);
?>
<div class="wrap woocs-wrap">
    <div class="woocs-page-header">
        <h1 class="wp-heading-inline">Knowledge</h1>
    </div>
    <hr class="wp-header-end">

    <div class="woocs-page-toolbar">
        <p class="description">Manage what the assistant knows about your store, product catalog, FAQs, and custom knowledge base.</p>
    </div>

    <nav class="nav-tab-wrapper woocs-nav-tab-wrapper">
        <?php foreach ($tabs as $slug => $label): ?>
            <a href="<?php echo esc_url(add_query_arg('tab', $slug, admin_url('admin.php?page=woocs-knowledge'))); ?>"
               class="nav-tab <?php echo $active_tab === $slug ? 'nav-tab-active' : ''; ?>">
                <?php echo esc_html($label); ?>
            </a>
        <?php endforeach; ?>
    </nav>

    <?php 
        if ($active_tab === 'faqs') {
            require WOOCS_PLUGIN_DIR . 'src/Views/faqs.php';
        } elseif ($active_tab === 'general') {
            require WOOCS_PLUGIN_DIR . 'src/Views/knowledge-general.php';
        } else {
            require WOOCS_PLUGIN_DIR . 'src/Views/sync.php';
        }
    ?>
</div>
