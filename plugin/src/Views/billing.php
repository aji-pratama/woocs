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
    'starter' => [
        'name' => 'Starter',
        'price' => '$19',
        'description' => 'For stores getting started with AI support.',
        'popular' => false,
    ],
    'growth' => [
        'name' => 'Growth',
        'price' => '$49',
        'description' => 'For growing stores with more conversations.',
        'popular' => true,
    ],
    'pro' => [
        'name' => 'Pro',
        'price' => '$99',
        'description' => 'For established stores with higher volume.',
        'popular' => false,
    ],
];
$status = $subscription['status'] ?? '';
$is_paid = !empty($subscription) && ($subscription['plan_key'] ?? 'trial') !== 'trial';
$has_access = !empty($subscription['active']);
$show_plans = !$is_paid || in_array($status, ['revoked', 'unpaid'], true);
$period_end = !empty($subscription['current_period_end'])
    ? wp_date(get_option('date_format'), strtotime($subscription['current_period_end']))
    : null;
?>

    <?php if (isset($_GET['checkout']) && $_GET['checkout'] === 'success'): ?>
        <div class="notice notice-success"><p>Payment completed. Your subscription status will update automatically after Polar confirms it.</p></div>
    <?php endif; ?>
    <?php if ($error): ?>
        <div class="notice notice-error"><p><?php echo esc_html($error); ?></p></div>
    <?php endif; ?>

    <?php if (!$is_connected): ?>
        <div class="woocs-card">
            <div class="woocs-card-body">
                <p>Connect this store before choosing a plan.</p>
                <a class="button button-primary" href="<?php echo esc_url(admin_url('admin.php?page=woocs-settings')); ?>">Connect Store</a>
            </div>
        </div>
    <?php elseif ($subscription): ?>
        <div class="woocs-card woocs-subscription-card">
            <div class="woocs-card-header">
                <h2>Current Subscription</h2>
                <span class="woocs-badge <?php echo $has_access ? 'woocs-badge-success' : 'woocs-badge-warning'; ?>">
                    <?php echo esc_html($has_access ? ucwords(str_replace('_', ' ', $status)) : 'Inactive'); ?>
                </span>
            </div>
            <div class="woocs-card-body">
                <div class="woocs-subscription-info">
                    <div>
                        <span class="woocs-plan-label">Active Plan</span>
                        <p class="woocs-plan-name"><?php echo esc_html(ucfirst($subscription['plan_key'] ?? 'trial')); ?></p>
                    </div>
                    <?php if ($period_end): ?>
                        <div class="woocs-subscription-meta">
                            <span class="description"><?php echo esc_html($status === 'trialing' ? 'Trial ends:' : 'Current period ends:'); ?> <strong><?php echo esc_html($period_end); ?></strong></span>
                        </div>
                    <?php endif; ?>
                </div>
                <?php if ($is_paid): ?>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="woocs-manage-form">
                        <?php wp_nonce_field('woocs_open_billing_portal'); ?>
                        <input type="hidden" name="action" value="woocs_open_billing_portal">
                        <button class="button">Manage Subscription</button>
                    </form>
                <?php endif; ?>
            </div>
        </div>

        <?php if ($show_plans): ?>
            <div class="woocs-plans-section">
                <h2 class="woocs-plans-title">Choose a Plan</h2>
                <div class="woocs-plan-grid">
                    <?php foreach ($plans as $key => $plan): ?>
                        <div class="woocs-card woocs-plan-card <?php echo !empty($plan['popular']) ? 'is-popular' : ''; ?>">
                            <?php if (!empty($plan['popular'])): ?>
                                <div class="woocs-popular-badge">Most Popular</div>
                            <?php endif; ?>
                            <div class="woocs-card-body">
                                <div class="woocs-plan-header">
                                    <h3><?php echo esc_html($plan['name']); ?></h3>
                                    <div class="woocs-plan-pricing">
                                        <span class="woocs-plan-price"><?php echo esc_html($plan['price']); ?></span>
                                        <span class="woocs-plan-period">/ month</span>
                                    </div>
                                    <p class="woocs-plan-desc"><?php echo esc_html($plan['description']); ?></p>
                                </div>
                                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                                    <?php wp_nonce_field('woocs_start_checkout'); ?>
                                    <input type="hidden" name="action" value="woocs_start_checkout">
                                    <input type="hidden" name="plan_key" value="<?php echo esc_attr($key); ?>">
                                    <button class="button <?php echo !empty($plan['popular']) ? 'button-primary' : ''; ?> woocs-plan-btn">Choose <?php echo esc_html($plan['name']); ?></button>
                                </form>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
                <p class="description woocs-billing-footer-note">Secure checkout, invoices, cancellation, and payment methods are handled by Polar.</p>
            </div>
        <?php endif; ?>
    <?php endif; ?>
