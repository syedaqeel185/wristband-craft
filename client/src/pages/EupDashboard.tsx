import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Truck,
  AlertTriangle,
  Clock,
  Euro,
  Package,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import EupLayout from "@/components/EupLayout";
import {
  getWholesaleInbound,
  getEupInsights,
  updateWholesaleOrderStatus,
  wholesalerMarkOrderPaid,
  type WholesaleOrder,
  type EupInsights,
} from "@/lib/api";
import {
  NEXT_STATUS,
  PAY_COLORS,
  PAY_LABEL,
  STATUS_COLORS,
  money2,
  shortDate,
  slaState,
} from "@/lib/wholesale-format";

/**
 * EUP's order book: what its suppliers have ordered, what they have paid, and
 * how each order stands against the delivery EUP promised when they paid.
 */
export default function EupDashboard() {
  const [orders, setOrders] = useState<WholesaleOrder[]>([]);
  const [insights, setInsights] = useState<EupInsights | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [o, i] = await Promise.all([
        getWholesaleInbound(),
        getEupInsights().catch(() => null),
      ]);
      setOrders(o);
      setInsights(i);
    } catch (e: any) {
      toast.error(e.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const open = orders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status));
    const awaitingPayment = orders.filter(
      (o) => o.paymentStatus !== "paid" && o.status !== "CANCELLED",
    );
    const overdue = open.filter((o) => slaState(o)?.tone === "late");
    const revenue = orders
      .filter((o) => o.paymentStatus === "paid")
      .reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    return { open: open.length, awaitingPayment: awaitingPayment.length, overdue: overdue.length, revenue };
  }, [orders]);

  const advance = async (o: WholesaleOrder, status: string, extra?: Record<string, string>) => {
    try {
      await updateWholesaleOrderStatus(o.id, { status, ...extra });
      toast.success(`Order ${status.toLowerCase().replace(/_/g, " ")}`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Update failed");
    }
  };

  const markPaid = async (o: WholesaleOrder) => {
    try {
      await wholesalerMarkOrderPaid(o.id);
      toast.success("Payment confirmed — production can start, delivery clock running");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to confirm payment");
    }
  };

  return (
    <EupLayout
      title="Orders from your suppliers"
      description="Production starts once a supplier has paid, with delivery promised within 7 days of that payment."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open orders" value={String(stats.open)} icon={Package} />
        <Stat label="Awaiting payment" value={String(stats.awaitingPayment)} icon={Clock} />
        <Stat
          label="Past promised date"
          value={String(stats.overdue)}
          icon={AlertTriangle}
          tone={stats.overdue > 0 ? "danger" : undefined}
        />
        <Stat label="Paid revenue" value={money2(stats.revenue)} icon={Euro} />
      </div>

      {insights ? <SalesBlockers insights={insights} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All orders</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !orders.length ? (
            <p className="text-sm text-muted-foreground">
              No orders yet. Suppliers can only order products you have priced in{" "}
              <span className="font-medium">Price lists</span>.
            </p>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  onAdvance={advance}
                  onMarkPaid={markPaid}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </EupLayout>
  );
}

/**
 * What is costing EUP sales right now, each with the action that fixes it.
 *
 * These are the silent failure modes: a product with no price is invisible to
 * every supplier, and a supplier who has never ordered is a relationship that
 * was set up and then forgotten. Neither shows up as an error anywhere.
 */
function SalesBlockers({ insights }: { insights: EupInsights }) {
  const { unpricedProducts, dormantBuyers, totals, topBuyers, months } = insights;
  const peak = Math.max(1, ...months.map((m) => m.revenue));
  const nothingWrong = !unpricedProducts.length && !dormantBuyers.length && !totals.awaitingPaymentCount;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Growing your sales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {nothingWrong ? (
            <p className="text-muted-foreground">
              Nothing is blocking sales — every product is priced and every supplier has ordered.
            </p>
          ) : null}

          {unpricedProducts.length ? (
            <div className="rounded border border-amber-300 bg-amber-50 p-3">
              <div className="font-medium text-amber-900">
                {unpricedProducts.length} product{unpricedProducts.length > 1 ? "s" : ""} nobody can buy
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                No default price, so these are hidden from every supplier's catalogue:{" "}
                {unpricedProducts.map((p) => p.name).join(", ")}
              </p>
              <Link to="/eup/prices">
                <Button size="sm" variant="outline" className="mt-2">
                  Set prices
                </Button>
              </Link>
            </div>
          ) : null}

          {dormantBuyers.length ? (
            <div className="rounded border border-blue-300 bg-blue-50 p-3">
              <div className="font-medium text-blue-900">
                {dormantBuyers.length} supplier{dormantBuyers.length > 1 ? "s have" : " has"} never ordered
              </div>
              <p className="text-xs text-blue-800 mt-0.5">
                {dormantBuyers
                  .slice(0, 4)
                  .map((b) => b.companyName)
                  .join(", ")}
                {dormantBuyers.length > 4 ? ` +${dormantBuyers.length - 4} more` : ""}
              </p>
              <p className="text-xs text-blue-800 mt-1">
                Worth checking they have a price set and know they can order.
              </p>
            </div>
          ) : null}

          {totals.awaitingPaymentCount ? (
            <div className="rounded border p-3">
              <div className="font-medium">
                {money2(totals.awaitingPaymentValue)} awaiting payment
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totals.awaitingPaymentCount} order{totals.awaitingPaymentCount > 1 ? "s" : ""} can't
                enter production until paid. Confirm any receipts with <b>Mark paid</b> below.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue — last 6 months</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2 h-28">
            {months.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/70 min-h-[2px]"
                  style={{ height: `${(m.revenue / peak) * 100}%` }}
                  title={`${m.month}: ${money2(m.revenue)} (${m.orders} orders)`}
                />
                <span className="text-[10px] text-muted-foreground">{m.month}</span>
              </div>
            ))}
          </div>

          {topBuyers.length ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Top suppliers by spend
              </div>
              <div className="space-y-1">
                {topBuyers.map((b) => (
                  <div key={b.id} className="flex justify-between text-sm">
                    <span className="truncate">{b.companyName}</span>
                    <span className="font-medium">{money2(b.spend)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No paid orders yet.</p>
          )}

          <div className="text-xs text-muted-foreground">
            {totals.activeBuyers} of {totals.buyers} suppliers have ordered.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "danger";
}) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center gap-3">
        <Icon className={tone === "danger" ? "h-5 w-5 text-red-600" : "h-5 w-5 text-primary"} />
        <div>
          <div className={tone === "danger" ? "text-2xl font-bold text-red-600" : "text-2xl font-bold"}>
            {value}
          </div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderRow({
  order: o,
  onAdvance,
  onMarkPaid,
}: {
  order: WholesaleOrder;
  onAdvance: (o: WholesaleOrder, status: string, extra?: Record<string, string>) => void;
  onMarkPaid: (o: WholesaleOrder) => void;
}) {
  const next = NEXT_STATUS[o.status];
  const paid = o.paymentStatus === "paid";
  const sla = slaState(o);
  const dest = o.customerInfo || o.shippingAddress;
  const destLabel = o.fulfilmentMode === "DROP_SHIP" ? "Deliver to end customer" : "Deliver to supplier";

  return (
    <div className="rounded-lg border p-3 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge className={STATUS_COLORS[o.status] || ""}>{o.status.replace(/_/g, " ")}</Badge>
        <Badge className={PAY_COLORS[o.paymentStatus || "unpaid"] || ""}>
          {PAY_LABEL[o.paymentStatus || "unpaid"] || "Unpaid"}
        </Badge>
        {sla ? <Badge className={sla.className}>{sla.label}</Badge> : null}
        <span className="font-medium">{o.product?.name || "Product"}</span>
        <span className="text-muted-foreground">×{o.quantity}</span>
        <Badge variant="outline">
          {o.fulfilmentMode === "DROP_SHIP" ? "Drop-ship" : "Ship to supplier"}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">{shortDate(o.createdAt)}</span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {o.buyer ? (
          <span>
            From: <span className="font-medium text-foreground">{o.buyer.companyName}</span>
            {o.buyer.contactEmail ? ` · ${o.buyer.contactEmail}` : ""}
          </span>
        ) : null}
        {o.eupPricePer1000 != null ? (
          <span>{money2(o.eupPricePer1000, o.currency)} / 1000 pcs</span>
        ) : null}
        <span>
          Goods {money2(o.goodsTotal ?? o.totalPrice, o.currency)}
          {o.freightTotal ? ` + freight ${money2(o.freightTotal, o.currency)}` : ""} ={" "}
          <span className="font-medium text-foreground">{money2(o.totalPrice, o.currency)}</span>
        </span>
        {o.paymentMethodProvider ? <span>via {o.paymentMethodProvider}</span> : null}
        {o.paymentReceiptUrl ? (
          <a
            href={o.paymentReceiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1"
          >
            View receipt <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>

      {paid ? (
        <div className="text-xs text-muted-foreground">
          Paid {shortDate(o.paidAt)} · deliver by{" "}
          <span className="font-medium text-foreground">{shortDate(o.promisedDeliveryAt)}</span>
          {o.productionStartedAt ? ` · production started ${shortDate(o.productionStartedAt)}` : ""}
        </div>
      ) : null}

      {dest ? (
        <div className="text-xs rounded bg-muted/50 p-2">
          <span className="font-medium">{destLabel}:</span>{" "}
          {[dest.name, dest.phone, dest.address, dest.city, dest.country].filter(Boolean).join(", ")}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 items-center">
        {!paid && o.status !== "CANCELLED" ? (
          <Button size="sm" variant="secondary" onClick={() => onMarkPaid(o)}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> Mark paid
          </Button>
        ) : null}
        {next ? (
          next === "SHIPPED" ? (
            <ShipInline
              onShip={(courier, trackingNumber) => onAdvance(o, "SHIPPED", { courier, trackingNumber })}
            />
          ) : (
            <Button
              size="sm"
              onClick={() => onAdvance(o, next)}
              disabled={next === "IN_PRODUCTION" && !paid}
              title={
                next === "IN_PRODUCTION" && !paid
                  ? "Confirm payment before starting production"
                  : undefined
              }
            >
              Mark {next.replace(/_/g, " ").toLowerCase()}
            </Button>
          )
        ) : null}
        {o.status !== "DELIVERED" && o.status !== "CANCELLED" ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600"
            onClick={() => onAdvance(o, "CANCELLED")}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ShipInline({ onShip }: { onShip: (courier: string, tracking: string) => void }) {
  const [open, setOpen] = useState(false);
  const [courier, setCourier] = useState("DHL");
  const [tracking, setTracking] = useState("");

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Truck className="h-4 w-4 mr-1" /> Ship
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <Label className="text-xs">Courier</Label>
        <Input className="h-8 w-24" value={courier} onChange={(e) => setCourier(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Tracking #</Label>
        <Input className="h-8 w-40" value={tracking} onChange={(e) => setTracking(e.target.value)} />
      </div>
      <Button size="sm" onClick={() => onShip(courier, tracking)}>
        Confirm
      </Button>
    </div>
  );
}
