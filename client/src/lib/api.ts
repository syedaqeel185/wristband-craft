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
      setupUrl?: string;
    };
    // Surface structured error fields (e.g. code: 'SUBSCRIPTION_INACTIVE',
    // 'CONNECT_NOT_ENABLED') so the UI can react — show the right banner, redirect
    // the owner to enable Connect, etc.
    error.code = data?.code;
    error.reason = data?.reason;
    error.setupUrl = data?.setupUrl;
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

/**
 * Upload an image file to Vercel Blob via the server and get back a public URL.
 * Reuses the authenticated `/designs/upload` endpoint (multipart). We never
 * embed images as base64 in JSON payloads (413 risk).
 */
export async function uploadImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_URL}/designs/upload`, {
    method: 'POST',
    headers: { ...getAuthHeaders() }, // no Content-Type — browser sets the multipart boundary
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Upload failed');
  return data as { url: string };
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

/** A sub-choice within a product option (e.g. QR code → Static / Dynamic). */
export interface OptionChoice {
  key: string;
  label: string;
  description?: string | null;
  /** When set, the selected choice's price replaces the option's base price. */
  priceUsd?: number | null;
  priceEur?: number | null;
  priceGbp?: number | null;
}

/**
 * A supplier-configured customization add-on. Fully dynamic — suppliers can
 * rename, price, reorder, disable, and create unlimited options. The Design
 * Studio and product pages render whatever is configured here.
 */
export interface ProductOption {
  id?: string;
  key: string;
  label: string;
  description?: string | null;
  groupName?: string | null;
  pricingMode: 'per_unit' | 'one_time';
  priceUsd: number;
  priceEur?: number | null;
  priceGbp?: number | null;
  isActive: boolean;
  sortOrder: number;
  /** How the Design Studio renders it: toggle | print | qr | trademark | design_setup. */
  studioModule: string;
  choices?: OptionChoice[];
}

/** A customization option (by key) the customer selected. */
export interface SelectedOption {
  key: string;
  choiceKey?: string;
}

/** Starting option template for new products (supplier can change everything). */
export function getOptionDefaults() {
  return apiFetch('/products/option-defaults') as Promise<ProductOption[]>;
}

/** Distinct wristband types across active products (data-driven, not hardcoded). */
export function getWristbandTypes() {
  return apiFetch('/products/types') as Promise<string[]>;
}

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
  options: ProductOption[];
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
  /** Supplier-configured options selected by the customer (preferred). */
  selectedOptions?: SelectedOption[];
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

// ---------------------------------------------------------------------------
// Checkout options: the customer picks a method per supplier, pays via Stripe
// or submits a manual/offline payment (Payoneer, JazzCash, bank, …) + receipt.
// ---------------------------------------------------------------------------

export interface CheckoutMethod {
  id: string;
  provider: string;
  label: string;
  kind: 'stripe' | 'manual';
  available: boolean;
  instructions: Record<string, unknown>;
}

export interface CheckoutGroup {
  supplierId: string;
  supplierName: string;
  orderIds: string[];
  amount: number;
  currency: string;
  alreadyPaid: boolean;
  receiptUrl: string | null;
  methods: CheckoutMethod[];
}

export function getCheckoutOptions(orderIds: string[]) {
  return apiFetch(`/payments/options?orderIds=${encodeURIComponent(orderIds.join(','))}`) as Promise<{
    groups: CheckoutGroup[];
  }>;
}

export function createStripeSessionForGroup(supplierId: string, orderIds: string[]) {
  return apiFetch('/payments/stripe-session', {
    method: 'POST',
    body: JSON.stringify({ supplierId, orderIds }),
  }) as Promise<{ url?: string; sessionId?: string }>;
}

export function submitPaymentReceipt(orderIds: string[], provider: string, receiptUrl?: string) {
  return apiFetch('/payments/submit-receipt', {
    method: 'POST',
    body: JSON.stringify({ orderIds, provider, receiptUrl }),
  }) as Promise<{ ok: boolean; orderIds: string[] }>;
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
  /** Lowest per-unit price the supplier offers (for price sorting/display). */
  fromPrice?: number | null;
}

export interface DirectoryFilters {
  country?: string;
  category?: string;
  minRating?: number;
  sort?: 'rating' | 'rating_asc' | 'newest' | 'popular' | 'price_asc' | 'price_desc';
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

export interface ShippingQuote {
  supplierId: string;
  quantity: number;
  courier: string;
  label?: string | null;
  cost: number;
  estMinDays?: number | null;
  estMaxDays?: number | null;
  isFallback: boolean;
}

export interface Cart {
  id: string;
  currency: string;
  items: CartItem[];
  subtotal: number;
  count: number;
  /** Server-authoritative delivery per supplier + total. */
  shipping?: { perSupplier: ShippingQuote[]; total: number };
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

// ---------------------------------------------------------------------------
// Delivery / couriers (per supplier)
// ---------------------------------------------------------------------------

export interface ShippingRateTier {
  id?: string;
  minQuantity: number;
  maxQuantity?: number | null;
  priceEur: number;
  priceUsd?: number | null;
  priceGbp?: number | null;
}

export interface ShippingRate {
  id: string;
  supplierId?: string;
  courier: string;
  label?: string | null;
  freeOverQty?: number | null;
  estMinDays?: number | null;
  estMaxDays?: number | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  tiers: ShippingRateTier[];
}

export type ShippingRateInput = Omit<ShippingRate, 'id' | 'supplierId'> & { id?: string };

export function getMyShipping() {
  return apiFetch('/suppliers/me/shipping') as Promise<ShippingRate[]>;
}

export function createShipping(input: ShippingRateInput) {
  return apiFetch('/suppliers/me/shipping', { method: 'POST', body: JSON.stringify(input) }) as Promise<ShippingRate>;
}

export function updateShipping(id: string, input: Partial<ShippingRateInput>) {
  return apiFetch(`/suppliers/me/shipping/${id}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<ShippingRate>;
}

