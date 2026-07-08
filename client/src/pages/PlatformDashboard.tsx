import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Building2,
  Users,
  ShoppingCart,
  TrendingUp,
  Ban,
  CheckCircle2,
  Search,
  Trash2,
  LogOut,
  Loader2,
} from "lucide-react";
import {
  getAdminOverview,
  getAdminSuppliers,
  suspendSupplier,
  activateSupplier,
  deleteSupplierAdmin,
  getCountries,
  getAdminRevenue,
  getCoupons,
  createCoupon,
  updateCoupon,
  getTaxRates,
  upsertTaxRate,
  clearToken,
  type AdminOverview,
  type AdminSupplier,
  type Country,
  type AdminRevenue,
  type Coupon,
  type TaxRate,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const money = (n: number, c = "EUR") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);

const STATUS_TONE: Record<string, string> = {
  TRIALING: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  ACTIVE: "bg-green-500/15 text-green-600 dark:text-green-400",
  PAST_DUE: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  CANCELED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-destructive/15 text-destructive",
};

const PlatformDashboard = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [suppliers, setSuppliers] = useState<AdminSupplier[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [status, setStatus] = useState("all");

  const [revenue, setRevenue] = useState<AdminRevenue | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [couponForm, setCouponForm] = useState({ code: "", discountType: "percent", discountValue: "" });
  const [taxForm, setTaxForm] = useState({ countryCode: "", name: "", ratePercent: "" });

  const loadOverview = async () => {
    try {
      const [ov, cs, rev, cp, tr] = await Promise.all([
        getAdminOverview(),
        getCountries(),
        getAdminRevenue().catch(() => null),
        getCoupons().catch(() => []),
        getTaxRates().catch(() => []),
      ]);
      setOverview(ov);
      setCountries(cs);
      setRevenue(rev);
      setCoupons(cp);
      setTaxRates(tr);
    } catch (e: any) {
      toast.error(e.message || "Failed to load dashboard");
    }
  };

  const submitCoupon = async () => {
    if (!couponForm.code.trim() || !couponForm.discountValue) {
      toast.error("Enter a code and discount value");
      return;
    }
    try {
      await createCoupon({
        code: couponForm.code.trim(),
        discountType: couponForm.discountType,
        discountValue: Number(couponForm.discountValue),
      });
      toast.success("Coupon created");
      setCouponForm({ code: "", discountType: "percent", discountValue: "" });
      await loadOverview();
    } catch (e: any) {
      toast.error(e.message || "Failed to create coupon");
    }
  };

  const toggleCoupon = async (c: Coupon) => {
    try {
      await updateCoupon(c.id, { isActive: !c.isActive });
      await loadOverview();
    } catch (e: any) {
      toast.error(e.message || "Failed to update coupon");
    }
  };

  const submitTax = async () => {
    if (!taxForm.countryCode.trim() || !taxForm.name.trim() || !taxForm.ratePercent) {
      toast.error("Fill in country, name and rate");
      return;
    }
    try {
      await upsertTaxRate({
        countryCode: taxForm.countryCode.trim(),
        name: taxForm.name.trim(),
        ratePercent: Number(taxForm.ratePercent),
      });
      toast.success("Tax rate saved");
      setTaxForm({ countryCode: "", name: "", ratePercent: "" });
      await loadOverview();
    } catch (e: any) {
      toast.error(e.message || "Failed to save tax rate");
    }
  };

  const loadSuppliers = async () => {
    try {
      const data = await getAdminSuppliers({
        search: search || undefined,
        country: country === "all" ? undefined : country,
        status: status === "all" ? undefined : status,
      });
      setSuppliers(data);
    } catch (e: any) {
      toast.error(e.message || "Failed to load suppliers");
    }
  };

  useEffect(() => {
    getCurrentUser().then((u) => {
      if (!u || !u.roles.includes("admin")) {
        navigate("/");
        return;
      }
      Promise.all([loadOverview(), loadSuppliers()]).finally(() => setLoading(false));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-query suppliers when filters change (debounced for search).
  useEffect(() => {
    const t = setTimeout(loadSuppliers, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, country, status]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      await Promise.all([loadOverview(), loadSuppliers()]);
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    }
  };

  const ordersChart = useMemo(
    () => (overview?.orders.byStatus ?? []).map((o) => ({ name: o.status, count: o.count })),
    [overview],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Platform Owner Dashboard
            </h1>
            <p className="text-muted-foreground">Marketplace overview &amp; supplier management</p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              clearToken();
              navigate("/");
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>

        {/* KPI cards */}
        {overview && (
          <>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              <Kpi icon={<Building2 />} label="Total suppliers" value={overview.suppliers.total} />
              <Kpi icon={<CheckCircle2 />} label="Active" value={overview.suppliers.active} />
              <Kpi icon={<TrendingUp />} label="On trial" value={overview.suppliers.trial} />
              <Kpi icon={<Ban />} label="Expired" value={overview.suppliers.expired} />
              <Kpi icon={<Ban />} label="Suspended" value={overview.suppliers.suspended} />
              <Kpi icon={<Building2 />} label="New this month" value={overview.suppliers.newThisMonth} />
            </div>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              <Kpi icon={<TrendingUp />} label="MRR" value={money(overview.revenue.mrr, overview.revenue.currency)} />
              <Kpi
                icon={<TrendingUp />}
                label="Subscription revenue"
                value={money(overview.revenue.totalSubscriptionRevenue, overview.revenue.currency)}
              />
              <Kpi icon={<CheckCircle2 />} label="Active subs" value={overview.subscriptions.active} />
              <Kpi icon={<Ban />} label="Cancelled subs" value={overview.subscriptions.cancelled} />
              <Kpi icon={<Users />} label="Customers" value={overview.customers.total} />
              <Kpi icon={<ShoppingCart />} label="Orders" value={overview.orders.total} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Orders by status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={ordersChart}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis allowDecimals={false} fontSize={12} />
                    <RTooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} className="fill-primary" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}

        {/* Supplier management */}
        <Card>
          <CardHeader>
            <CardTitle>Supplier management</CardTitle>
            <CardDescription>View, search, filter, and manage every supplier.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search company or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="md:w-48">
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All countries</SelectItem>
                  {countries.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="md:w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead className="text-right">Products</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                        No suppliers match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    suppliers.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="font-medium">{s.companyName}</div>
                          <div className="text-xs text-muted-foreground">{s.contactEmail}</div>
                        </TableCell>
                        <TableCell>{s.country ?? "—"}</TableCell>
                        <TableCell>
                          {s.subscription ? (
                            <div className="flex items-center gap-2">
                              <Badge className={STATUS_TONE[s.subscription.status] ?? ""}>
                                {s.subscription.status}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{s.subscription.plan}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{s.productCount}</TableCell>
                        <TableCell className="text-right">{s.orderCount}</TableCell>
                        <TableCell>
                          <Badge variant={s.status === "SUSPENDED" ? "destructive" : "secondary"}>
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-2 whitespace-nowrap">
                          {s.status === "SUSPENDED" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => act(() => activateSupplier(s.id), "Supplier activated")}
                            >
                              Activate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => act(() => suspendSupplier(s.id), "Supplier suspended")}
                            >
                              Suspend
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {s.companyName}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the supplier, its products, subscription and payment methods.
                                  Past orders are kept but detached. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => act(() => deleteSupplierAdmin(s.id), "Supplier deleted")}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Revenue analytics */}
        {revenue && (
          <Card>
            <CardHeader>
              <CardTitle>Revenue</CardTitle>
              <CardDescription>Subscription revenue received by the platform owner.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                <Kpi icon={<TrendingUp />} label="MRR" value={money(revenue.mrr, revenue.currency)} />
                <Kpi icon={<TrendingUp />} label="This month" value={money(revenue.monthlyRevenue, revenue.currency)} />
                <Kpi icon={<TrendingUp />} label="This year" value={money(revenue.annualRevenue, revenue.currency)} />
                <Kpi icon={<TrendingUp />} label="All time" value={money(revenue.totalSubscriptionRevenue, revenue.currency)} />
                <Kpi icon={<TrendingUp />} label="Tax collected" value={money(revenue.totalTaxCollected, revenue.currency)} />
                <Kpi icon={<TrendingUp />} label="Discounts given" value={money(revenue.totalDiscountsGiven, revenue.currency)} />
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Revenue — last 6 months</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={revenue.trend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} />
                    <RTooltip />
                    <Bar dataKey="revenue" radius={[4, 4, 0, 0]} className="fill-primary" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <MiniList
                  title="Failed payments"
                  empty="No failed payments"
                  rows={revenue.failedPayments.map((f) => ({
                    key: f.id,
                    left: f.supplier,
                    right: money(f.amount, f.currency),
                  }))}
                />
                <MiniList
                  title="Upcoming renewals (30d)"
                  empty="No renewals in the next 30 days"
                  rows={revenue.upcomingRenewals.map((r) => ({
                    key: r.id,
                    left: r.supplier,
                    right: new Date(r.renewsAt).toLocaleDateString(),
                  }))}
                />
                <MiniList
                  title="Cancelled"
                  empty="No cancellations"
                  rows={revenue.cancelledSubscriptions.map((c) => ({
                    key: c.id,
                    left: c.supplier,
                    right: c.status,
                  }))}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Coupons & taxes */}
        <Card>
          <CardHeader>
            <CardTitle>Coupons &amp; Taxes</CardTitle>
            <CardDescription>Discount codes and per-country tax applied to subscriptions.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-8 md:grid-cols-2">
            {/* Coupons */}
            <div className="space-y-3">
              <div className="font-medium">Coupons</div>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="CODE"
                  className="w-28"
                  value={couponForm.code}
                  onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })}
                />
                <Select
                  value={couponForm.discountType}
                  onValueChange={(v) => setCouponForm({ ...couponForm, discountType: v })}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">% off</SelectItem>
                    <SelectItem value="fixed">€ off</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Value"
                  className="w-24"
                  value={couponForm.discountValue}
                  onChange={(e) => setCouponForm({ ...couponForm, discountValue: e.target.value })}
                />
                <Button onClick={submitCoupon}>Add</Button>
              </div>
              <div className="space-y-1">
                {coupons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No coupons yet.</p>
                ) : (
                  coupons.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded border p-2 text-sm">
                      <div>
                        <span className="font-medium">{c.code}</span>{" "}
                        <span className="text-muted-foreground">
                          {c.discountType === "percent" ? `${c.discountValue}% off` : `€${c.discountValue} off`} ·{" "}
                          {c.timesRedeemed} used
                        </span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => toggleCoupon(c)}>
                        {c.isActive ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Tax rates */}
            <div className="space-y-3">
              <div className="font-medium">Tax rates</div>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Country (e.g. DE)"
                  className="w-32"
                  value={taxForm.countryCode}
                  onChange={(e) => setTaxForm({ ...taxForm, countryCode: e.target.value })}
                />
                <Input
                  placeholder="Name (e.g. VAT)"
                  className="w-28"
                  value={taxForm.name}
                  onChange={(e) => setTaxForm({ ...taxForm, name: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="%"
                  className="w-20"
                  value={taxForm.ratePercent}
                  onChange={(e) => setTaxForm({ ...taxForm, ratePercent: e.target.value })}
                />
                <Button onClick={submitTax}>Save</Button>
              </div>
              <div className="space-y-1">
                {taxRates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tax rates configured.</p>
                ) : (
                  taxRates.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded border p-2 text-sm">
                      <span>
                        <span className="font-medium">{t.countryCode}</span> — {t.name}
                      </span>
                      <span className="text-muted-foreground">{t.ratePercent}%</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function MiniList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { key: string; left: string; right: string }[];
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-sm font-medium mb-2">{title}</div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-1">
          {rows.slice(0, 6).map((r) => (
            <div key={r.key} className="flex justify-between text-xs">
              <span className="truncate mr-2">{r.left}</span>
              <span className="text-muted-foreground whitespace-nowrap">{r.right}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold mt-1">{value}</div>
          </div>
          <div className="text-primary/60 [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default PlatformDashboard;
