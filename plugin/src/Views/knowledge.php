<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$active_tab = isset($_GET['tab']) ? sanitize_key($_GET['tab']) : 'catalog';
$active_tab = in_array($active_tab, ['catalog', 'faqs'], true) ? $active_tab : 'catalog';
$tabs = ['catalog' => 'Catalog', 'faqs' => 'FAQs'];
$woocs_embedded = true;
?>
<div class="wrap woocs-wrap">
    <h1>Knowledge</h1>
    <p class="description">Manage what the assistant knows about your store.</p>

    <nav class="nav-tab-wrapper">
        <?php foreach ($tabs as $slug => $label): ?>
            <a href="<?php echo esc_url(add_query_arg('tab', $slug, admin_url('admin.php?page=woocs-knowledge'))); ?>"
               class="nav-tab <?php echo $active_tab === $slug ? 'nav-tab-active' : ''; ?>">
                <?php echo esc_html($label); ?>
            </a>
        <?php endforeach; ?>
    </nav>

    <?php require WOOCS_PLUGIN_DIR . 'src/Views/' . ($active_tab === 'faqs' ? 'faqs.php' : 'sync.php'); ?>
</div>
