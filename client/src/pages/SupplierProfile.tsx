import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSupplierProfile, type SupplierProfile as Profile, type StorefrontProduct } from "@/lib/api";
import { Stars } from "@/components/SupplierGrid";
import { ProductDetailDialog } from "@/components/ProductDetailDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, BadgeCheck, MapPin, Package, Star, Truck, Loader2, ImageIcon, Palette, ShieldCheck, CalendarDays,
} from "lucide-react";
import { toast } from "sonner";

const SupplierProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StorefrontProduct | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getSupplierProfile(id)
      .then(setData)
      .catch((e) => {
        toast.error(e.message || "Supplier not found");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const designWith = () => {
    if (!id) return;
    localStorage.setItem("preferred_supplier", id);
    navigate("/design-studio");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">This supplier could not be found.</p>
        <Button onClick={() => navigate(-1)}>Go back</Button>
      </div>
    );
  }

  const { supplier, products, reviews, shipping, stats } = data;
  const memberSince = new Date(stats.memberSince).toLocaleDateString(undefined, { year: "numeric", month: "long" });

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Store header */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="w-24 h-24 rounded-xl border bg-muted overflow-hidden flex items-center justify-center shrink-0">
                {supplier.logoUrl ? (
                  <img src={supplier.logoUrl} alt={supplier.companyName} className="w-full h-full object-cover" />
                ) : (
                  <Package className="h-10 w-10 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold">{supplier.companyName}</h1>
                  {supplier.isVerified && (
                    <Badge variant="secondary" className="gap-1">
                      <BadgeCheck className="h-3.5 w-3.5 text-primary" /> Verified
                    </Badge>
                  )}
                </div>

                {(supplier.city || supplier.country || supplier.countryCode) && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                    {supplier.countryCode ? (
                      <img
                        src={`https://flagcdn.com/20x15/${supplier.countryCode.toLowerCase()}.png`}
                        alt={supplier.countryCode}
                        width={18}
                        height={13}
                        className="rounded-[2px]"
                        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                      />
                    ) : (
                      <MapPin className="h-3.5 w-3.5" />
                    )}
                    {[supplier.city, supplier.country].filter(Boolean).join(", ") || supplier.countryCode}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-2">
                  <Stars value={supplier.rating} />
                  <span className="text-sm text-muted-foreground">
                    {supplier.rating > 0 ? supplier.rating.toFixed(1) : "New"} · {supplier.reviewCount} review
                    {supplier.reviewCount === 1 ? "" : "s"}
                  </span>
                </div>

                {supplier.description && (
                  <p className="text-sm text-muted-foreground mt-3 max-w-2xl">{supplier.description}</p>
                )}
              </div>

              <Button onClick={designWith} className="shrink-0">
                <Palette className="h-4 w-4 mr-2" /> Design with this supplier
              </Button>
            </div>

            {/* Stat strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t">
              <Stat icon={<Package className="h-4 w-4" />} label="Products" value={String(stats.productCount)} />
              <Stat icon={<ShieldCheck className="h-4 w-4" />} label="Orders fulfilled" value={String(stats.ordersFulfilled)} />
              <Stat icon={<Star className="h-4 w-4" />} label="Rating" value={supplier.rating > 0 ? supplier.rating.toFixed(1) : "—"} />
              <Stat icon={<CalendarDays className="h-4 w-4" />} label="Member since" value={memberSince} />
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="products">
          <TabsList>
            <TabsTrigger value="products">Products ({products.length})</TabsTrigger>
            <TabsTrigger value="reviews">Reviews ({reviews.length})</TabsTrigger>
            <TabsTrigger value="delivery">Delivery</TabsTrigger>
          </TabsList>

          {/* Products */}
          <TabsContent value="products" className="mt-4">
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">This supplier hasn't listed any products yet.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((p) => {
                  const from = p.priceEur ?? p.priceUsd;
                  const sym = p.priceEur != null ? "€" : "$";
                  return (
                    <Card
                      key={p.id}
                      className="cursor-pointer hover:shadow-xl transition-shadow overflow-hidden"
                      onClick={() => setSelected(p)}
                    >
                      <div className="aspect-square bg-muted flex items-center justify-center">
                        {p.images[0] ? (
                          <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="h-10 w-10 text-muted-foreground" />
                        )}
                      </div>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{p.name}</h3>
                          <Badge variant="secondary" className="capitalize text-xs">{p.wristbandType}</Badge>
                        </div>
                        {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
                        <div className="flex items-end justify-between mt-3">
                          <div>
                            <span className="text-xs text-muted-foreground">from</span>
                            <div className="text-lg font-bold text-primary">{sym}{Number(from).toFixed(2)}</div>
                          </div>
                          <span className="text-xs text-muted-foreground">min {p.minOrderQuantity} pcs</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Reviews */}
          <TabsContent value="reviews" className="mt-4">
            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No reviews yet.</p>
            ) : (
              <Card>
                <CardContent className="pt-6 space-y-4">
                  {reviews.map((r) => (
                    <div key={r.id} className="border-b pb-3 last:border-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{r.reviewer}</span>
                        <Stars value={r.rating} />
                      </div>
                      {r.comment && <p className="text-sm text-muted-foreground mt-1">{r.comment}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{new Date(r.createdAt).toLocaleDateString()}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Delivery */}
          <TabsContent value="delivery" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                {shipping.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Standard delivery applies. Delivery cost is calculated at checkout based on your order quantity.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {shipping.map((s) => (
                      <div key={s.id} className="border rounded-lg p-4">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-primary" />
                          <span className="font-medium">{s.courier}</span>
                          {s.label && <span className="text-sm text-muted-foreground">— {s.label}</span>}
                          {s.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                        </div>
                        <div className="text-sm text-muted-foreground mt-2 flex flex-wrap gap-x-6 gap-y-1">
                          {(s.estMinDays != null || s.estMaxDays != null) && (
                            <span>Est. delivery: {s.estMinDays ?? "?"}–{s.estMaxDays ?? "?"} days</span>
                          )}
                          {s.freeOverQty != null && <span>Free over {s.freeOverQty} pcs</span>}
                          {s.tiers.length > 0 && (
                            <span>
                              From €{Math.min(...s.tiers.map((t) => t.priceEur)).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {selected && <ProductDetailDialog product={selected} supplierId={supplier.id} onClose={() => setSelected(null)} />}
    </div>
  );
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div>
    <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
      {icon} {label}
    </div>
    <div className="font-semibold mt-1">{value}</div>
  </div>
);

export default SupplierProfile;
