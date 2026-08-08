<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;

$is_connected = !empty(get_option('woocs_store_id'));
$subscription = $is_connected ? (new WooCS\ApiClient())->get_subscription() : null;
$error = get_transient('woocs_billing_error');
if ($error) delete_transient('woocs_billing_error');
if (is_wp_error($subscription)) {
    $error = $subscription->get_error_message();
    $subscription = null;
}

$plans = [
    'starter' => ['name' => 'Starter', 'price' => '$19', 'description' => 'For stores getting started with AI support.'],
    'growth' => ['name' => 'Growth', 'price' => '$49', 'description' => 'For growing stores with more conversations.'],
    'pro' => ['name' => 'Pro', 'price' => '$99', 'description' => 'For established stores with higher volume.'],
];
$status = $subscription['status'] ?? '';
$is_paid = !empty($subscription) && ($subscription['plan_key'] ?? 'trial') !== 'trial';
$has_access = !empty($subscription['active']);
$show_plans = !$is_paid || in_array($status, ['revoked', 'unpaid'], true);
$period_end = !empty($subscription['current_period_end'])
    ? wp_date(get_option('date_format'), strtotime($subscription['current_period_end']))
    : null;
?>
<div class="wrap woocs-wrap">
    <h1 class="wp-heading-inline">Plan &amp; Billing</h1>
    <hr class="wp-header-end">

    <?php if (isset($_GET['checkout']) && $_GET['checkout'] === 'success'): ?>
        <div class="notice notice-success"><p>Payment completed. Your subscription status will update automatically after Polar confirms it.</p></div>
    <?php endif; ?>
    <?php if ($error): ?>
        <div class="notice notice-error"><p><?php echo esc_html($error); ?></p></div>
    <?php endif; ?>

    <?php if (!$is_connected): ?>
        <div class="woocs-card"><div class="woocs-card-body">
            <p>Connect this store before choosing a plan.</p>
            <a class="button button-primary" href="<?php echo esc_url(admin_url('admin.php?page=woocs-settings')); ?>">Connect Store</a>
        </div></div>
    <?php elseif ($subscription): ?>
        <div class="woocs-card">
            <div class="woocs-card-header">
                <h2>Current subscription</h2>
                <span class="woocs-badge <?php echo $has_access ? 'woocs-badge-success' : 'woocs-badge-warning'; ?>">
                    <?php echo esc_html($has_access ? ucwords(str_replace('_', ' ', $status)) : 'Inactive'); ?>
                </span>
            </div>
            <div class="woocs-card-body">
                <p class="woocs-plan-name"><?php echo esc_html(ucfirst($subscription['plan_key'] ?? 'trial')); ?></p>
                <?php if ($period_end): ?>
                    <p class="description"><?php echo esc_html($status === 'trialing' ? 'Trial ends' : 'Current period ends'); ?> <?php echo esc_html($period_end); ?>.</p>
                <?php endif; ?>
                <?php if ($is_paid): ?>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                        <?php wp_nonce_field('woocs_open_billing_portal'); ?>
                        <input type="hidden" name="action" value="woocs_open_billing_portal">
                        <button class="button">Manage subscription</button>
                    </form>
                <?php endif; ?>
            </div>
        </div>

        <?php if ($show_plans): ?>
            <h2>Choose a plan</h2>
            <div class="woocs-plan-grid">
                <?php foreach ($plans as $key => $plan): ?>
                    <div class="woocs-card woocs-plan-card">
                        <div class="woocs-card-body">
                            <h3><?php echo esc_html($plan['name']); ?></h3>
                            <p><strong class="woocs-plan-price"><?php echo esc_html($plan['price']); ?></strong> / month</p>
                            <p><?php echo esc_html($plan['description']); ?></p>
                            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                                <?php wp_nonce_field('woocs_start_checkout'); ?>
                                <input type="hidden" name="action" value="woocs_start_checkout">
                                <input type="hidden" name="plan_key" value="<?php echo esc_attr($key); ?>">
                                <button class="button <?php echo $key === 'growth' ? 'button-primary' : ''; ?>">Choose <?php echo esc_html($plan['name']); ?></button>
                            </form>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
            <p class="description">Secure checkout, invoices, cancellation, and payment methods are handled by Polar.</p>
        <?php endif; ?>
    <?php endif; ?>
</div>