export function deleteShipping(id: string) {
  return apiFetch(`/suppliers/me/shipping/${id}`, { method: 'DELETE' }) as Promise<{ success: boolean }>;
}

export function getSupplierShipping(supplierId: string) {
  return apiFetch(`/suppliers/${supplierId}/shipping`) as Promise<ShippingRate[]>;
}

// ---------------------------------------------------------------------------
// Public supplier storefront
// ---------------------------------------------------------------------------

export interface StorefrontProduct {
  id: string;
  name: string;
  description?: string | null;
  wristbandType: string;
  priceUsd: number;
  priceEur?: number | null;
  priceGbp?: number | null;
  minOrderQuantity: number;
  maxOrderQuantity?: number | null;
  images: string[];
  designSetupFeeUsd: number;
  qrCodePriceUsd: number;
  trademarkFeeUsd: number;
  colorPrintExtraUsd: number;
  logoExtraUsd: number;
  pricingTiers: PricingTier[];
  options: ProductOption[];
}

export interface SupplierProfile {
  supplier: {
    id: string;
    companyName: string;
    description?: string | null;
    logoUrl?: string | null;
    website?: string | null;
    city?: string | null;
    country?: string | null;
    countryCode?: string | null;
    rating: number;
    reviewCount: number;
    totalOrders: number;
    isVerified: boolean;
    createdAt: string;
  };
  products: StorefrontProduct[];
  reviews: SupplierReview[];
  shipping: ShippingRate[];
  stats: {
    productCount: number;
    ordersFulfilled: number;
    memberSince: string;
    rating: number;
    reviewCount: number;
  };
}

