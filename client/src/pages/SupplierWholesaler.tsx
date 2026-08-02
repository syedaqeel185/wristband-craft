import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import jsPDF from "jspdf";
import {
  ArrowLeft,
  Package,
  Truck,
  Download,
  Clock,
  Tag,
  Store,
  Factory,
  ShoppingCart,
  Loader2,
  CreditCard,
  Banknote,
  Upload,
  FileCheck2,
  ExternalLink,
  Copy,
  CheckCircle2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getMyWholesaler,
  getWholesaleCatalog,
  getWholesaleQuote,
  placeWholesaleOrder,
  getMyWholesaleOrders,
  setMyProduction,
  updateWholesaleOrderStatus,
  getWholesalePaymentOptions,
  wholesalePayStripe,
  wholesaleSubmitReceipt,
  confirmWholesaleStripe,
  getMeSupplier,
  uploadImage,
  type WholesalePaymentOptions,
  type CheckoutMethod,
  type MyWholesaler,
  type WholesaleCatalog,
  type WholesaleCatalogProduct,
  type WholesaleOrder,
  type WholesaleQuote,
  type FulfilmentMode,
  type SelectedOption,
  type Currency,
} from "@/lib/api";
import {
  PAY_COLORS,
  PAY_LABEL,
  STATUS_COLORS,
  money,
  money2,
  shortDate,
  slaState,
} from "@/lib/wholesale-format";

