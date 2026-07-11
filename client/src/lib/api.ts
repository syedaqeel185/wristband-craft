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
    const error = new Error(asText || data?.error || response.statusText || 'API request failed') as Error & {
      code?: string;
      status?: number;
      reason?: string;
    };
    // Surface structured error fields (e.g. code: 'SUBSCRIPTION_INACTIVE') so the
    // UI can react — show the right banner, etc.
    error.code = data?.code;
    error.reason = data?.reason;
    error.status = response.status;
    throw error;
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

export interface CheckoutRoute {
  supplierId: string;
  supplierName?: string;
  orderIds: string[];
  amount: number;
  currency: string;
  type: 'stripe' | 'manual' | 'unavailable';
  provider?: string;
  label?: string | null;
  url?: string;
  sessionId?: string;
  instructions?: Record<string, unknown>;
  message?: string;
}

export interface CheckoutResponse {
  routes: CheckoutRoute[];
  url?: string;
  sessionId?: string;
}

export function createCheckout(orderIds: string[]) {
  return apiFetch('/payments/checkout', {
    method: 'POST',
    body: JSON.stringify({ orderIds }),
  }) as Promise<CheckoutResponse>;
}

/** Supplier/admin confirms an offline (manual/bank/wallet) payment was received. */
export function markOrderPaid(orderId: string) {
  return apiFetch(`/payments/orders/${orderId}/mark-paid`, { method: 'POST' }) as Promise<{
    paid?: boolean;
    alreadyPaid?: boolean;
    orderId: string;
  }>;
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
  countryCode?: string | null;
  logoUrl?: string | null;
  rating: number;
  reviewCount: number;
  totalOrders?: number;
  createdAt?: string;
  isLocal?: boolean;
  isVerified: boolean;
  productCount: number;
  services: string[];
}

export interface DirectoryFilters {
  country?: string;
  category?: string;
  minRating?: number;
  sort?: 'rating' | 'newest' | 'popular';
  near?: string;
}

export interface SupplierReview {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  reviewer: string;
}

export function getSupplierDirectory(filters: DirectoryFilters = {}) {
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v != null && v !== "") as [string, string][],
  ).toString();
  return apiFetch(`/suppliers/directory${qs ? `?${qs}` : ""}`) as Promise<DirectorySupplier[]>;
}

/** Set the current customer's country (used for country-aware discovery). */
export function setMyCountry(countryCode: string) {
  return apiFetch("/auth/me/country", { method: "PATCH", body: JSON.stringify({ countryCode }) }) as Promise<{
    success: boolean;
    countryCode: string;
  }>;
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

// ---------------------------------------------------------------------------
// Countries (reference data)
// ---------------------------------------------------------------------------

export interface Country {
  code: string;
  name: string;
  region?: string | null;
  currency?: string | null;
}

export function getCountries() {
  return apiFetch("/countries") as Promise<Country[]>;
}

// ---------------------------------------------------------------------------
// Subscriptions (supplier billing)
// ---------------------------------------------------------------------------

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  priceUsd: number;
  priceEur?: number | null;
  priceGbp?: number | null;
  interval: string;
  trialDays: number;
  isActive: boolean;
  featuresJson?: string | null;
}

export interface ChargeBreakdown {
  base: number;
  discount: number;
  taxable: number;
  taxRatePercent: number;
  taxName: string | null;
  tax: number;
  total: number;
  currency: string;
  couponCode: string | null;
}

export interface SubscriptionState {
  usable: boolean;
  reason: string | null;
  status: string;
  supplierStatus: string;
  isTrial: boolean;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingDate: string | null;
  cancelAtPeriodEnd: boolean;
  daysRemaining: number;
  plan: SubscriptionPlan;
  coupon: { code: string; description?: string | null } | null;
  pricing: ChargeBreakdown;
  subscriptionId: string;
}

export interface SubscriptionPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  paidAt?: string | null;
  failureReason?: string | null;
  createdAt: string;
}

export function getMySubscription() {
  return apiFetch("/subscriptions/me") as Promise<SubscriptionState>;
}

export function getSubscriptionPayments() {
  return apiFetch("/subscriptions/me/payments") as Promise<SubscriptionPayment[]>;
}

export function getSubscriptionPlans() {
  return apiFetch("/subscriptions/plans") as Promise<SubscriptionPlan[]>;
}

export function cancelSubscription() {
  return apiFetch("/subscriptions/me/cancel", { method: "POST" });
}

export function resumeSubscription() {
  return apiFetch("/subscriptions/me/resume", { method: "POST" });
}

export function changeSubscriptionPlan(planCode: string) {
  return apiFetch("/subscriptions/me/plan", { method: "POST", body: JSON.stringify({ planCode }) });
}

export function applySubscriptionCoupon(code: string) {
  return apiFetch("/subscriptions/me/coupon", { method: "POST", body: JSON.stringify({ code }) }) as Promise<SubscriptionState>;
}

export function removeSubscriptionCoupon() {
  return apiFetch("/subscriptions/me/coupon", { method: "DELETE" }) as Promise<SubscriptionState>;
}

// ---------------------------------------------------------------------------
// Supplier payment methods (own; secrets encrypted server-side)
// ---------------------------------------------------------------------------