export function getSupplierProfile(id: string) {
  return apiFetch(`/suppliers/${id}/profile`) as Promise<SupplierProfile>;
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
  isWholesaler: boolean;
  isHouseWholesaler: boolean;
  hasOwnProduction: boolean;
  wholesalerId?: string | null;
  assignedWholesaler?: { id: string; companyName: string } | null;
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

export interface AdminWholesaler {
  id: string;
  companyName: string;
  contactEmail: string;
  country?: string | null;
  status: string;
  isHouseWholesaler: boolean;
  productCount: number;
  assignedSupplierCount: number;
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

// ---- Admin: wholesaler management ----

export function getAdminWholesalers() {
  return apiFetch("/admin/wholesalers") as Promise<AdminWholesaler[]>;
}

/** Turn a supplier INTO an EUP (grants the `eup` role). Inverse: pass false. */
export function promoteSupplierToEup(id: string, isWholesaler: boolean, isHouseWholesaler?: boolean) {
  return apiFetch(`/admin/suppliers/${id}/promote-eup`, {
    method: "PATCH",
    body: JSON.stringify({ isWholesaler, isHouseWholesaler }),
  });
}

export function setSupplierProduction(id: string, hasOwnProduction: boolean) {
  return apiFetch(`/admin/suppliers/${id}/production`, {
    method: "PATCH",
    body: JSON.stringify({ hasOwnProduction }),
  });
}

/** Point a supplier AT the EUP it buys from. Null = the house EUP. */
export function assignSupplierToEup(id: string, wholesalerId: string | null) {
  return apiFetch(`/admin/suppliers/${id}/assign-eup`, {
    method: "PATCH",
    body: JSON.stringify({ wholesalerId }),
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

// ---------------------------------------------------------------------------
// Wholesaler layer: a supplier orders stock from its assigned wholesaler; a
// wholesaler manages its discounts, offers and inbound orders.
// ---------------------------------------------------------------------------

export type FulfilmentMode = 'SHIP_TO_SUPPLIER' | 'DROP_SHIP';

export interface WholesalerCard {
  id: string;
  companyName: string;
  logoUrl?: string | null;
  description?: string | null;
  contactEmail: string;
  contactPhone?: string | null;
  website?: string | null;
  city?: string | null;
  country?: string | null;
  countryCode?: string | null;
  isHouseWholesaler: boolean;
}

export interface WholesalerOffer {
  id: string;
  wholesalerId?: string;
  title: string;
  description?: string | null;
  discountPercent?: number | null;
  code?: string | null;
  minQuantity?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface MyWholesaler {
  wholesaler: WholesalerCard | null;
  /** Promotional banners only — offers do not change what a supplier pays. */
  offers: WholesalerOffer[];
  hasOwnProduction: boolean;
  isWholesaler: boolean;
  mustUseWholesaler: boolean;
  /** Days from payment to promised delivery. */
  productionSlaDays: number;
}

export interface WholesaleCatalogProduct {
  id: string;
  name: string;
  description?: string | null;
  wristbandType: string;
  minOrderQuantity: number;
  maxOrderQuantity?: number | null;
  availableSizes: any[];
  availableColors: any[];
  imageUrls: string[];
  options: ProductOption[];
  /** False when EUP has not set a price for this supplier + product yet. */
  orderable: boolean;
  priceSource: 'supplier' | 'default' | null;
  pricePer1000Eur?: number | null;
  pricePer1000Usd?: number | null;
  pricePer1000Gbp?: number | null;
}

export interface WholesaleCatalog {
  wholesaler: WholesalerCard | null;
  products: WholesaleCatalogProduct[];
}

export interface EupQuoteLine {
  code: string;
  label: string;
  kind: 'per_1000' | 'per_unit' | 'flat';
  rate: number;
  amount: number;
}

/** What a supplier pays EUP: fixed price per 1000 pcs, plus freight on top. */
export interface WholesaleQuote {
  currency: Currency;
  quantity: number;
  pricePer1000: number;
  priceSource: 'supplier' | 'default';
  goodsTotal: number;
  freightTotal: number;
  freightRateId: string | null;
  freightLabel: string | null;
  estMinDays: number | null;
  estMaxDays: number | null;
  total: number;
  /** Total cost normalised per 1000 pcs, including freight. */
  effectivePer1000: number;
  lines: EupQuoteLine[];
}

export interface WholesaleOrder {
  id: string;
  quantity: number;
  currency: string;
  listUnitPrice?: number | null;
  unitPrice?: number | null;
  discountPercent: number;
  totalPrice: number;
  /** The fixed EUP price per 1000 pcs in force when the order was placed. */
  eupPricePer1000?: number | null;
  goodsTotal?: number | null;
  freightTotal?: number | null;
  /** SLA clock: production starts on payment, delivery promised 7 days later. */
  paidAt?: string | null;
  productionStartedAt?: string | null;
  promisedDeliveryAt?: string | null;
  status: string;
  paymentStatus?: string | null;
  paymentMethodProvider?: string | null;
  paymentReceiptUrl?: string | null;
  fulfilmentMode: FulfilmentMode;
  sourceOrderId?: string | null;
  customerInfo?: Record<string, any> | null;
  shippingAddress?: Record<string, any> | null;
  selectedOptions?: SelectedOption[] | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  courier?: string | null;
  notes?: string | null;
  createdAt: string;
  product?: { id: string; name: string; wristbandType: string } | null;
  /** What the end customer paid on the linked order, for margin display. */
  customerPaid?: number | null;
  customerCurrency?: string | null;
  wholesaler?: { id: string; companyName: string; contactEmail?: string; contactPhone?: string | null };
  buyer?: { id: string; companyName: string; contactEmail?: string; contactPhone?: string | null; city?: string | null; country?: string | null };
}

export interface PlaceWholesaleOrderInput {
  productId: string;
  quantity: number;
  currency?: Currency;
  selectedOptions?: SelectedOption[];
  fulfilmentMode?: FulfilmentMode;
  sourceOrderId?: string;
  customerInfo?: Record<string, any>;
  /** The buyer supplier's own delivery address (ship-to-supplier). */
  shippingAddress?: Record<string, any>;
  notes?: string;
}

/** Payment options a wholesaler offers for a wholesale order (buyer's view). */
export interface WholesalePaymentOptions {
  orderId: string;
  wholesalerName: string;
  amount: number;
  currency: string;
  alreadyPaid: boolean;
  receiptUrl: string | null;
  methods: CheckoutMethod[];
}

export interface WholesalerDiscount {
  id: string;
  wholesalerId: string;
  supplierId?: string | null;
  percent: number;
  note?: string | null;
  isActive: boolean;
  supplier?: { id: string; companyName: string } | null;
}

// Buyer side
export function getMyWholesaler() {
  return apiFetch("/wholesale/me/wholesaler") as Promise<MyWholesaler>;
}

export function getWholesaleCatalog() {
  return apiFetch("/wholesale/me/catalog") as Promise<WholesaleCatalog>;
}

export function getWholesaleQuote(input: PlaceWholesaleOrderInput) {
  return apiFetch("/wholesale/me/quote", { method: "POST", body: JSON.stringify(input) }) as Promise<WholesaleQuote>;
}

export function placeWholesaleOrder(input: PlaceWholesaleOrderInput) {
  return apiFetch("/wholesale/me/orders", { method: "POST", body: JSON.stringify(input) }) as Promise<WholesaleOrder>;
}

export function getMyWholesaleOrders() {
  return apiFetch("/wholesale/me/orders") as Promise<WholesaleOrder[]>;
}

export function setMyProduction(hasOwnProduction: boolean) {
  return apiFetch("/wholesale/me/production", {
    method: "PATCH",
    body: JSON.stringify({ hasOwnProduction }),
  }) as Promise<{ id: string; hasOwnProduction: boolean }>;
}

// Buyer: pay the wholesaler for a wholesale order
export function getWholesalePaymentOptions(orderId: string) {
  return apiFetch(`/wholesale/orders/${orderId}/payment-options`) as Promise<WholesalePaymentOptions>;
}

export function wholesalePayStripe(orderId: string) {
  return apiFetch(`/wholesale/orders/${orderId}/pay/stripe`, { method: "POST" }) as Promise<{
    url?: string;
    sessionId?: string;
  }>;
}

export function wholesaleSubmitReceipt(orderId: string, provider: string, receiptUrl?: string) {
  return apiFetch(`/wholesale/orders/${orderId}/pay/receipt`, {
    method: "POST",
    body: JSON.stringify({ provider, receiptUrl }),
  }) as Promise<{ ok: boolean; orderId: string }>;
}

export function confirmWholesaleStripe(sessionId: string) {
  return apiFetch("/wholesale/payments/confirm", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  }) as Promise<{ paid: boolean; orderId: string | null }>;
}

/** Wholesaler confirms an offline payment was received. */
export function wholesalerMarkOrderPaid(orderId: string) {
  return apiFetch(`/wholesale/orders/${orderId}/mark-paid`, { method: "POST" }) as Promise<{
    paid?: boolean;
    alreadyPaid?: boolean;
    orderId: string;
  }>;
}

// Wholesaler side
export function getWholesaleInbound() {
  return apiFetch("/wholesale/me/inbound") as Promise<WholesaleOrder[]>;
}

export function updateWholesaleOrderStatus(
  id: string,
  input: { status: string; trackingNumber?: string; trackingUrl?: string; courier?: string; note?: string },
) {
  return apiFetch(`/wholesale/orders/${id}/status`, { method: "PATCH", body: JSON.stringify(input) }) as Promise<WholesaleOrder>;
}

export function getWholesaleDiscounts() {
  return apiFetch("/wholesale/me/discounts") as Promise<WholesalerDiscount[]>;
}

export function upsertWholesaleDiscount(input: { supplierId?: string | null; percent: number; note?: string; isActive?: boolean }) {
  return apiFetch("/wholesale/me/discounts", { method: "POST", body: JSON.stringify(input) }) as Promise<WholesalerDiscount>;
}

export function deleteWholesaleDiscount(id: string) {
  return apiFetch(`/wholesale/me/discounts/${id}`, { method: "DELETE" }) as Promise<{ success: boolean }>;
}

export function getWholesaleOffers() {
  return apiFetch("/wholesale/me/offers") as Promise<WholesalerOffer[]>;
}

export function createWholesaleOffer(input: Partial<WholesalerOffer>) {
  return apiFetch("/wholesale/me/offers", { method: "POST", body: JSON.stringify(input) }) as Promise<WholesalerOffer>;
}

export function updateWholesaleOffer(id: string, input: Partial<WholesalerOffer>) {
  return apiFetch(`/wholesale/me/offers/${id}`, { method: "PATCH", body: JSON.stringify(input) }) as Promise<WholesalerOffer>;
}

export function deleteWholesaleOffer(id: string) {
  return apiFetch(`/wholesale/me/offers/${id}`, { method: "DELETE" }) as Promise<{ success: boolean }>;
}

// ---------------------------------------------------------------------------
// EUP console: the suppliers EUP sells to, the fixed prices it charges them
// per 1000 pcs, and the freight it bills on top. All EUP-managed — there are
// no price constants anywhere in the codebase.
// ---------------------------------------------------------------------------

export interface EupBuyer {
  id: string;
  companyName: string;
  contactEmail: string;
  country?: string | null;
  countryCode?: string | null;
  status: string;
  hasOwnProduction: boolean;
}

export interface EupPrice {
  id: string;
  wholesalerId: string;
  productId: string;
  /** null = EUP's default price for this product, for every supplier. */
  supplierId?: string | null;
  pricePer1000Eur: number;
  pricePer1000Usd?: number | null;
  pricePer1000Gbp?: number | null;
  note?: string | null;
  isActive: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
  product?: { id: string; name: string; wristbandType: string } | null;
  supplier?: { id: string; companyName: string } | null;
}

export type FreightMode = 'SHIP_TO_SUPPLIER' | 'DROP_SHIP' | 'ANY';

export interface EupFreightRate {
  id: string;
  wholesalerId: string;
  supplierId?: string | null;
  countryCode?: string | null;
  fulfilmentMode: FreightMode;
  label?: string | null;
  pricePer1000Eur: number;
  pricePer1000Usd?: number | null;
  pricePer1000Gbp?: number | null;
  minChargeEur?: number | null;
  minChargeUsd?: number | null;
  minChargeGbp?: number | null;
  freeOverQty?: number | null;
  estMinDays?: number | null;
  estMaxDays?: number | null;
  isActive: boolean;
  sortOrder: number;
  supplier?: { id: string; companyName: string } | null;
}

/** The signed-in account's own catalogue (EUP's products, for pricing them). */
export interface MyProduct {
  id: string;
  name: string;
  wristbandType: string;
  minOrderQuantity: number;
  maxOrderQuantity?: number | null;
  isActive: boolean;
  sortOrder?: number;
}

export function getMyProducts() {
  return apiFetch("/suppliers/me/products") as Promise<MyProduct[]>;
}

export function getEupBuyers() {
  return apiFetch("/wholesale/me/buyers") as Promise<EupBuyer[]>;
}

/** Onboard a supplier into EUP's book. `tempPassword` is shown once, never again. */
export function createEupBuyer(input: {
  email: string;
  companyName: string;
  contactName?: string;
  contactPhone?: string;
  countryCode?: string;
  hasOwnProduction?: boolean;
}) {
  return apiFetch("/wholesale/me/buyers", { method: "POST", body: JSON.stringify(input) }) as Promise<{
    supplier: EupBuyer;
    tempPassword: string;
  }>;
}

export function setEupBuyerStatus(id: string, status: "ACTIVE" | "SUSPENDED") {
  return apiFetch(`/wholesale/me/buyers/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function setEupBuyerProduction(id: string, hasOwnProduction: boolean) {
  return apiFetch(`/wholesale/me/buyers/${id}/production`, {
    method: "PATCH",
    body: JSON.stringify({ hasOwnProduction }),
  });
}

/** Refused with SUPPLIER_HAS_ORDERS when the supplier has any order history. */
export function deleteEupBuyer(id: string) {
  return apiFetch(`/wholesale/me/buyers/${id}`, { method: "DELETE" }) as Promise<{ success: boolean }>;
}

/** What is currently costing EUP sales, plus revenue trend. */
export interface EupInsights {
  totals: {
    buyers: number;
    activeBuyers: number;
    dormantBuyers: number;
    paidRevenue: number;
    awaitingPaymentValue: number;
    awaitingPaymentCount: number;
    overdueCount: number;
  };
  unpricedProducts: Array<{ id: string; name: string }>;
  dormantBuyers: Array<{
    id: string;
    companyName: string;
    contactEmail: string;
    hasOwnProduction: boolean;
  }>;
  months: Array<{ month: string; revenue: number; orders: number }>;
  topBuyers: Array<{ id: string; companyName: string; spend: number }>;
}

export function getEupInsights() {
  return apiFetch("/wholesale/me/insights") as Promise<EupInsights>;
}

export function getEupPrices() {
  return apiFetch("/wholesale/me/prices") as Promise<EupPrice[]>;
}

export function upsertEupPrice(input: {
  productId: string;
  supplierId?: string | null;
  pricePer1000Eur: number;
  pricePer1000Usd?: number | null;
  pricePer1000Gbp?: number | null;
  note?: string;
  validFrom?: string;
  validUntil?: string;
  isActive?: boolean;
}) {
  return apiFetch("/wholesale/me/prices", { method: "POST", body: JSON.stringify(input) }) as Promise<EupPrice>;
}

export function deleteEupPrice(id: string) {
  return apiFetch(`/wholesale/me/prices/${id}`, { method: "DELETE" }) as Promise<{ success: boolean }>;
}

export function getEupFreight() {
  return apiFetch("/wholesale/me/freight") as Promise<EupFreightRate[]>;
}

export function createEupFreight(input: Partial<EupFreightRate> & { pricePer1000Eur: number }) {
  return apiFetch("/wholesale/me/freight", { method: "POST", body: JSON.stringify(input) }) as Promise<EupFreightRate>;
}

export function updateEupFreight(id: string, input: Partial<EupFreightRate> & { pricePer1000Eur: number }) {
  return apiFetch(`/wholesale/me/freight/${id}`, { method: "PATCH", body: JSON.stringify(input) }) as Promise<EupFreightRate>;
}

export function deleteEupFreight(id: string) {
  return apiFetch(`/wholesale/me/freight/${id}`, { method: "DELETE" }) as Promise<{ success: boolean }>;
}

/** Current supplier account (includes wholesaler/production flags). */
export interface MeSupplier {
  id: string;
  companyName: string;
  contactEmail: string;
  contactPhone?: string | null;
  isWholesaler: boolean;
  isHouseWholesaler: boolean;
  hasOwnProduction: boolean;
  wholesalerId?: string | null;
}

export function getMeSupplier() {
  return apiFetch("/suppliers/me") as Promise<MeSupplier & Record<string, any>>;
}
