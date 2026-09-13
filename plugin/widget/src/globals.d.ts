declare global {
  interface Window {
    WooCS?: {
      store_id: string;
      api_url: string;
      store_name?: string;
      page_context?: { type: string; product_id?: number; product_name?: string };
      prechat_enabled?: boolean;
      prechat_fields?: Array<{ key: string; label: string; type: string; required: boolean }>;
      primary_color?: string;
      wc_url?: string;
      css_url?: string;
      widget_config?: {
        enable_cart_action?: boolean;
        enable_carousel?: boolean;
        enable_quick_replies?: boolean;
      };
    };
    WooCS_Test?: {
      resetWidget?: () => void;
      triggerMessage?: (msg: string) => void;
    };
  }
}

export {};
