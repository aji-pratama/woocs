<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;
?>
<div class="wrap woocs-wrap">
    <h1 class="wp-heading-inline">WooCS &rsaquo; Widget Preview</h1>
    <a href="#" class="page-title-action">Test Escalation</a>
    <a href="#" class="page-title-action woocs-text-danger">Clear Session</a>
    <hr class="wp-header-end">

    <div class="woocs-preview-container">
        <div class="woocs-preview-frame">
            <!-- Simulated Storefront Iframe -->
            <div class="woocs-simulated-store">
                <div class="woocs-sim-header">
                    <strong><?php echo esc_html(get_bloginfo('name')); ?></strong>
                    <span>🛒 ☰</span>
                </div>
                <div class="woocs-sim-body">
                    <p>Welcome to our store. We have great products!</p>
                    <div class="woocs-sim-grid">
                        <div class="woocs-sim-item"></div>
                        <div class="woocs-sim-item"></div>
                        <div class="woocs-sim-item"></div>
                    </div>
                </div>
                
                <!-- Mock Widget for Preview -->
                <div class="woocs-sim-widget">
                    <div class="woocs-sim-widget-header">
                        <span>🤖 Store Assistant</span>
                        <span class="woocs-sim-close">&times;</span>
                    </div>
                    <div class="woocs-sim-widget-body">
                        <div class="woocs-sim-bubble woocs-sim-bot">
                            Hi! I can help you find products, check stock, or track your order.
                        </div>
                    </div>
                    <div class="woocs-sim-widget-input">
                        <input type="text" placeholder="Ask anything...">
                    </div>
                </div>
                
                <!-- Debug Overlay -->
                <div class="woocs-debug-overlay">
                    <small>Confidence: 0.87</small><br>
                    <small>Latency: 1.24s</small>
                </div>
            </div>
        </div>
    </div>
</div>
