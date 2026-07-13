import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CreditCard, Loader2, Plus, Star, Trash2, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import {
  getPaymentMethods,
  createPaymentMethod,
  deletePaymentMethod,
  updatePaymentMethod,
  startStripeConnect,
  getStripeConnectStatus,
  type PaymentMethod,
  type StripeConnectStatus,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";

// Provider → the config fields the supplier fills in. These become the payment
// instructions shown to the customer at checkout (stored encrypted server-side).
const MANUAL_PROVIDERS: Record<string, { label: string; fields: { key: string; label: string }[] }> = {
  BANK_TRANSFER: {
    label: "Bank Transfer",
    fields: [
      { key: "accountHolder", label: "Account holder" },
      { key: "bankName", label: "Bank name" },
      { key: "iban", label: "IBAN / Account number" },
      { key: "swift", label: "SWIFT / BIC (optional)" },
    ],
  },
  JAZZCASH: {
    label: "JazzCash",
    fields: [
      { key: "accountName", label: "Account name" },
      { key: "mobileNumber", label: "Mobile number" },
    ],
  },
  EASYPAISA: {
    label: "EasyPaisa",
    fields: [
      { key: "accountName", label: "Account name" },
      { key: "mobileNumber", label: "Mobile number" },
    ],
  },
  PAYPAL: {
    label: "PayPal",
    fields: [{ key: "paypalEmail", label: "PayPal email" }],
  },
  PAYONEER: {
    label: "Payoneer",
    fields: [
      { key: "payoneerEmail", label: "Payoneer email" },
      { key: "payeeId", label: "Payoneer customer ID (optional)" },
    ],
  },
  MANUAL: {
    label: "Other / Manual",
    fields: [{ key: "instructions", label: "Payment instructions" }],
  },
};

const SupplierPayments = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [connect, setConnect] = useState<StripeConnectStatus | null>(null);
  const [connectNotice, setConnectNotice] = useState<{ message: string; setupUrl: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [provider, setProvider] = useState("BANK_TRANSFER");
  const [label, setLabel] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const [m, c] = await Promise.all([getPaymentMethods(), getStripeConnectStatus().catch(() => null)]);
      setMethods(m);
      setConnect(c);
    } catch (e: any) {
      toast.error(e.message || "Could not load payment methods");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Returning from Stripe onboarding — refresh status.
    if (searchParams.get("connect")) {
      toast.info("Checking your Stripe connection…");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const STRIPE_CONNECT_SETUP_URL = "https://dashboard.stripe.com/connect/accounts/overview";

  const handleConnect = async () => {
    setBusy(true);
    try {
      const { url } = await startStripeConnect();
      // Stripe-hosted onboarding — send the supplier straight there.
      window.location.href = url;
    } catch (e: any) {
      // Connect isn't enabled on the platform Stripe account yet (a one-time
      // owner setup). Instead of a dead-end error, take them to the Stripe page
      // where it's enabled, and leave an explanation on screen.
      if (e.code === "CONNECT_NOT_ENABLED" || e.code === "CONNECT_ERROR" || e.setupUrl) {
        const setupUrl = e.setupUrl || STRIPE_CONNECT_SETUP_URL;
        setConnectNotice({ message: e.message || "Stripe Connect needs to be enabled first.", setupUrl });
        window.open(setupUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.error(e.message || "Could not start Stripe onboarding");
      }
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    const fields = MANUAL_PROVIDERS[provider].fields;
    const filled = fields.filter((f) => config[f.key]?.trim());
    if (filled.length === 0) {
      toast.error("Please fill in at least one detail");
      return;
    }
    setBusy(true);
    try {
      await createPaymentMethod({ provider, label: label || MANUAL_PROVIDERS[provider].label, config });
      toast.success("Payment method added");
      setLabel("");
      setConfig({});
      await load();
    } catch (e: any) {
      toast.error(e.message || "Could not add payment method");
    } finally {
      setBusy(false);
    }
  };

  const setDefault = async (id: string) => {
    try {
      await updatePaymentMethod(id, { isDefault: true });
      toast.success("Default payment method updated");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    }
  };

  const remove = async (id: string) => {
    try {
      await deletePaymentMethod(id);
      toast.success("Payment method removed");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to remove");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const manualMethods = methods.filter((m) => m.provider !== "STRIPE_CONNECT");

  return (
    <div className="min-h-screen bg-gradient-subtle p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/supplier")} className="mb-2 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Payment Methods
          </h1>
          <p className="text-muted-foreground">
            Configure how customers pay you. Customer payments go directly to your account — the platform never
            holds your funds.
          </p>
        </div>

        <SubscriptionBanner />

        {/* Stripe Connect */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" /> Card payments (Stripe)
                </CardTitle>
                <CardDescription>Accept cards worldwide. Payouts go to your bank via Stripe.</CardDescription>
              </div>
              {connect?.connected ? (
                <Badge className="bg-green-500/15 text-green-600 dark:text-green-400">Connected</Badge>
              ) : connect?.accountId ? (
                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">Setup incomplete</Badge>
              ) : (
                <Badge variant="secondary">Not connected</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {connect?.connected ? (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" /> Your Stripe account is ready to accept card payments.
              </div>
            ) : (
              <>
                <Button onClick={handleConnect} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
                  {connect?.accountId ? "Continue Stripe setup" : "Connect with Stripe"}
                </Button>

                {connectNotice && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <p className="text-amber-800 dark:text-amber-200">{connectNotice.message}</p>
                    </div>
                    <a
                      href={connectNotice.setupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300 hover:underline"
                    >
                      Open Stripe Connect setup <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <p className="text-xs text-muted-foreground">
                      Once Connect is enabled on the platform's Stripe account, come back and click
                      “Connect with Stripe” again to finish.
                    </p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Card payments run through Stripe Connect, which the platform owner enables once at{" "}
                  <a
                    href="https://dashboard.stripe.com/connect/accounts/overview"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    dashboard.stripe.com/connect
                  </a>
                  . Stripe isn't available in every country (e.g. Pakistan) — if that's you, skip this and use a
                  bank or wallet method below, which works right away.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Manual / offline methods */}
        <Card>
          <CardHeader>
            <CardTitle>Bank & wallet methods</CardTitle>
            <CardDescription>
              Bank transfer, JazzCash, EasyPaisa, PayPal, Payoneer or custom instructions. Customers see these
              details and pay you directly; you confirm receipt from your orders.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {manualMethods.length > 0 && (
              <div className="space-y-2">
                {manualMethods.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {m.label || m.provider}
                        {m.isDefault && (
                          <Badge className="bg-primary/15 text-primary text-xs">Default</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {Object.entries(m.maskedConfig)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ") || m.provider}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!m.isDefault && (
                        <Button size="sm" variant="ghost" onClick={() => setDefault(m.id)} title="Make default">
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(m.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add form */}
            <div className="rounded-lg border border-dashed p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Method</Label>
                  <Select
                    value={provider}
                    onValueChange={(v) => {
                      setProvider(v);
                      setConfig({});
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(MANUAL_PROVIDERS).map(([key, def]) => (
                        <SelectItem key={key} value={key}>
                          {def.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Display label (optional)</Label>
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={MANUAL_PROVIDERS[provider].label} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {MANUAL_PROVIDERS[provider].fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label>{f.label}</Label>
                    <Input
                      value={config[f.key] || ""}
                      onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={handleAdd} disabled={busy}>
                <Plus className="h-4 w-4 mr-2" /> Add payment method
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SupplierPayments;
