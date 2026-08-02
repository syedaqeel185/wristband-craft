import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  CreditCard,
  Banknote,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import EupLayout from "@/components/EupLayout";
import {
  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  startStripeConnect,
  getStripeConnectStatus,
  type PaymentMethod,
  type StripeConnectStatus,
} from "@/lib/api";

/**
 * How suppliers pay EUP. Same `/payment-methods` API the supplier console uses
 * — EUP's account carries the `supplier` role underneath, so the plumbing is
 * shared; only the framing differs (here the payer is a supplier, not a
 * customer).
 *
 * Until at least one method exists here, the Pay button on a supplier's
 * wholesale order has nothing to offer and no order can ever be paid — which
 * blocks production, because production only starts once payment lands.
 */
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
  PAYONEER: {
    label: "Payoneer",
    fields: [
      { key: "payoneerEmail", label: "Payoneer email (recipient)" },
      { key: "paymentLink", label: "Payoneer payment link (recommended — suppliers click to pay you)" },
      { key: "payeeId", label: "Payoneer customer ID (optional)" },
    ],
  },
  PAYPAL: {
    label: "PayPal",
    fields: [{ key: "paypalEmail", label: "PayPal email" }],
  },
  MANUAL: {
    label: "Other / Manual",
    fields: [{ key: "instructions", label: "Payment instructions" }],
  },
};

export default function EupPayments() {
  const [loading, setLoading] = useState(true);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [stripe, setStripe] = useState<StripeConnectStatus | null>(null);

  const [provider, setProvider] = useState("BANK_TRANSFER");
  const [label, setLabel] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [m, s] = await Promise.all([
        getPaymentMethods(),
        getStripeConnectStatus().catch(() => null),
      ]);
      setMethods(m);
      setStripe(s);
    } catch (e: any) {
      toast.error(e.message || "Failed to load payment methods");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    const def = MANUAL_PROVIDERS[provider];
    const filled = def.fields.filter((f) => config[f.key]?.trim());
    if (!filled.length) {
      toast.error(`Fill in at least one ${def.label} detail`);
      return;
    }
    setSaving(true);
    try {
      await createPaymentMethod({
        provider,
        label: label.trim() || def.label,
        config: Object.fromEntries(filled.map((f) => [f.key, config[f.key].trim()])),
      });
      setLabel("");
      setConfig({});
      toast.success(`${def.label} added — suppliers can now pay you this way`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Could not add payment method");
    } finally {
      setSaving(false);
    }
  };

  const connectStripe = async () => {
    try {
      const { url } = await startStripeConnect();
      window.location.href = url;
    } catch (e: any) {
      toast.error(e.message || "Could not start Stripe onboarding");
    }
  };

  const usable = methods.filter((m) => m.isActive);

  return (
    <EupLayout
      title="How suppliers pay you"
      description="Suppliers settle their wholesale orders against these. Production starts once payment lands."
    >
      {!loading && !usable.length ? (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="pt-6 flex gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-900">
                You have no active payment method — no supplier can pay you.
              </p>
              <p className="text-red-800 mt-1">
                The Pay button on a supplier's order currently shows nothing to choose. Since
                production only begins after payment, every order is stuck. Add at least one method
                below.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Card payments via Stripe Connect */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" /> Card payments (Stripe)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {stripe?.connected && stripe.chargesEnabled ? (
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              Connected and able to accept card payments.
            </div>
          ) : stripe?.connected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                Onboarding started but not finished — cards are not chargeable yet.
              </div>
              <Button size="sm" variant="outline" onClick={connectStripe}>
                Finish Stripe setup <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground">
                Let suppliers pay by card. Funds go to your own Stripe account.
              </p>
              <Button size="sm" onClick={connectStripe}>
                Connect Stripe <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual / offline methods */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Banknote className="h-4 w-4 text-primary" /> Bank transfer &amp; offline methods
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Suppliers see these details, pay you directly, and upload a receipt. You confirm it with
            <span className="font-medium"> Mark paid</span> on the order, which starts the 7-day clock.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">Method</Label>
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
            <div>
              <Label className="text-xs">Label shown to suppliers</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={MANUAL_PROVIDERS[provider].label}
              />
            </div>
            {MANUAL_PROVIDERS[provider].fields.map((f) => (
              <div key={f.key} className="md:col-span-2">
                <Label className="text-xs">{f.label}</Label>
                <Input
                  value={config[f.key] ?? ""}
                  onChange={(e) => setConfig((p) => ({ ...p, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <Button size="sm" onClick={add} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Add method
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active methods</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !methods.length ? (
            <p className="text-sm text-muted-foreground">Nothing configured yet.</p>
          ) : (
            <div className="space-y-2">
              {methods.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-3 rounded border p-3 text-sm">
                  <div className="flex-1 min-w-[14rem]">
                    <div className="font-medium flex items-center gap-2">
                      {m.label || m.provider}
                      {m.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                      {m.provider === "STRIPE_CONNECT" && m.status !== "CONNECTED" ? (
                        <Badge className="bg-amber-100 text-amber-800">{m.status}</Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Object.entries(m.maskedConfig || {})
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ") || m.provider}
                    </div>
                  </div>
                  <Switch
                    checked={m.isActive}
                    onCheckedChange={async (v) => {
                      try {
                        await updatePaymentMethod(m.id, { isActive: v });
                        load();
                      } catch (e: any) {
                        toast.error(e.message || "Update failed");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={async () => {
                      try {
                        await deletePaymentMethod(m.id);
                        toast.success("Removed");
                        load();
                      } catch (e: any) {
                        toast.error(e.message || "Could not remove");
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </EupLayout>
  );
}
