import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getCheckoutOptions,
  createStripeSessionForGroup,
  submitPaymentReceipt,
  uploadImage,
  type CheckoutGroup,
  type CheckoutMethod,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, CreditCard, Banknote, CheckCircle2, Loader2, Upload, FileCheck2 } from "lucide-react";

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "EUR" }).format(amount);

const humanize = (k: string) =>
  k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();

const PROVIDER_LABEL: Record<string, string> = {
  STRIPE_CONNECT: "Card (Stripe)",
  PAYPAL: "PayPal",
  PAYONEER: "Payoneer",
  BANK_TRANSFER: "Bank transfer",
  JAZZCASH: "JazzCash",
  EASYPAISA: "EasyPaisa",
  MANUAL: "Other",
};

const Payment = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const orderIds = ((location.state as { orderIds?: string[] } | null)?.orderIds || []).filter(Boolean);

  const [groups, setGroups] = useState<CheckoutGroup[]>([]);
  const [loading, setLoading] = useState(true);
  // Supplier groups the customer has completed this session (paid or submitted).
  const [done, setDone] = useState<Record<string, "submitted" | "paid">>({});

  useEffect(() => {
    if (orderIds.length === 0) {
      toast.error("No orders to pay for");
      navigate("/order-summary");
      return;
    }
    getCheckoutOptions(orderIds)
      .then((res) => setGroups(res.groups))
      .catch((e) => {
        toast.error(e.message || "Failed to load payment options");
        navigate("/order-summary");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allSettled =
    groups.length > 0 &&
    groups.every((g) => g.alreadyPaid || done[g.supplierId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/order-summary")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">Payment</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl space-y-5">
        <p className="text-sm text-muted-foreground">
          Choose how you'd like to pay each supplier. Card payments are processed instantly; for other methods you
          pay the supplier directly and upload your receipt so they can confirm and start production.
        </p>

        {groups.map((group) => (
          <SupplierPayCard
            key={group.supplierId}
            group={group}
            state={group.alreadyPaid ? "paid" : done[group.supplierId]}
            onSubmitted={() => setDone((d) => ({ ...d, [group.supplierId]: "submitted" }))}
          />
        ))}

        {allSettled && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 text-center space-y-3">
              <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
              <p className="font-medium">All payments handled. Your orders are on their way!</p>
            </CardContent>
          </Card>
        )}

        <Button className="w-full" variant={allSettled ? "hero" : "outline"} onClick={() => navigate("/my-orders")}>
          View My Orders
        </Button>
      </main>
    </div>
  );
};

const SupplierPayCard = ({
  group,
  state,
  onSubmitted,
}: {
  group: CheckoutGroup;
  state?: "submitted" | "paid";
  onSubmitted: () => void;
}) => {
  const available = group.methods.filter((m) => m.available);
  const [selectedId, setSelectedId] = useState<string>(available[0]?.id || "");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const selected: CheckoutMethod | undefined = group.methods.find((m) => m.id === selectedId);

  const payWithStripe = async () => {
    setBusy(true);
    try {
      const { url } = await createStripeSessionForGroup(group.supplierId, group.orderIds);
      if (!url) throw new Error("Could not start card payment");
      window.location.href = url;
    } catch (e: any) {
      toast.error(e.message || "Could not start card payment");
      setBusy(false);
    }
  };

  const submitManual = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      let receiptUrl: string | undefined;
      if (receiptFile) {
        const up = await uploadImage(receiptFile);
        receiptUrl = up.url;
      }
      await submitPaymentReceipt(group.orderIds, selected.provider, receiptUrl);
      toast.success("Payment submitted — the supplier will confirm shortly.");
      onSubmitted();
    } catch (e: any) {
      toast.error(e.message || "Failed to submit payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{group.supplierName}</CardTitle>
          <span className="text-lg font-bold">{money(group.amount, group.currency)}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {state ? (
          <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">
                {state === "paid" ? "Payment complete" : "Payment submitted — awaiting confirmation"}
              </p>
              <p className="text-muted-foreground">
                {state === "paid"
                  ? "This supplier's payment is confirmed."
                  : "The supplier will verify your payment and start production."}
              </p>
            </div>
          </div>
        ) : available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This supplier hasn't set up a payment method yet. Please contact them or try again later.
          </p>
        ) : (
          <>
            {/* Method selector */}
            <div>
              <Label className="text-xs text-muted-foreground">Choose a payment method</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {available.map((m) => {
                  const activeSel = m.id === selectedId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-sm text-left transition-colors ${
                        activeSel ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"
                      }`}
                    >
                      {m.kind === "stripe" ? (
                        <CreditCard className="h-4 w-4 shrink-0" />
                      ) : (
                        <Banknote className="h-4 w-4 shrink-0" />
                      )}
                      <span className="truncate">{m.label || PROVIDER_LABEL[m.provider] || m.provider}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected method detail */}
            {selected?.kind === "stripe" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  You'll be redirected to Stripe's secure checkout to pay by card.
                </p>
                <Button className="w-full" variant="hero" disabled={busy} onClick={payWithStripe}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
                  Pay {money(group.amount, group.currency)} by card
                </Button>
              </div>
            ) : selected ? (
              <div className="space-y-3">
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Pay {money(group.amount, group.currency)} directly via {selected.label || PROVIDER_LABEL[selected.provider] || selected.provider}
                  </p>
                  {Object.keys(selected.instructions || {}).length > 0 ? (
                    <dl className="space-y-1 text-sm">
                      {Object.entries(selected.instructions).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">{humanize(k)}</dt>
                          <dd className="font-medium text-right break-all">{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Contact the supplier for payment details.
                    </p>
                  )}
                </div>

                {/* Receipt upload */}
                <div className="space-y-2">
                  <Label htmlFor={`receipt-${group.supplierId}`} className="text-sm">
                    Upload payment receipt <span className="text-muted-foreground">(recommended)</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`receipt-${group.supplierId}`}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById(`receipt-${group.supplierId}`)?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" /> Choose file
                    </Button>
                    {receiptFile && (
                      <span className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                        <FileCheck2 className="h-4 w-4 text-primary shrink-0" />
                        <span className="truncate">{receiptFile.name}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    After paying, upload a screenshot or PDF of the transfer so the supplier can verify it.
                  </p>
                </div>

                <Button className="w-full" variant="hero" disabled={busy} onClick={submitManual}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCheck2 className="h-4 w-4 mr-2" />}
                  I've paid — submit for confirmation
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default Payment;