export interface PaymentMethod {
  id: string;
  provider: string;
  label?: string | null;
  isDefault: boolean;
  isActive: boolean;
  status: string;
  stripeAccountId?: string | null;
  maskedConfig: Record<string, string>;
  createdAt: string;
}

export function getPaymentMethods() {
  return apiFetch("/payment-methods") as Promise<PaymentMethod[]>;
}

export function createPaymentMethod(input: {
  provider: string;
  label?: string;
  config?: Record<string, unknown>;
  isDefault?: boolean;
}) {
  return apiFetch("/payment-methods", { method: "POST", body: JSON.stringify(input) }) as Promise<PaymentMethod>;
}

export function updatePaymentMethod(
  id: string,
  input: { label?: string; config?: Record<string, unknown>; isActive?: boolean; isDefault?: boolean },
) {
  return apiFetch(`/payment-methods/${id}`, { method: "PATCH", body: JSON.stringify(input) }) as Promise<PaymentMethod>;
}

export function deletePaymentMethod(id: string) {
  return apiFetch(`/payment-methods/${id}`, { method: "DELETE" });
}

export interface StripeConnectStatus {
  connected: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled?: boolean;
  accountId: string | null;
}

export function startStripeConnect() {
  return apiFetch("/payment-methods/stripe/connect", { method: "POST" }) as Promise<{ url: string }>;
}

export function getStripeConnectStatus() {
  return apiFetch("/payment-methods/stripe/status") as Promise<StripeConnectStatus>;
}

// ---------------------------------------------------------------------------
// Platform owner (admin) dashboard
// ---------------------------------------------------------------------------

export interface AdminOverview {
  suppliers: { total: number; active: number; trial: number; expired: number; suspended: number; newThisMonth: number };
  subscriptions: { active: number; cancelled: number };
  revenue: { mrr: number; totalSubscriptionRevenue: number; currency: string };
  customers: { total: number };
  orders: { total: number; byStatus: { status: string; count: number }[] };
}

export interface AdminSupplier {
  id: string;
  companyName: string;
  contactEmail: string;
  country?: string | null;
  countryCode?: string | null;
  city?: string | null;
  status: string;
  isVerified: boolean;
  rating: number;
  createdAt: string;
  productCount: number;
  orderCount: number;
  subscription: {
    status: string;
    plan: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
}

export function getAdminOverview() {
  return apiFetch("/admin/overview") as Promise<AdminOverview>;
}

export function getAdminSuppliers(filters: { search?: string; country?: string; status?: string } = {}) {
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v != null && v !== "") as [string, string][],
  ).toString();
  return apiFetch(`/admin/suppliers${qs ? `?${qs}` : ""}`) as Promise<AdminSupplier[]>;
}

export function suspendSupplier(id: string) {
  return apiFetch(`/admin/suppliers/${id}/suspend`, { method: "PATCH" });
}

export function activateSupplier(id: string) {
  return apiFetch(`/admin/suppliers/${id}/activate`, { method: "PATCH" });
}

export function deleteSupplierAdmin(id: string) {
  return apiFetch(`/admin/suppliers/${id}`, { method: "DELETE" });
}

export function setSupplierCountry(id: string, countryCode: string) {
  return apiFetch(`/admin/suppliers/${id}/country`, {
    method: "PATCH",
    body: JSON.stringify({ countryCode }),
  });
}

export interface AdminRevenue {
  currency: string;
  mrr: number;
  monthlyRevenue: number;
  annualRevenue: number;
  totalSubscriptionRevenue: number;
  totalTaxCollected: number;
  totalDiscountsGiven: number;
  trend: { month: string; revenue: number }[];
  failedPayments: { id: string; supplier: string; amount: number; currency: string; reason?: string | null; createdAt: string }[];
  upcomingRenewals: { id: string; supplier: string; plan: string; renewsAt: string }[];
  cancelledSubscriptions: { id: string; supplier: string; plan: string; endsAt: string; status: string }[];
}

export function getAdminRevenue() {
  return apiFetch("/admin/revenue") as Promise<AdminRevenue>;
}

export interface Coupon {
  id: string;
  code: string;
  description?: string | null;
  discountType: string;
  discountValue: number;
  isActive: boolean;
  expiresAt?: string | null;
  maxRedemptions?: number | null;
  timesRedeemed: number;
}

export function getCoupons() {
  return apiFetch("/admin/coupons") as Promise<Coupon[]>;
}

export function createCoupon(input: {
  code: string;
  description?: string;
  discountType: string;
  discountValue: number;
  maxRedemptions?: number;
  expiresAt?: string;
}) {
  return apiFetch("/admin/coupons", { method: "POST", body: JSON.stringify(input) }) as Promise<Coupon>;
}

export function updateCoupon(id: string, input: { isActive?: boolean }) {
  return apiFetch(`/admin/coupons/${id}`, { method: "PATCH", body: JSON.stringify(input) }) as Promise<Coupon>;
}

export interface TaxRate {
  id: string;
  countryCode: string;
  name: string;
  ratePercent: number;
  isActive: boolean;
}

export function getTaxRates() {
  return apiFetch("/admin/tax-rates") as Promise<TaxRate[]>;
}

export function upsertTaxRate(input: { countryCode: string; name: string; ratePercent: number; isActive?: boolean }) {
  return apiFetch("/admin/tax-rates", { method: "POST", body: JSON.stringify(input) }) as Promise<TaxRate>;
}
