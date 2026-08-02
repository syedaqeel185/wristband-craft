/**
 * Shared presentation helpers for the EUP↔supplier flow. Used by both consoles
 * (the supplier's "Buy from EUP" page and EUP's own dashboard) so a status
 * badge or a price never renders differently depending on who is looking.
 */

export const SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

/** Per-unit amounts keep 3 decimals (suppliers price in mills, e.g. €0.018). */
export const money = (n: number | null | undefined, c = "EUR") =>
  `${SYMBOL[c] ?? ""}${(n ?? 0).toFixed(3).replace(/0$/, "")}`;

/** Order totals and per-1000 prices use 2 decimals. */
export const money2 = (n: number | null | undefined, c = "EUR") =>
  `${SYMBOL[c] ?? ""}${(n ?? 0).toFixed(2)}`;

export const STATUS_COLORS: Record<string, string> = {
  PLACED: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-blue-100 text-blue-800",
  IN_PRODUCTION: "bg-purple-100 text-purple-800",
  SHIPPED: "bg-cyan-100 text-cyan-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

/** What EUP can advance an inbound order to next. */
export const NEXT_STATUS: Record<string, string | null> = {
  PLACED: "ACCEPTED",
  ACCEPTED: "IN_PRODUCTION",
  IN_PRODUCTION: "SHIPPED",
  SHIPPED: "DELIVERED",
  DELIVERED: null,
  CANCELLED: null,
};

export const PAY_COLORS: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  awaiting_payment: "bg-amber-100 text-amber-800",
  unpaid: "bg-gray-100 text-gray-700",
};

export const PAY_LABEL: Record<string, string> = {
  paid: "Paid",
  awaiting_payment: "Payment sent",
  unpaid: "Unpaid",
};

export interface SlaState {
  label: string;
  tone: "ok" | "due" | "late" | "done";
  className: string;
}

/**
 * Where an order stands against the delivery EUP promised when the supplier
 * paid. Returns null before payment — the clock has not started yet.
 */
export function slaState(order: {
  status: string;
  promisedDeliveryAt?: string | null;
}): SlaState | null {
  if (!order.promisedDeliveryAt) return null;
  const due = new Date(order.promisedDeliveryAt);
  if (Number.isNaN(due.getTime())) return null;

  if (order.status === "DELIVERED") {
    return { label: "Delivered", tone: "done", className: "bg-green-100 text-green-800" };
  }
  if (order.status === "CANCELLED") return null;

  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) {
    return {
      label: `${Math.abs(days)}d overdue`,
      tone: "late",
      className: "bg-red-100 text-red-800",
    };
  }
  if (days <= 2) {
    return { label: `Due in ${days}d`, tone: "due", className: "bg-amber-100 text-amber-800" };
  }
  return { label: `${days}d left`, tone: "ok", className: "bg-slate-100 text-slate-700" };
}

/** "2 Aug 2026" — short, unambiguous across locales. */
export function shortDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
