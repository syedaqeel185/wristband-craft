import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Package, DollarSign, TrendingUp, Truck, MapPin, CheckCircle2, Receipt, Clock } from "lucide-react";
import { ProductionDownload } from "@/components/ProductionDownload";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ShippingAddress {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  phone?: string;
}

interface Order {
  id: string;
  supplierId?: string;
  quantity: number;
  totalPrice: number;
  unitPrice: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  printType?: string;
  currency?: string;
  extraCharges?: Record<string, number> | null;
  customizationNotes?: string | null;
  shippingAddress?: ShippingAddress | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  courier?: string | null;
  estimatedDelivery?: string | null;
  canManage?: boolean;
  user: { email: string; fullName?: string | null } | null;
  design: {
    id?: string;
    designUrl: string;
    wristbandType: string;
    wristbandColor?: string;
    customText: string | null;
    canvasJson?: string | null;
    metaJson?: string | null;
  } | null;
  supplier: { companyName: string } | null;
}

// Mirrors the server's order state machine (orders.service.ts).
const STATUS_FLOW: Record<string, { next: string; label: string }[]> = {
  DRAFT: [{ next: "PLACED", label: "Mark placed" }, { next: "CANCELLED", label: "Cancel" }],
  PLACED: [{ next: "ACCEPTED", label: "Accept order" }, { next: "CANCELLED", label: "Decline" }],
  ACCEPTED: [{ next: "IN_PRODUCTION", label: "Start production" }, { next: "CANCELLED", label: "Cancel" }],
  IN_PRODUCTION: [{ next: "CANCELLED", label: "Cancel" }], // SHIPPED happens via the shipment form
  SHIPPED: [{ next: "DELIVERED", label: "Mark delivered" }],
  DELIVERED: [],
  CANCELLED: [],
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-gray-400",
  PLACED: "bg-yellow-500",
  ACCEPTED: "bg-blue-500",
  IN_PRODUCTION: "bg-indigo-500",
  SHIPPED: "bg-purple-500",
  DELIVERED: "bg-green-600",
  CANCELLED: "bg-red-500",
};

