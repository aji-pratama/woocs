<?php
declare(strict_types=1);
if (!defined('ABSPATH')) exit;
?>
<div class="wrap woocs-wrap">
    <h1>WooCS.ai &rsaquo; Sync Status</h1>

    <div class="woocs-card">
        <div class="woocs-card-header">
            <h2>Sync Summary</h2>
            <button type="button" class="button button-primary">Sync now</button>
        </div>
        <div class="woocs-card-body">
            <div class="woocs-sync-grid">
                <div class="woocs-sync-item">
                    <span class="woocs-sync-label">Products</span>
                    <span class="woocs-sync-value">248 <span class="dashicons dashicons-yes-alt woocs-text-success"></span></span>
                </div>
                <div class="woocs-sync-item">
                    <span class="woocs-sync-label">Variations</span>
                    <span class="woocs-sync-value">1024 <span class="dashicons dashicons-yes-alt woocs-text-success"></span></span>
                </div>
                <div class="woocs-sync-item">
                    <span class="woocs-sync-label">FAQs</span>
                    <span class="woocs-sync-value">34 <span class="dashicons dashicons-yes-alt woocs-text-success"></span></span>
                </div>
                <div class="woocs-sync-item">
                    <span class="woocs-sync-label">Orders API</span>
                    <span class="woocs-sync-value">Live <span class="dashicons dashicons-yes-alt woocs-text-success"></span></span>
                </div>
            </div>
            <p class="woocs-sync-time">Last sync: 2 minutes ago</p>
        </div>
    </div>

    <div class="woocs-card">
        <div class="woocs-card-header">
            <h2>Sync Log</h2>
        </div>
        <div class="woocs-card-body p-0">
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th class="column-time">Time</th>
                        <th class="column-entity">Entity</th>
                        <th class="column-status">Status</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>14:02</td>
                        <td>Products (248)</td>
                        <td><span class="woocs-text-success">Synced &#10003;</span></td>
                    </tr>
                    <tr>
                        <td>14:02</td>
                        <td>Variations (1024)</td>
                        <td><span class="woocs-text-success">Synced &#10003;</span></td>
                    </tr>
                    <tr>
                        <td>14:01</td>
                        <td>FAQs (34)</td>
                        <td><span class="woocs-text-success">Synced &#10003;</span></td>
                    </tr>
                    <tr>
                        <td>02:00</td>
                        <td>Products (1 failed)</td>
                        <td>
                            <span class="woocs-text-danger">Failed &#10007;</span>
                            <br><small class="woocs-text-muted">ID #412: Haiku timeout</small>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</div>
