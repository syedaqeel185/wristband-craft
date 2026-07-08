import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import {
  getMySubscription,
  getSubscriptionPayments,
  getSubscriptionPlans,
  cancelSubscription,
  resumeSubscription,
  changeSubscriptionPlan,
  applySubscriptionCoupon,
  removeSubscriptionCoupon,
  type SubscriptionState,
  type SubscriptionPayment,
  type SubscriptionPlan,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";

const STATUS_TONE: Record<string, string> = {
  TRIALING: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  ACTIVE: "bg-green-500/15 text-green-600 dark:text-green-400",
  PAST_DUE: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  CANCELED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-destructive/15 text-destructive",
};

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

const fmtMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "EUR" }).format(amount);

const SupplierBilling = () => {
  const navigate = useNavigate();
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [couponCode, setCouponCode] = useState("");

  const load = async () => {
    try {
      const [s, p, pl] = await Promise.all([
        getMySubscription(),
        getSubscriptionPayments(),
        getSubscriptionPlans(),
      ]);
      setSub(s);
      setPayments(p);
      setPlans(pl);
    } catch (e: any) {
      toast.error(e.message || "Could not load billing details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const doAction = async (fn: () => Promise<unknown>, successMsg: string) => {
    setActing(true);
    try {
      await fn();
      toast.success(successMsg);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    } finally {
      setActing(false);
    }
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    await doAction(() => applySubscriptionCoupon(couponCode.trim()), "Coupon applied");
    setCouponCode("");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/supplier")} className="mb-2 -ml-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Subscription &amp; Billing
            </h1>
          </div>
        </div>

        <SubscriptionBanner />

        {/* Current plan */}
        {sub && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    {sub.plan.name} plan
                  </CardTitle>
                  <CardDescription>{sub.plan.description}</CardDescription>
                </div>
                <Badge className={STATUS_TONE[sub.status] ?? ""}>{sub.status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <Stat label="Price">
                  {fmtMoney(sub.plan.priceEur ?? sub.plan.priceUsd, "EUR")}
                  <span className="text-muted-foreground">/{sub.plan.interval}</span>
                </Stat>
                {sub.isTrial ? (
                  <Stat label="Trial remaining">{sub.daysRemaining} days</Stat>
                ) : (
                  <Stat label="Renews in">{sub.daysRemaining} days</Stat>
                )}
                <Stat label={sub.cancelAtPeriodEnd ? "Access until" : "Next billing date"}>
                  {fmtDate(sub.cancelAtPeriodEnd ? sub.currentPeriodEnd : sub.nextBillingDate)}
                </Stat>
              </div>

              {/* Effective pricing breakdown (plan − coupon + country tax) */}
              {sub.pricing && (
                <div className="mt-6 rounded-lg border p-4 space-y-2 text-sm max-w-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plan price</span>
                    <span>{fmtMoney(sub.pricing.base, sub.pricing.currency)}</span>
                  </div>
                  {sub.pricing.discount > 0 && (
                    <div className="flex justify-between text-green-600 dark:text-green-400">
                      <span>Discount{sub.coupon ? ` (${sub.coupon.code})` : ""}</span>
                      <span>−{fmtMoney(sub.pricing.discount, sub.pricing.currency)}</span>
                    </div>
                  )}
                  {sub.pricing.taxRatePercent > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {sub.pricing.taxName || "Tax"} ({sub.pricing.taxRatePercent}%)
                      </span>
                      <span>{fmtMoney(sub.pricing.tax, sub.pricing.currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-2">
                    <span>Total / {sub.plan.interval}</span>
                    <span>{fmtMoney(sub.pricing.total, sub.pricing.currency)}</span>
                  </div>
                </div>
              )}

              {/* Coupon */}
              <div className="mt-4">
                {sub.coupon ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Badge className="bg-green-500/15 text-green-600 dark:text-green-400">{sub.coupon.code}</Badge>
                    <span className="text-muted-foreground">applied</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={acting}
                      onClick={() => doAction(removeSubscriptionCoupon, "Coupon removed")}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 max-w-sm">
                    <Input
                      placeholder="Coupon code"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                    />
                    <Button variant="outline" onClick={applyCoupon} disabled={acting || !couponCode.trim()}>
                      Apply
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mt-6">
                {sub.cancelAtPeriodEnd ? (
                  <Button
                    onClick={() => doAction(resumeSubscription, "Subscription resumed")}
                    disabled={acting}
                  >
                    Resume subscription
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => doAction(cancelSubscription, "Subscription will cancel at period end")}
                    disabled={acting}
                  >
                    Cancel subscription
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Plans */}
        {plans.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Available plans</CardTitle>
              <CardDescription>Change your plan at any time.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const current = sub?.plan.code === plan.code;
                const features: string[] = plan.featuresJson ? JSON.parse(plan.featuresJson) : [];
                return (
                  <div
                    key={plan.id}
                    className={`rounded-lg border p-4 flex flex-col ${current ? "border-primary ring-1 ring-primary" : ""}`}
                  >
                    <div className="font-semibold">{plan.name}</div>
                    <div className="text-2xl font-bold mt-1">
                      {fmtMoney(plan.priceEur ?? plan.priceUsd, "EUR")}
                      <span className="text-sm font-normal text-muted-foreground">/{plan.interval}</span>
                    </div>
                    <ul className="mt-3 space-y-1 text-sm text-muted-foreground flex-1">
                      {features.map((f) => (
                        <li key={f} className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" /> {f}
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="mt-4"
                      variant={current ? "secondary" : "default"}
                      disabled={current || acting}
                      onClick={() => doAction(() => changeSubscriptionPlan(plan.code), `Switched to ${plan.name}`)}
                    >
                      {current ? "Current plan" : "Switch to this plan"}
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Payment history */}
        <Card>
          <CardHeader>
            <CardTitle>Payment history</CardTitle>
            <CardDescription>Your subscription charges to the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No payments yet — you’re on a free trial.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{fmtDate(p.paidAt ?? p.createdAt)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
                      </TableCell>
                      <TableCell>{fmtMoney(p.amount, p.currency)}</TableCell>
                      <TableCell>
                        <Badge className={p.status === "PAID" ? STATUS_TONE.ACTIVE : STATUS_TONE.PAST_DUE}>
                          {p.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs uppercase tracking-wide">{label}</div>
      <div className="font-semibold text-base mt-0.5">{children}</div>
    </div>
  );
}

export default SupplierBilling;
