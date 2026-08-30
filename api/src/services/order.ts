import { stores } from '../db/schema/stores';
import { InferSelectModel } from 'drizzle-orm';

type Store = InferSelectModel<typeof stores>;

const WC_STATUS_MAP: Record<string, string> = {
  pending: 'Payment pending',
  processing: 'Processing your order',
  'on-hold': 'On hold',
  completed: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  failed: 'Payment failed',
};

export class OrderService {
  static async getOrderStatus(store: Store, orderId: string) {
    if (!store.wcUrl || !store.wcConsumerKey || !store.wcConsumerSecret) {
      return this.errorResult(orderId, 'Store configuration is incomplete. I cannot check order status right now.');
    }

    try {
      const url = `${store.wcUrl.replace(/\/$/, '')}/wp-json/wc/v3/orders/${orderId}`;
      
      const auth = Buffer.from(`${store.wcConsumerKey}:${store.wcConsumerSecret}`).toString('base64');
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${auth}`,
        }
      });

      if (response.status === 200) {
        const data = await response.json();
        const status = data.status || 'unknown';
        return {
          order_id: orderId,
          status: WC_STATUS_MAP[status] || status.charAt(0).toUpperCase() + status.slice(1),
          items: (data.line_items || []).map((item: any) => `${item.name || 'Product'} ×${item.quantity || 1}`),
          total: data.total || '0.00',
          found: true,
          error: null,
        };
      }

      if (response.status === 404) {
        return this.errorResult(orderId, `I couldn't find order #${orderId}. Please check your order number.`);
      }

      console.error(`WooCommerce returned ${response.status} for order ${orderId}`);
      return this.errorResult(orderId, "I couldn't fetch your order status at the moment. Please try again later.");

    } catch (e) {
      console.error('WooCommerce order lookup failed', e);
      return this.errorResult(orderId, 'An error occurred while checking your order. Please try again later.');
    }
  }

  private static errorResult(orderId: string, message: string) {
    return {
      order_id: orderId,
      found: false,
      status: null,
      items: [],
      total: null,
      error: message,
    };
  }
}