export default function SupplierWholesaler() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sourceOrderId = params.get("sourceOrderId") || undefined;

  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState<MyWholesaler | null>(null);
  const [catalog, setCatalog] = useState<WholesaleCatalog | null>(null);
  const [myOrders, setMyOrders] = useState<WholesaleOrder[]>([]);

  const load = async () => {
    try {
      const [c, cat, orders] = await Promise.all([
        getMyWholesaler(),
        getWholesaleCatalog().catch(() => null),
        getMyWholesaleOrders().catch(() => []),
      ]);
      setCtx(c);
      setCatalog(cat);
      setMyOrders(orders);
    } catch (e: any) {
      toast.error(e.message || "Failed to load wholesaler");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returning from Stripe checkout (?wsession=<sessionId>): confirm the payment.
  useEffect(() => {
    const sess = params.get("wsession");
    if (!sess) return;
    confirmWholesaleStripe(sess)
      .then((r) => {
        if (r.paid) toast.success("Payment received — your wholesaler can start production.");
        else toast.message("Payment not completed yet.");
        load();
      })
      .catch((e: any) => toast.error(e.message || "Could not confirm payment"))
      .finally(() => {
        const p = new URLSearchParams(params);
        p.delete("wsession");
        setParams(p, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleProduction = async (has: boolean) => {
    try {
      await setMyProduction(has);
      setCtx((p) => (p ? { ...p, hasOwnProduction: has, mustUseWholesaler: !has } : p));
      toast.success(has ? "Marked as having your own production" : "You'll order stock from your wholesaler");
    } catch (e: any) {
      toast.error(e.message || "Update failed");
    }
  };

  /** Your buying price from EUP, as a PDF you can file or share internally. */
  const downloadPriceList = () => {
    const priced = catalog?.products?.filter((p) => p.orderable) ?? [];
    if (!priced.length) return;
    const doc = new jsPDF();
    const w = catalog?.wholesaler?.companyName || "EUP";
    let y = 16;
    doc.setFontSize(16);
    doc.text(`${w} — Your buying prices`, 14, y);
    y += 7;
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text("Price per 1000 pcs (EUR). Freight charged separately. VAT not included.", 14, y);
    doc.setTextColor(0);
    y += 8;
    for (const p of priced) {
      if (y > 265) {
        doc.addPage();
        y = 16;
      }
      doc.setFontSize(12);
      doc.text(p.name, 14, y);
      y += 6;
      doc.setFontSize(9);
      doc.text(`${(p.pricePer1000Eur ?? 0).toFixed(2)} per 1000 pcs  (MOQ ${p.minOrderQuantity})`, 16, y);
      y += 5;
      const opts = p.options.filter((o) => o.isActive && (o.priceEur ?? o.priceUsd) > 0);
      if (opts.length) {
        doc.setTextColor(90);
        doc.text(
          "Add-ons: " +
            opts
              .map(
                (o) =>
                  `${o.label} +${(o.priceEur ?? o.priceUsd).toFixed(2)}${o.pricingMode === "one_time" ? " (once)" : "/unit"}`,
              )
              .join(", "),
          16,
          y,
          { maxWidth: 180 },
        );
        doc.setTextColor(0);
        y += 8;
      }
      y += 3;
    }
    doc.save(`${w.replace(/\s+/g, "-").toLowerCase()}-buying-prices.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasPricedProducts = catalog?.products?.some((p) => p.orderable);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate("/supplier")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-xl font-bold flex-1 flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            Buy from {ctx?.wholesaler?.companyName || "EUP"}
          </h1>
          {hasPricedProducts ? (
            <Button variant="outline" size="sm" onClick={downloadPriceList}>
              <Download className="h-4 w-4 mr-2" />
              Download price list
            </Button>
          ) : null}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <BuyPanel
          ctx={ctx}
          catalog={catalog}
          myOrders={myOrders}
          sourceOrderId={sourceOrderId}
          onProduction={toggleProduction}
          onChanged={load}
        />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BUY panel — a supplier ordering stock from its wholesaler
// ---------------------------------------------------------------------------

function BuyPanel({
  ctx,
  catalog,
  myOrders,
  sourceOrderId,
  onProduction,
  onChanged,
}: {
  ctx: MyWholesaler | null;
  catalog: WholesaleCatalog | null;
  myOrders: WholesaleOrder[];
  sourceOrderId?: string;
  onProduction: (has: boolean) => void;
  onChanged: () => void;
}) {
  const [orderProduct, setOrderProduct] = useState<WholesaleCatalogProduct | null>(null);
  const [payOrder, setPayOrder] = useState<WholesaleOrder | null>(null);

  if (!ctx?.wholesaler) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-2">
          <Store className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">No EUP assigned yet</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            You don't have an EUP assigned and no EU house EUP is available. To order stock, contact
            the platform administrator to be assigned one.
          </p>
        </CardContent>
      </Card>
    );
  }

  const w = ctx.wholesaler;

  return (
    <div className="space-y-6">
      {sourceOrderId ? (
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
          You're ordering stock to fulfil customer order{" "}
          <span className="font-mono font-medium">#{sourceOrderId.slice(0, 8)}</span>. Choose a product
          and select <b>Drop-ship to customer</b> to have {w.companyName} deliver straight to them.
        </div>
      ) : null}

      {/* Who you buy from + how the terms work */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              {w.companyName}
              {w.isHouseWholesaler ? <Badge variant="secondary">EU house</Badge> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            {w.description ? <p>{w.description}</p> : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
              {w.contactEmail ? (
                <a className="hover:text-primary" href={`mailto:${w.contactEmail}`}>
                  {w.contactEmail}
                </a>
              ) : null}
              {w.contactPhone ? (
                <a className="hover:text-primary" href={`tel:${w.contactPhone}`}>
                  {w.contactPhone}
                </a>
              ) : null}
              {w.country ? <span>{w.country}</span> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Your terms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <div className="font-medium">
                Delivery within {ctx.productionSlaDays} days of payment
              </div>
              <div className="text-xs text-muted-foreground">
                Production starts once {w.companyName} receives your payment.
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm">
                <div className="font-medium flex items-center gap-1">
                  <Factory className="h-3.5 w-3.5" /> Own production
                </div>
                <div className="text-xs text-muted-foreground">
                  {ctx.hasOwnProduction ? "You produce in-house" : `You order stock from ${w.companyName}`}
                </div>
              </div>
              <Switch checked={ctx.hasOwnProduction} onCheckedChange={onProduction} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Announcements from EUP. Deliberately no "% off" badge: your price is
          the fixed rate in the catalogue below, and a banner never changes it. */}
      {ctx.offers.length ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {ctx.offers.map((o) => (
            <div
              key={o.id}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm"
            >
              <div className="flex items-center gap-2 font-semibold text-amber-900">
                <Tag className="h-4 w-4" /> {o.title}
              </div>
              {o.description ? <p className="text-amber-800 mt-1">{o.description}</p> : null}
              <div className="text-xs text-amber-700 mt-1 flex flex-wrap gap-2">
                {o.code ? <span>Code: {o.code}</span> : null}
                {o.minQuantity ? <span>Min qty {o.minQuantity}</span> : null}
                {o.validUntil ? <span>Until {new Date(o.validUntil).toLocaleDateString()}</span> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Catalogue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" /> Catalogue
            <span className="text-xs font-normal text-muted-foreground">
              (your price per 1000 pcs — freight added at checkout)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!catalog?.products?.length ? (
            <p className="text-sm text-muted-foreground">
              {w.companyName} hasn't published a catalogue yet.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {catalog.products.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-lg border p-4 space-y-3 ${p.orderable ? "" : "opacity-60"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {p.wristbandType}
                        {p.availableSizes?.length ? ` • ${p.availableSizes.join(", ")}` : ""}
                      </div>
                    </div>
                    <Button size="sm" disabled={!p.orderable} onClick={() => setOrderProduct(p)}>
                      <ShoppingCart className="h-4 w-4 mr-1" /> Order
                    </Button>
                  </div>

                  {p.orderable ? (
                    <div className="rounded bg-muted/40 px-3 py-2">
                      <div className="text-lg font-bold">
                        {money2(p.pricePer1000Eur)}{" "}
                        <span className="text-sm font-normal text-muted-foreground">/ 1000 pcs</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {money(((p.pricePer1000Eur ?? 0) / 1000))} per unit · min order{" "}
                        {p.minOrderQuantity}
                        {p.priceSource === "supplier" ? " · your agreed rate" : ""}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded border border-dashed px-3 py-2 text-xs text-muted-foreground">
                      {w.companyName} hasn't set your price for this product yet. Contact them to have it
                      priced for your account.
                    </div>
                  )}

                  {p.options.filter((o) => o.isActive).length ? (
                    <div className="flex flex-wrap gap-1">
                      {p.options
                        .filter((o) => o.isActive)
                        .map((o) => (
                          <Badge key={o.key} variant="outline" className="text-xs">
                            {o.label} +{money2(o.priceEur ?? o.priceUsd)}
                            {o.pricingMode === "one_time" ? "" : "/u"}
                          </Badge>
                        ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* My wholesale orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" /> My wholesale orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!myOrders.length ? (
            <p className="text-sm text-muted-foreground">No wholesale orders yet.</p>
          ) : (
            <div className="space-y-2">
              {myOrders.map((o) => {
                const sla = slaState(o);
                // What you make on this order: what the customer paid you, less
                // what you paid EUP. Only shown when the order is linked to a
                // customer order, otherwise there is no sale to compare against.
                const margin =
                  o.customerPaid != null ? o.customerPaid - (o.totalPrice || 0) : null;
                const marginPer1000 =
                  margin != null && o.quantity > 0 ? (margin / o.quantity) * 1000 : null;

                return (
                  <div key={o.id} className="rounded-lg border p-3 text-sm space-y-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <Badge className={STATUS_COLORS[o.status] || ""}>
                        {o.status.replace(/_/g, " ")}
                      </Badge>
                      <Badge className={PAY_COLORS[o.paymentStatus || "unpaid"] || ""}>
                        {PAY_LABEL[o.paymentStatus || "unpaid"] || "Unpaid"}
                      </Badge>
                      {sla ? <Badge className={sla.className}>{sla.label}</Badge> : null}
                      <span className="font-medium">{o.product?.name || "Product"}</span>
                      <span className="text-muted-foreground">×{o.quantity}</span>
                      <Badge variant="outline">
                        {o.fulfilmentMode === "DROP_SHIP" ? "Drop-ship to customer" : "Ship to me"}
                      </Badge>
                      {o.trackingNumber ? (
                        <span className="text-xs text-muted-foreground">
                          {o.courier || "Tracking"}: {o.trackingNumber}
                        </span>
                      ) : null}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {shortDate(o.createdAt)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Goods {money2(o.goodsTotal ?? o.totalPrice, o.currency)}
                        {o.freightTotal ? ` + freight ${money2(o.freightTotal, o.currency)}` : ""} ={" "}
                        <span className="font-medium text-foreground">
                          {money2(o.totalPrice, o.currency)}
                        </span>
                      </span>
                      {o.paymentStatus === "paid" ? (
                        <span>
                          Paid {shortDate(o.paidAt)} · arrives by{" "}
                          <span className="font-medium text-foreground">
                            {shortDate(o.promisedDeliveryAt)}
                          </span>
                        </span>
                      ) : null}
                    </div>

                    {margin != null ? (
                      <div className="rounded bg-green-50 border border-green-200 px-3 py-1.5 text-xs">
                        Customer paid{" "}
                        <span className="font-medium">
                          {money2(o.customerPaid, o.customerCurrency || o.currency)}
                        </span>{" "}
                        − you paid{" "}
                        <span className="font-medium">{money2(o.totalPrice, o.currency)}</span> ={" "}
                        <span className="font-bold text-green-800">
                          {money2(margin, o.currency)} margin
                        </span>
                        {marginPer1000 != null ? (
                          <span className="text-green-700">
                            {" "}
                            ({money2(marginPer1000, o.currency)} per 1000 pcs)
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      {o.paymentStatus !== "paid" && o.status !== "CANCELLED" ? (
                        <Button size="sm" onClick={() => setPayOrder(o)}>
                          <Wallet className="h-4 w-4 mr-1" />
                          {o.paymentStatus === "awaiting_payment" ? "Payment sent" : "Pay"}
                        </Button>
                      ) : null}
                      {o.status === "PLACED" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          onClick={async () => {
                            try {
                              await updateWholesaleOrderStatus(o.id, { status: "CANCELLED" });
                              toast.success("Order cancelled");
                              onChanged();
                            } catch (e: any) {
                              toast.error(e.message || "Cancel failed");
                            }
                          }}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {orderProduct ? (
        <OrderDialog
          product={orderProduct}
          sourceOrderId={sourceOrderId}
          onClose={() => setOrderProduct(null)}
          onPlaced={(created) => {
            setOrderProduct(null);
            onChanged();
            // Go straight to payment — the wholesaler produces once paid.
            if (created) setPayOrder(created);
          }}
        />
      ) : null}

      {payOrder ? (
        <PayDialog
          order={payOrder}
          onClose={() => setPayOrder(null)}
          onDone={() => {
            setPayOrder(null);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order dialog — quantity, options, fulfilment mode, drop-ship customer info
// ---------------------------------------------------------------------------

function OrderDialog({
  product,
  sourceOrderId,
  onClose,
  onPlaced,
}: {
  product: WholesaleCatalogProduct;
  sourceOrderId?: string;
  onClose: () => void;
  onPlaced: (order: WholesaleOrder | null) => void;
}) {
  const [quantity, setQuantity] = useState(product.minOrderQuantity || 500);
  const [currency] = useState<Currency>("EUR");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [fulfilment, setFulfilment] = useState<FulfilmentMode>(
    sourceOrderId ? "DROP_SHIP" : "SHIP_TO_SUPPLIER",
  );
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "", city: "", country: "" });
  // The buyer's own delivery address (ship-to-supplier), prefilled from their profile.
  const [myAddress, setMyAddress] = useState({ name: "", phone: "", address: "", city: "", country: "" });
  const [quote, setQuote] = useState<WholesaleQuote | null>(null);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    getMeSupplier()
      .then((s) =>
        setMyAddress({
          name: s.companyName || "",
          phone: (s as any).contactPhone || "",
          address: (s as any).address || "",
          city: (s as any).city || "",
          country: (s as any).country || "",
        }),
      )
      .catch(() => undefined);
  }, []);

  const selectedOptions: SelectedOption[] = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, v]) => v)
        .map(([key]) => ({ key })),
    [selected],
  );

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      if (!quantity || quantity < 1) return;
      try {
        // Fulfilment mode and destination matter: freight is resolved per
        // supplier + destination country + mode, so the preview must send them.
        const q = await getWholesaleQuote({
          productId: product.id,
          quantity,
          currency,
          selectedOptions,
          fulfilmentMode: fulfilment,
          customerInfo: fulfilment === "DROP_SHIP" && !sourceOrderId ? customer : undefined,
        });
        if (alive) setQuote(q);
      } catch {
        /* keep last quote */
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [product.id, quantity, currency, selectedOptions, fulfilment, sourceOrderId, customer.country]);

  const place = async () => {
    if (fulfilment === "DROP_SHIP" && !sourceOrderId) {
      if (!customer.name || !customer.address) {
        toast.error("Enter the customer's name and delivery address for drop-ship");
        return;
      }
    }
    if (fulfilment === "SHIP_TO_SUPPLIER" && !myAddress.address) {
      toast.error("Enter your delivery address");
      return;
    }
    setPlacing(true);
    try {
      const created = await placeWholesaleOrder({
        productId: product.id,
        quantity,
        currency,
        selectedOptions,
        fulfilmentMode: fulfilment,
        sourceOrderId,
        customerInfo:
          fulfilment === "DROP_SHIP" && !sourceOrderId ? customer : undefined,
        shippingAddress: fulfilment === "SHIP_TO_SUPPLIER" ? myAddress : undefined,
      });
      toast.success("Wholesale order placed — pay to start production");
      onPlaced(created);
    } catch (e: any) {
      toast.error(e.message || "Could not place order");
      onPlaced(null);
    } finally {
      setPlacing(false);
    }
  };

  const activeOptions = product.options.filter((o) => o.isActive);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Order — {product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Quantity (min {product.minOrderQuantity})</Label>
            <Input
              type="number"
              min={product.minOrderQuantity}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          {activeOptions.length ? (
            <div className="space-y-2">
              <Label>Add-ons</Label>
              {activeOptions.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={!!selected[o.key]}
                    onChange={(e) => setSelected((p) => ({ ...p, [o.key]: e.target.checked }))}
                  />
                  <span className="flex-1">{o.label}</span>
                  <span className="text-muted-foreground">
                    +{money2(o.priceEur ?? o.priceUsd)}
                    {o.pricingMode === "one_time" ? " once" : "/unit"}
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Delivery</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFulfilment("SHIP_TO_SUPPLIER")}
                className={`rounded-lg border p-2 text-sm text-left ${
                  fulfilment === "SHIP_TO_SUPPLIER" ? "border-primary bg-primary/5" : ""
                }`}
              >
                <div className="font-medium">Ship to me</div>
                <div className="text-xs text-muted-foreground">You handle the last mile</div>
              </button>
              <button
                type="button"
                onClick={() => setFulfilment("DROP_SHIP")}
                className={`rounded-lg border p-2 text-sm text-left ${
                  fulfilment === "DROP_SHIP" ? "border-primary bg-primary/5" : ""
                }`}
              >
                <div className="font-medium">Drop-ship to customer</div>
                <div className="text-xs text-muted-foreground">Wholesaler delivers directly</div>
              </button>
            </div>
          </div>

          {fulfilment === "DROP_SHIP" ? (
            sourceOrderId ? (
              <p className="text-xs text-muted-foreground">
                The customer's delivery details from order #{sourceOrderId.slice(0, 8)} will be shared with
                the wholesaler.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs">Customer name</Label>
                  <Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Address</Label>
                  <Textarea
                    rows={2}
                    value={customer.address}
                    onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">City</Label>
                  <Input value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Country</Label>
                  <Input value={customer.country} onChange={(e) => setCustomer({ ...customer, country: e.target.value })} />
                </div>
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 text-xs text-muted-foreground">Your delivery address</div>
              <div>
                <Label className="text-xs">Contact name</Label>
                <Input value={myAddress.name} onChange={(e) => setMyAddress({ ...myAddress, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={myAddress.phone} onChange={(e) => setMyAddress({ ...myAddress, phone: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Address</Label>
                <Textarea
                  rows={2}
                  value={myAddress.address}
                  onChange={(e) => setMyAddress({ ...myAddress, address: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">City</Label>
                <Input value={myAddress.city} onChange={(e) => setMyAddress({ ...myAddress, city: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Country</Label>
                <Input value={myAddress.country} onChange={(e) => setMyAddress({ ...myAddress, country: e.target.value })} />
              </div>
            </div>
          )}

          {quote ? (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
              {quote.lines.map((l) => (
                <div key={l.code} className="flex justify-between text-muted-foreground">
                  <span>
                    {l.label}
                    {l.kind === "per_1000" ? ` · ${money2(l.rate, currency)}/1000` : null}
                    {l.kind === "per_unit" ? ` · ${money2(l.rate, currency)}/unit` : null}
                  </span>
                  <span>{money2(l.amount, currency)}</span>
                </div>
              ))}
              <Separator className="my-1" />
              <div className="flex justify-between items-center">
                <span>
                  Total
                  {quote.freightTotal > 0 ? (
                    <span className="text-xs text-muted-foreground"> (incl. freight)</span>
                  ) : null}
                </span>
                <span className="font-bold text-lg">{money2(quote.total, currency)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {money2(quote.effectivePer1000, currency)} per 1000 pcs all-in ·{" "}
                {money(quote.total / quote.quantity, currency)}/unit
                {quote.estMinDays != null || quote.estMaxDays != null
                  ? ` · freight ${quote.estMinDays ?? "?"}–${quote.estMaxDays ?? "?"} days`
                  : ""}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={place} disabled={placing}>
            {placing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Place order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Pay dialog — the buyer pays the wholesaler (mirrors the customer payment page)
// ---------------------------------------------------------------------------

const PROVIDER_LABEL: Record<string, string> = {
  STRIPE_CONNECT: "Card (Stripe)",
  PAYPAL: "PayPal",
  PAYONEER: "Payoneer",
  BANK_TRANSFER: "Bank transfer",
  JAZZCASH: "JazzCash",
  EASYPAISA: "EasyPaisa",
  MANUAL: "Other",
};
const humanize = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
const isHttpUrl = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v.trim());

function PayDialog({
  order,
  onClose,
  onDone,
}: {
  order: WholesaleOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const [opts, setOpts] = useState<WholesalePaymentOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getWholesalePaymentOptions(order.id)
      .then((o) => {
        setOpts(o);
        setSelectedId(o.methods.find((m) => m.available)?.id || "");
      })
      .catch((e: any) => toast.error(e.message || "Failed to load payment options"))
      .finally(() => setLoading(false));
  }, [order.id]);

  const selected: CheckoutMethod | undefined = opts?.methods.find((m) => m.id === selectedId);
  const available = opts?.methods.filter((m) => m.available) ?? [];
  const label = selected ? selected.label || PROVIDER_LABEL[selected.provider] || selected.provider : "";
  const details = selected && selected.kind === "manual"
    ? Object.entries(selected.instructions || {}).filter(([, v]) => String(v ?? "").trim() !== "")
    : [];

  const payStripe = async () => {
    setBusy(true);
    try {
      const { url } = await wholesalePayStripe(order.id);
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
      if (receiptFile) receiptUrl = (await uploadImage(receiptFile)).url;
      await wholesaleSubmitReceipt(order.id, selected.provider, receiptUrl);
      toast.success("Payment submitted — the wholesaler will confirm it.");
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Failed to submit payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Pay {opts ? money2(opts.amount, opts.currency) : ""}
            {opts ? ` to ${opts.wholesalerName}` : ""}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : opts?.alreadyPaid ? (
          <div className="py-6 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto" />
            <p className="font-medium">This order is already paid.</p>
          </div>
        ) : available.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            This wholesaler hasn't set up a payment method yet. Please contact them.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {available.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-sm text-left ${
                    m.id === selectedId ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"
                  }`}
                >
                  {m.kind === "stripe" ? <CreditCard className="h-4 w-4 shrink-0" /> : <Banknote className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{m.label || PROVIDER_LABEL[m.provider] || m.provider}</span>
                </button>
              ))}
            </div>

            {selected?.kind === "stripe" ? (
              <Button className="w-full" onClick={payStripe} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
                Pay by card
              </Button>
            ) : selected ? (
              <div className="space-y-3">
                <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Pay directly via {label}</p>
                  {details.length ? (
                    <dl className="space-y-1.5 text-sm">
                      {details.map(([k, v]) => (
                        <div key={k} className="flex justify-between items-center gap-3">
                          <dt className="text-muted-foreground">{humanize(k)}</dt>
                          <dd className="font-medium text-right break-all flex items-center gap-1.5">
                            {isHttpUrl(v) ? (
                              <a href={String(v)} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1">
                                Open <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : (
                              <>
                                <span>{String(v)}</span>
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-primary"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(String(v));
                                      toast.success("Copied");
                                    } catch {
                                      toast.message(String(v));
                                    }
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-sm text-muted-foreground">Contact the wholesaler for payment details.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Upload payment receipt (recommended)</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`wreceipt-${order.id}`}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById(`wreceipt-${order.id}`)?.click()}>
                      <Upload className="h-4 w-4 mr-2" /> Choose file
                    </Button>
                    {receiptFile ? (
                      <span className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                        <FileCheck2 className="h-4 w-4 text-primary shrink-0" />
                        <span className="truncate">{receiptFile.name}</span>
                      </span>
                    ) : null}
                  </div>
                </div>

                <Button className="w-full" onClick={submitManual} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCheck2 className="h-4 w-4 mr-2" />}
                  I've paid — submit for confirmation
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