const norm = (s: string) => (s || "").trim().toUpperCase();

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSupplier, setIsSupplier] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return navigate("/auth");
        if (user.roles?.includes("admin")) setIsAdmin(true);
        else if (user.roles?.includes("supplier")) setIsSupplier(true);
        else {
          toast.error("Access denied — Admin or Supplier only");
          return navigate("/");
        }
        await fetchOrders();
      } catch {
        navigate("/");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchOrders = async () => {
    try {
      const data = (await apiFetch("/orders")) as Order[];
      setOrders(data || []);
    } catch {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const analytics = useMemo(() => {
    const live = orders.filter((o) => norm(o.status) !== "CANCELLED");
    const revenue = live.reduce((s, o) => s + Number(o.totalPrice || 0), 0);
    const paidRevenue = orders
      .filter((o) => o.paymentStatus === "paid")
      .reduce((s, o) => s + Number(o.totalPrice || 0), 0);
    const byStatus = ["PLACED", "ACCEPTED", "IN_PRODUCTION", "SHIPPED", "DELIVERED", "CANCELLED"].map(
      (s) => ({ status: s.replace("_", " "), key: s, count: orders.filter((o) => norm(o.status) === s).length }),
    );
    // Revenue per month (last 6 months) from non-cancelled orders.
    const months: { label: string; revenue: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString(undefined, { month: "short" });
      const revenueForMonth = live
        .filter((o) => {
          const od = new Date(o.createdAt);
          return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth();
        })
        .reduce((s, o) => s + Number(o.totalPrice || 0), 0);
      months.push({ label, revenue: Math.round(revenueForMonth * 100) / 100 });
    }
    return {
      revenue,
      paidRevenue,
      active: orders.filter((o) => ["PLACED", "ACCEPTED", "IN_PRODUCTION"].includes(norm(o.status))).length,
      delivered: orders.filter((o) => norm(o.status) === "DELIVERED").length,
      awaitingPayment: orders.filter((o) => o.paymentStatus !== "paid" && norm(o.status) !== "CANCELLED").length,
      aov: live.length ? revenue / live.length : 0,
      byStatus,
      months,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "ALL" && norm(o.status) !== statusFilter) return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        (o.user?.email || "").toLowerCase().includes(q) ||
        (o.user?.fullName || "").toLowerCase().includes(q)
      );
    });
  }, [orders, statusFilter, search]);

  if (!isAdmin && !isSupplier) return null;

  const STATUS_BAR_COLORS: Record<string, string> = {
    PLACED: "#eab308",
    ACCEPTED: "#3b82f6",
    IN_PRODUCTION: "#6366f1",
    SHIPPED: "#a855f7",
    DELIVERED: "#16a34a",
    CANCELLED: "#ef4444",
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent flex-1">
            {isAdmin ? "Admin Dashboard" : "Supplier Dashboard"}
          </h1>
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/designs")}>
            Designs
          </Button>
          {isSupplier && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate("/admin/products")}>
                Products
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/admin/pricing")}>
                Pricing
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <StatCard label="Total Orders" value={orders.length} icon={<Package className="h-4 w-4" />} />
          <StatCard label="Revenue" value={`€${analytics.revenue.toFixed(2)}`} icon={<DollarSign className="h-4 w-4" />} />
          <StatCard label="Paid Revenue" value={`€${analytics.paidRevenue.toFixed(2)}`} icon={<Receipt className="h-4 w-4" />} />
          <StatCard label="Avg Order" value={`€${analytics.aov.toFixed(2)}`} icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label="In Pipeline" value={analytics.active} icon={<Clock className="h-4 w-4" />} />
          <StatCard label="Delivered" value={analytics.delivered} icon={<CheckCircle2 className="h-4 w-4" />} />
        </div>

        {/* Charts */}
        {orders.length > 0 && (
          <div className="grid lg:grid-cols-2 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Orders by status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={analytics.byStatus} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="status" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={50} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <RTooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {analytics.byStatus.map((s) => (
                        <Cell key={s.key} fill={STATUS_BAR_COLORS[s.key] || "#6366f1"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Revenue (last 6 months)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={analytics.months} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RTooltip formatter={(v: number) => `€${Number(v).toFixed(2)}`} />
                    <Bar dataKey="revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Order history + filters */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading orders…</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto opacity-50 mb-2" />
            <p>{isSupplier ? "No orders have been routed to you yet." : "No orders yet."}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">{isSupplier ? "Your orders" : "All orders"}</h2>
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Search by order # or customer…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-56"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All statuses</SelectItem>
                    {["PLACED", "ACCEPTED", "IN_PRODUCTION", "SHIPPED", "DELIVERED", "CANCELLED"].map((s) => (
                      <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {filteredOrders.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No orders match your filters.</p>
            ) : (
              filteredOrders.map((order) => (
                <OrderCard key={order.id} order={order} isAdmin={isAdmin} onChanged={fetchOrders} />
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
};

const StatCard = ({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium">{label}</CardTitle>
      <span className="text-muted-foreground">{icon}</span>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
);

const OrderCard = ({
  order,
  isAdmin,
  onChanged,
}: {
  order: Order;
  isAdmin: boolean;
  onChanged: () => void;
}) => {
  const status = norm(order.status);
  const canManage = isAdmin || order.canManage === true;
  const [busy, setBusy] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [ship, setShip] = useState({
    courier: order.courier || "",
    trackingNumber: order.trackingNumber || "",
    trackingUrl: order.trackingUrl || "",
    estimatedDelivery: order.estimatedDelivery ? order.estimatedDelivery.slice(0, 10) : "",
  });
  const addr = order.shippingAddress || null;
  const actions = STATUS_FLOW[status] || [];

  const setStatus = async (next: string) => {
    setBusy(true);
    try {
      await apiFetch(`/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      toast.success(`Order ${next.toLowerCase().replace("_", " ")}`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    } finally {
      setBusy(false);
    }
  };

  const submitShipment = async () => {
    if (!ship.trackingNumber && !ship.courier) {
      toast.error("Enter a courier and/or tracking number");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/orders/${order.id}/shipment`, {
        method: "PATCH",
        body: JSON.stringify({
          courier: ship.courier || undefined,
          trackingNumber: ship.trackingNumber || undefined,
          trackingUrl: ship.trackingUrl || undefined,
          estimatedDelivery: ship.estimatedDelivery || undefined,
        }),
      });
      toast.success("Shipment saved — order marked shipped");
      setShipOpen(false);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to save shipment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg">Order #{order.id.slice(0, 8)}</CardTitle>
              <Badge className={`${STATUS_COLOR[status] || "bg-gray-500"} text-white`}>
                {status.replace("_", " ")}
              </Badge>
              <Badge variant="outline">{order.paymentStatus || "unpaid"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {order.user?.fullName || order.user?.email || "Customer"}
            </p>
          </div>
          {canManage && actions.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {actions.map((a) =>
                a.next === "CANCELLED" ? (
                  <Button
                    key={a.next}
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    className="text-destructive"
                    onClick={() => setStatus(a.next)}
                  >
                    {a.label}
                  </Button>
                ) : (
                  <Button key={a.next} size="sm" disabled={busy} onClick={() => setStatus(a.next)}>
                    {a.label}
                  </Button>
                ),
              )}
              {status === "IN_PRODUCTION" && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setShipOpen((v) => !v)}>
                  <Truck className="h-4 w-4 mr-1" />
                  Ship
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid md:grid-cols-3 gap-4">
          {order.design && (
            <div className="bg-[linear-gradient(135deg,#fafafa,#e9e9ee)] rounded-lg p-2 flex items-center">
              <img src={order.design.designUrl} alt="Design" className="w-full object-contain" />
            </div>
          )}
          <div className="md:col-span-2 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              <Field label="Type" value={order.design?.wristbandType || "—"} />
              <Field label="Quantity" value={`${order.quantity} pcs`} />
              <Field
                label="Colour"
                value={
                  <span className="inline-flex items-center gap-1">
                    {order.design?.wristbandColor && (
                      <span
                        className="w-3 h-3 rounded-full border"
                        style={{ backgroundColor: order.design.wristbandColor }}
                      />
                    )}
                    {order.design?.wristbandColor || "—"}
                  </span>
                }
              />
              <Field label="Print" value={order.printType || "none"} />
              <Field label="Unit" value={`€${Number(order.unitPrice || 0).toFixed(3)}`} />
              <Field label="Total" value={<span className="text-primary">€{Number(order.totalPrice || 0).toFixed(2)}</span>} />
            </div>

            {/* Delivery address */}
            <div className="border-t pt-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <MapPin className="h-3.5 w-3.5" /> Delivery address
              </div>
              {addr && (addr.address || addr.city) ? (
                <div className="text-sm">
                  {addr.name && <div className="font-medium">{addr.name}</div>}
                  <div>{addr.address}</div>
                  <div>
                    {[addr.city, addr.state, addr.zipCode].filter(Boolean).join(", ")}
                  </div>
                  <div>{addr.country}</div>
                  {addr.phone && <div className="text-muted-foreground">☎ {addr.phone}</div>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not provided yet (added at checkout).</p>
              )}
            </div>

            {/* Tracking summary */}
            {(order.trackingNumber || order.courier) && (
              <div className="text-sm border-t pt-3">
                <div className="text-xs text-muted-foreground mb-1">Shipment</div>
                <div>
                  {order.courier ? `${order.courier} · ` : ""}
                  {order.trackingNumber}
                  {order.trackingUrl && (
                    <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="text-primary ml-2 underline">
                      Track
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Shipment form */}
            {canManage && shipOpen && (
              <div className="border rounded-lg p-3 space-y-2 bg-secondary/10">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Courier</Label>
                    <Input value={ship.courier} onChange={(e) => setShip({ ...ship, courier: e.target.value })} placeholder="DHL, UPS…" />
                  </div>
                  <div>
                    <Label className="text-xs">Tracking number</Label>
                    <Input value={ship.trackingNumber} onChange={(e) => setShip({ ...ship, trackingNumber: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Tracking URL</Label>
                    <Input value={ship.trackingUrl} onChange={(e) => setShip({ ...ship, trackingUrl: e.target.value })} placeholder="https://…" />
                  </div>
                  <div>
                    <Label className="text-xs">Est. delivery</Label>
                    <Input type="date" value={ship.estimatedDelivery} onChange={(e) => setShip({ ...ship, estimatedDelivery: e.target.value })} />
                  </div>
                </div>
                <Button size="sm" disabled={busy} onClick={submitShipment}>
                  <Truck className="h-4 w-4 mr-1" />
                  Confirm shipment
                </Button>
              </div>
            )}

            {canManage ? (
              <div className="border-t pt-3">
                <h4 className="font-semibold text-sm mb-2">Production files</h4>
                <ProductionDownload order={order} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground border-t pt-3">
                Production downloads are available for orders your company fulfils.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <span className="text-xs text-muted-foreground">{label}</span>
    <div className="font-semibold capitalize">{value}</div>
  </div>
);

export default AdminDashboard;
