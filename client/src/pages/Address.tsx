import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch, createCheckout, getCart, checkoutCart } from "@/lib/api";
import { dhlShipping, dhlTierLabel } from "@/lib/shipping";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShoppingCart } from "lucide-react";

interface LocationState {
  orderIds?: string[];
  fromCart?: boolean;
  expressDelivery?: boolean;
  selectedSupplierId?: string;
}

const Address = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;

  const [draftOrders, setDraftOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [shippingAddress, setShippingAddress] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
    phone: "",
  });
  const [customizationNotes, setCustomizationNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadFromCart = async () => {
      try {
        const cart = await getCart();
        if (!cart.items.length) {
          toast.error("Your cart is empty");
          navigate("/order-summary");
          return;
        }
        // Normalise cart items into the display shape used below.
        setDraftOrders(
          cart.items.map((i) => ({
            id: i.id,
            design: { designUrl: i.design?.designUrl },
            quantity: i.quantity,
            wristbandType: i.design?.wristbandType,
            totalPrice: i.lineTotal,
            currency: i.currency,
          })),
        );
      } catch {
        toast.error("Failed to load cart");
        navigate("/order-summary");
      } finally {
        setLoadingOrders(false);
      }
    };

    const loadLegacyOrders = async () => {
      try {
        const all: any[] = await apiFetch("/orders/mine");
        const relevant = (all || []).filter((o) => state.orderIds!.includes(o.id));
        setDraftOrders(relevant);
      } catch {
        toast.error("Failed to load orders");
        navigate("/order-summary");
      } finally {
        setLoadingOrders(false);
      }
    };

    if (state.fromCart) {
      loadFromCart();
    } else if (state.orderIds && state.orderIds.length > 0) {
      loadLegacyOrders();
    } else {
      // Default to the cart.
      loadFromCart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShippingAddress({ ...shippingAddress, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    if (!shippingAddress.name || !shippingAddress.address || !shippingAddress.city || !shippingAddress.zipCode || !shippingAddress.country) {
      toast.error("Please fill all required address fields");
      return;
    }

    setLoading(true);
    try {
      const expressValue = state.expressDelivery ? 19 : 0;
      const totalQty = draftOrders.reduce((n, o) => n + (o.quantity || 0), 0);
      const shippingValue = dhlShipping(totalQty);
      const extraCharges: Record<string, number> = {};
      if (shippingValue) extraCharges.shipping = shippingValue;
      if (expressValue) extraCharges.express = expressValue;
      const addr = { ...shippingAddress, notes: customizationNotes || undefined };

      let orderIds: string[];
      if (state.orderIds && state.orderIds.length > 0 && !state.fromCart) {
        // Legacy path: existing DRAFT orders.
        for (const order of draftOrders) {
          await apiFetch(`/orders/${order.id}/status`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "PLACED",
              paymentStatus: "pending",
              shippingAddress: addr,
              extraCharges,
              note: customizationNotes || undefined,
            }),
          });
        }
        orderIds = state.orderIds;
      } else {
        // Cart path: server creates PLACED, server-priced orders and empties the cart.
        const res = await checkoutCart(addr, extraCharges);
        orderIds = res.orderIds;
      }

      if (!orderIds.length) throw new Error("No orders to pay for");
      const { routes, url } = await createCheckout(orderIds);

      // Card payment (Stripe Connect) → hand off to the hosted checkout.
      if (url) {
        toast.success("Address saved. Redirecting to secure payment…");
        window.location.href = url;
        return;
      }

      // Otherwise every supplier is on a manual/offline method (or hasn't set
      // one up). Show the payment instructions on the success page.
      const unavailable = (routes || []).filter((r) => r.type === "unavailable");
      if (unavailable.length && unavailable.length === (routes || []).length) {
        throw new Error(unavailable[0].message || "This supplier hasn't set up payments yet.");
      }
      navigate("/payment-success", { state: { manualRoutes: routes } });
    } catch (error: any) {
      toast.error(error.message || "An error occurred while processing your order");
      setLoading(false);
    }
  };

  if (loadingOrders) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const currency = draftOrders[0]?.currency || "EUR";
  const currencySymbol = currency === "USD" ? "$" : currency === "GBP" ? "£" : "€";
  const subtotal = draftOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
  const totalQty = draftOrders.reduce((n, o) => n + (o.quantity || 0), 0);
  const shippingFee = dhlShipping(totalQty);
  const expressDeliveryFee = state.expressDelivery ? 19 : 0;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Shipping Details
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Order Summary</h2>
            <div className="space-y-4">
              {draftOrders.map((order, idx) => (
                <div key={order.id} className="bg-muted rounded-lg p-4">
                  <h3 className="text-sm font-medium mb-2">Design {idx + 1}</h3>
                  {order.design?.designUrl && (
                    <img src={order.design.designUrl} alt={`Design ${idx + 1}`} className="w-full h-auto rounded-lg shadow-lg mb-3" />
                  )}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Quantity:</span>
                      <span className="font-medium">{order.quantity} pcs</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Type:</span>
                      <span className="font-medium capitalize">{order.wristbandType || "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t">
                      <span>Subtotal:</span>
                      <span className="font-medium">{currencySymbol}{(order.totalPrice || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-3 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span className="font-medium">{currencySymbol}{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>DHL shipping <span className="text-muted-foreground">({dhlTierLabel(totalQty)})</span></span>
                <span className="font-medium">{currencySymbol}{shippingFee.toFixed(2)}</span>
              </div>
              {state.expressDelivery && (
                <div className="flex justify-between text-sm">
                  <span>Express production:</span>
                  <span className="font-medium">{currencySymbol}{expressDeliveryFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2 text-primary">
                <span>Total:</span>
                <span>{currencySymbol}{(subtotal + shippingFee + expressDeliveryFee).toFixed(2)}</span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Delivery Address</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Full Name *</Label>
                <Input id="name" name="name" value={shippingAddress.name} onChange={handleInputChange} className="mt-2" required />
              </div>
              <div>
                <Label htmlFor="address">Street Address *</Label>
                <Input id="address" name="address" value={shippingAddress.address} onChange={handleInputChange} className="mt-2" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">City *</Label>
                  <Input id="city" name="city" value={shippingAddress.city} onChange={handleInputChange} className="mt-2" required />
                </div>
                <div>
                  <Label htmlFor="state">State/Province</Label>
                  <Input id="state" name="state" value={shippingAddress.state} onChange={handleInputChange} className="mt-2" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="zipCode">Zip/Postal Code *</Label>
                  <Input id="zipCode" name="zipCode" value={shippingAddress.zipCode} onChange={handleInputChange} className="mt-2" required />
                </div>
                <div>
                  <Label htmlFor="country">Country *</Label>
                  <Input id="country" name="country" value={shippingAddress.country} onChange={handleInputChange} className="mt-2" required />
                </div>
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" name="phone" value={shippingAddress.phone} onChange={handleInputChange} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="customizationNotes">Extra notes (optional)</Label>
                <Textarea
                  id="customizationNotes"
                  value={customizationNotes}
                  onChange={(e) => setCustomizationNotes(e.target.value)}
                  className="mt-2"
                  rows={3}
                  placeholder="Any extra details for the manufacturer."
                />
              </div>

              <Button onClick={handleSubmit} className="w-full mt-4" variant="hero" disabled={loading}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                ) : (
                  <><ShoppingCart className="h-4 w-4 mr-2" /> Proceed to Payment</>
                )}
              </Button>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Address;
