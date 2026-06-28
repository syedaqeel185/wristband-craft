const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data: any;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const msg = data?.message;
    const asText = Array.isArray(msg) ? msg.join(', ') : (typeof msg === 'string' ? msg : null);
    throw new Error(asText || data?.error || response.statusText || 'API request failed');
  }

  return data;
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
}

export interface OrderTracking {
  orderId: string;
  status: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  courier?: string | null;
  estimatedDelivery?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
}

export function getOrderTracking(orderId: string) {
  return apiFetch(`/orders/${orderId}/tracking`) as Promise<OrderTracking>;
}

export interface OrderTimelineItem {
  id: string;
  orderId: string;
  fromStatus?: string | null;
  toStatus: string;
  note?: string | null;
  updatedByUserId?: string | null;
  createdAt: string;
}

export function getOrderTimeline(orderId: string) {
  return apiFetch(`/orders/${orderId}/timeline`) as Promise<OrderTimelineItem[]>;
}

// ---------------------------------------------------------------------------
// Products catalog + dynamic pricing
// ---------------------------------------------------------------------------

export type Currency = 'USD' | 'EUR' | 'GBP';
export type PrintType = 'none' | 'black' | 'color';

export interface PricingTier {
  id: string;
  minQuantity: number;
  maxQuantity?: number | null;
  pricePerUnitUsd: number;
  pricePerUnitEur?: number | null;
  pricePerUnitGbp?: number | null;
}

export interface CatalogProduct {
  id: string;
  supplierId: string;
  name: string;
  description?: string | null;
  wristbandType: string;
  priceUsd: number;
  priceEur?: number | null;
  priceGbp?: number | null;
  minOrderQuantity: number;
  maxOrderQuantity?: number | null;
  imageUrls: string;
  designSetupFeeUsd: number;
  qrCodePriceUsd: number;
  trademarkFeeUsd: number;
  pricingTiers: PricingTier[];
  supplier?: {
    id: string;
    companyName: string;
    city?: string | null;
    country?: string | null;
    logoUrl?: string | null;
    rating: number;
    isVerified: boolean;
  };
}

export interface ProductFilters {
  wristbandType?: string;
  supplierId?: string;
  search?: string;
}

export function getProducts(filters: ProductFilters = {}) {
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v != null && v !== '') as [string, string][],
  ).toString();
  return apiFetch(`/products${qs ? `?${qs}` : ''}`) as Promise<CatalogProduct[]>;
}

export function getProduct(id: string) {
  return apiFetch(`/products/${id}`) as Promise<CatalogProduct>;
}

export interface QuoteRequest {
  productId: string;
  quantity: number;
  currency?: Currency;
  printType?: PrintType;
  hasCustomDesign?: boolean;
  hasLogo?: boolean;
  qrEnabled?: boolean;
  trademarkEnabled?: boolean;
}

export interface PriceComponent {
  code: string;
  label: string;
  kind: 'per_unit' | 'flat';
  unitAmount: number;
  quantity: number;
  amount: number;
}

export interface PriceQuote {
  productId: string;
  currency: Currency;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  flatFees: number;
  total: number;
  components: PriceComponent[];
}

export function getQuote(req: QuoteRequest) {
  return apiFetch('/pricing/quote', {
    method: 'POST',
    body: JSON.stringify(req),
  }) as Promise<PriceQuote>;
}

// ---------------------------------------------------------------------------
// Payments (Stripe Checkout)
// ---------------------------------------------------------------------------

export function createCheckout(orderIds: string[]) {
  return apiFetch('/payments/checkout', {
    method: 'POST',
    body: JSON.stringify({ orderIds }),
  }) as Promise<{ url: string; sessionId: string }>;
}

export function confirmPayment(sessionId: string) {
  return apiFetch(`/payments/confirm?session_id=${encodeURIComponent(sessionId)}`) as Promise<{
    paid: boolean;
    orders: { id: string; status: string; paymentStatus: string }[];
  }>;
}

/** Confirm an order (from the email link) to start production. Token-authenticated. */
export function confirmProduction(token: string) {
  return apiFetch("/orders/confirm-production", {
    method: "POST",
    body: JSON.stringify({ token }),
  }) as Promise<{ confirmed?: boolean; alreadyConfirmed?: boolean; status?: string }>;
}

// ---------------------------------------------------------------------------
// Supplier directory + reviews
// ---------------------------------------------------------------------------

export interface DirectorySupplier {
  id: string;
  companyName: string;
  description?: string | null;
  city?: string | null;
  country?: string | null;
  logoUrl?: string | null;
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  productCount: number;
  services: string[];
}

export interface SupplierReview {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  reviewer: string;
}

export function getSupplierDirectory() {
  return apiFetch("/suppliers/directory") as Promise<DirectorySupplier[]>;
}

export function getRecentSuppliers() {
  return apiFetch("/suppliers/recent") as Promise<DirectorySupplier[]>;
}

export function getPendingReviews() {
  return apiFetch("/suppliers/pending-reviews") as Promise<{ supplierId: string; companyName: string }[]>;
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export interface CartItem {
  id: string;
  designId?: string | null;
  productId?: string | null;
  supplierId?: string | null;
  quantity: number;
  currency: string;
  options: Record<string, any>;
  design?: { designUrl?: string | null; wristbandType?: string | null; wristbandColor?: string | null } | null;
  unitPrice: number;
  lineTotal: number;
}

export interface Cart {
  id: string;
  currency: string;
  items: CartItem[];
  subtotal: number;
  count: number;
}

export interface AddCartItemInput {
  designId?: string;
  productId?: string;
  supplierId?: string;
  quantity: number;
  currency?: string;
  options?: Record<string, any>;
}

export function getCart() {
  return apiFetch("/cart") as Promise<Cart>;
}

export function addToCart(item: AddCartItemInput) {
  return apiFetch("/cart/items", { method: "POST", body: JSON.stringify(item) }) as Promise<Cart>;
}

export function updateCartItem(itemId: string, quantity: number) {
  return apiFetch(`/cart/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ quantity }) }) as Promise<Cart>;
}

export function removeCartItem(itemId: string) {
  return apiFetch(`/cart/items/${itemId}`, { method: "DELETE" }) as Promise<Cart>;
}

export function checkoutCart(shippingAddress?: Record<string, any>, extraCharges?: any) {
  return apiFetch("/cart/checkout", {
    method: "POST",
    body: JSON.stringify({ shippingAddress, extraCharges }),
  }) as Promise<{ orderIds: string[] }>;
}

export function getSupplierReviews(supplierId: string) {
  return apiFetch(`/suppliers/${supplierId}/reviews`) as Promise<SupplierReview[]>;
}

export function getCanReview(supplierId: string) {
  return apiFetch(`/suppliers/${supplierId}/can-review`) as Promise<{
    canReview: boolean;
    existingReview?: { id: string; rating: number; comment?: string | null } | null;
  }>;
}

export function createSupplierReview(supplierId: string, rating: number, comment?: string) {
  return apiFetch(`/suppliers/${supplierId}/reviews`, {
    method: "POST",
    body: JSON.stringify({ rating, comment }),
  }) as Promise<SupplierReview[]>;
}
