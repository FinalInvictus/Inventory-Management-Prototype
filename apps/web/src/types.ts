export type Role = 'employee' | 'admin';
export interface User { id: string; name: string; role: Role; username: string }

export interface Category {
  id: string; name: string; parent_id?: string; default_price: number; active: boolean;
  subcategories?: string[]; is_leaf: boolean; available_count: number;
}

export interface Batch {
  id: string; name: string; reference?: string; branch_id: string; branch_name: string;
  default_price: number | null; created_by: string; created_by_name: string; created_at: string; garment_count: number;
}

export interface AISnapshot { suggested: string; suggested_name?: string; confidence: number; source: string; accepted?: boolean }

export interface AppEvent {
  id: string; entity_id: string; entity_type: string; action: string; timestamp: string; description: string; actor?: string;
}

export type PriceSource = 'category' | 'batch' | 'individual';

export interface Garment {
  id: string; category_id: string; batch_id: string; barcode: string; image_ref: string;
  attributes: Record<string, string>; price: number; price_source: PriceSource; status: 'available' | 'sold';
  ai?: AISnapshot; sale_id?: string; created_by: string; created_at: string;
  category_name: string; parent_name?: string; batch_name: string; image_url: string; barcode_url: string;
  description: string; created_by_name: string; sale_number?: string; events?: AppEvent[];
}

export interface Alternative { category: string; score: number }
export interface Classification {
  category: string; confidence: number; alternatives: Alternative[]; attributes: Record<string, string>;
  source: string; is_fallback: boolean; notice: string; latency_ms: number;
}

export interface SaleItem { garment_id: string; barcode: string; category_id: string; description: string; price: number }
export interface Sale {
  id: string; number: string; items: SaleItem[]; subtotal: number; discount: number; tax_rate: number; tax: number; total: number;
  payment_method: string; amount_tendered?: number; change_due?: number; status: 'draft' | 'completed';
  customer_id?: string; customer_name?: string; created_by: string; created_by_name: string; created_at: string;
  completed_at?: string; store_name: string; branch_name: string; tax_label: string;
}

export interface Settings {
  store_name: string; branch_id: string; currency: string; currency_symbol: string; tax_enabled: boolean;
  tax_rate: number; tax_label: string; show_price_on_label: boolean; payment_methods: string[];
}

export interface Sample { id: string; label: string; color_hex: string; color_name: string; intake: boolean; image_url: string }

export interface CategoryRow { category_id: string; name: string; parent: string; available: number; sold: number; stock_value: number }
export interface DashboardSummary {
  generated_at: string;
  sales_today: { count: number; revenue: number };
  items_sold_today: number;
  available_stock: { count: number; value: number };
  sold_total: number; total_garments: number; revenue_all_time: number;
  category_distribution: CategoryRow[];
  recent_sales: Sale[]; recent_activity: AppEvent[];
  payments_today: Record<string, number>;
  last_7_days: { date: string; sales: number; revenue: number }[];
  currency_symbol: string;
}
