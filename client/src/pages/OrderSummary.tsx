import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getCart, updateCartItem, removeCartItem, type Cart } from "@/lib/api";
import { dhlShipping, dhlTierLabel } from "@/lib/shipping";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Truck, Clock, Calendar, ShieldCheck, Download as DownloadIcon, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { ArrowLeft, ShoppingCart } from "lucide-react";

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

const OrderSummary = () => {
  const navigate = useNavigate();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [expressDelivery, setExpressDelivery] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const load = async () => {
    try {
      const c = await getCart();
      setCart(c);
    } catch {
      toast.error("Failed to load cart");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRemove = async (itemId: string) => {
    try {
      setCart(await removeCartItem(itemId));
      toast.success("Removed from cart");
    } catch {
      toast.error("Failed to remove item");
    }
  };

  const handleQty = async (itemId: string, quantity: number) => {
    if (quantity < 1) return;
    try {
      setCart(await updateCartItem(itemId, quantity));
    } catch (e: any) {
      toast.error(e.message || "Failed to update quantity");
    }
  };

  const downloadTerms = () => {
    const blob = new Blob(
      ["Terms and Conditions (placeholder).\n\nReplace with your real terms."],
      { type: "application/pdf" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "terms_and_conditions.pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  const proceed = () => {
    if (!termsAccepted) {
      toast.error("Please accept the Terms and Conditions");
      return;
    }
    if (!cart || cart.items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }
    navigate("/address", { state: { fromCart: true, expressDelivery } });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  const sym = SYMBOL[cart?.currency || "EUR"] || "€";
  const subtotal = cart?.subtotal || 0;
  const totalQty = (cart?.items || []).reduce((n, i) => n + (i.quantity || 0), 0);
  const shipping = dhlShipping(totalQty);
  const expressFee = expressDelivery ? 19 : 0;
  const empty = !cart || cart.items.length === 0;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/design-studio")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">Your Cart</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {empty ? (
          <div className="text-center py-20">
            <ShoppingCart className="h-14 w-14 mx-auto opacity-40 mb-4" />
            <p className="text-xl text-muted-foreground mb-6">Your cart is empty</p>
            <Button variant="hero" onClick={() => navigate("/design-studio")}>
              <Plus className="h-4 w-4 mr-2" /> Design a wristband
            </Button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-8">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Items ({cart!.items.length})</h2>
              <div className="space-y-3">
                {cart!.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    {item.design?.designUrl && (
                      <img
                        src={item.design.designUrl}
                        alt="Design"
                        className="w-24 h-10 object-contain rounded bg-white/60"
                      />
                    )}
                    <div className="flex-1 text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium capitalize">{item.design?.wristbandType || "wristband"}</span>
                        <span className="font-semibold">{sym}{item.lineTotal.toFixed(2)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 mt-0.5">
                        {item.options?.hasQrCode && <span>QR</span>}
                        {item.options?.hasTrademark && <span>· Trademark</span>}
                        {item.options?.hasPrint && <span>· Print</span>}
                        <span>· {sym}{item.unitPrice.toFixed(3)}/unit</span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={1}
                            step={100}
                            value={item.quantity}
                            onChange={(e) => handleQty(item.id, parseInt(e.target.value) || 1)}
                            className="h-8 w-24"
                          />
                          <span className="text-xs text-muted-foreground">pcs</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemove(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t pt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2"><Clock className="w-4 h-4" /> Production {expressDelivery ? "2–3 days" : "3–6 days"}</div>
                <div className="flex items-center gap-2"><Truck className="w-4 h-4" /> Shipping 1 day</div>
                <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Door delivery</div>
                <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Guarantee {expressDelivery ? "max 4 days" : "max 7 days"}</div>
              </div>
            </Card>

            <Card className="p-6 h-fit">
              <h2 className="text-xl font-semibold mb-4">Checkout</h2>
              <div className="flex items-center gap-2 mb-3">
                <input id="express" type="checkbox" checked={expressDelivery} onChange={(e) => setExpressDelivery(e.target.checked)} />
                <label htmlFor="express" className="text-sm">Express Delivery (+{sym}19.00)</label>
              </div>
              <div className="space-y-1 border-t pt-3">
                <div className="flex justify-between text-sm"><span>Subtotal</span><span>{sym}{subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm">
                  <span>DHL shipping <span className="text-muted-foreground">({dhlTierLabel(totalQty)})</span></span>
                  <span>{sym}{shipping.toFixed(2)}</span>
                </div>
                {expressDelivery && (
                  <div className="flex justify-between text-sm"><span>Express production</span><span>{sym}{expressFee.toFixed(2)}</span></div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2 text-primary">
                  <span>Total</span><span>{sym}{(subtotal + shipping + expressFee).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4">
                <input id="terms" type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
                <label htmlFor="terms" className="text-sm">I accept the <strong>Terms and Conditions</strong></label>
              </div>
              <Button variant="outline" size="sm" className="mt-2" onClick={downloadTerms}>
                <DownloadIcon className="w-4 h-4 mr-2" /> Terms (PDF)
              </Button>

              <Button onClick={proceed} variant="hero" className="w-full mt-4">
                <ShoppingCart className="h-4 w-4 mr-2" /> Continue to Address
              </Button>
              <Button variant="ghost" className="w-full mt-2" onClick={() => navigate("/design-studio")}>
                <Plus className="h-4 w-4 mr-2" /> Add another design
              </Button>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default OrderSummary;
