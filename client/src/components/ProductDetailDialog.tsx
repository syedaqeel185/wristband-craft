import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { StorefrontProduct } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ImageIcon, Palette } from "lucide-react";

/**
 * Rich product detail with an image gallery, pricing tiers and add-on pricing.
 * "Customize this product" hands the supplier + product to the Design Studio
 * via localStorage (survives the auth redirect), matching the existing
 * "Design with this supplier" flow.
 */
export const ProductDetailDialog = ({
  product,
  supplierId,
  onClose,
}: {
  product: StorefrontProduct;
  supplierId: string;
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  const [active, setActive] = useState(0);
  const images = product.images || [];
  const from = product.priceEur ?? product.priceUsd;
  const sym = product.priceEur != null ? "€" : "$";

  const customize = () => {
    localStorage.setItem("preferred_supplier", supplierId);
    localStorage.setItem("preferred_product", product.id);
    navigate("/design-studio");
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Gallery */}
          <div>
            <div className="aspect-square rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
              {images.length > 0 ? (
                <img src={images[active]} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="h-12 w-12 text-muted-foreground" />
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {images.map((url, idx) => (
                  <button
                    key={url + idx}
                    onClick={() => setActive(idx)}
                    className={`w-14 h-14 rounded-md overflow-hidden border-2 ${idx === active ? "border-primary" : "border-transparent"}`}
                  >
                    <img src={url} alt={`${product.name} ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="capitalize">{product.wristbandType}</Badge>
            </div>
            {product.description && <p className="text-sm text-muted-foreground">{product.description}</p>}

            <div className="text-2xl font-bold text-primary">
              {sym}{Number(from).toFixed(2)} <span className="text-sm font-normal text-muted-foreground">/ unit</span>
            </div>

            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Minimum order</span>
                <span className="font-medium">{product.minOrderQuantity} pcs</span>
              </div>
              {product.maxOrderQuantity != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Maximum order</span>
                  <span className="font-medium">{product.maxOrderQuantity} pcs</span>
                </div>
              )}
            </div>

            {/* Customization options — exactly what the supplier configured on
                this product, priced from the same source the checkout uses. */}
            {(product.options || []).filter((o) => o.isActive).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Customization options</p>
                <div className="flex flex-wrap gap-1">
                  {(product.options || [])
                    .filter((o) => o.isActive)
                    .map((o) => {
                      const price = o.priceEur ?? o.priceUsd ?? 0;
                      const s = o.priceEur != null ? "€" : "$";
                      return (
                        <Badge key={o.key} variant="outline" title={o.description || undefined}>
                          {o.label}
                          {price > 0
                            ? ` +${s}${price}${o.pricingMode === "one_time" ? " one-time" : "/unit"}`
                            : ""}
                          {o.choices && o.choices.length > 0
                            ? ` (${o.choices.map((c) => c.label).join(" / ")})`
                            : ""}
                        </Badge>
                      );
                    })}
                </div>
              </div>
            )}

            <Button className="w-full" onClick={customize}>
              <Palette className="h-4 w-4 mr-2" /> Customize this product
            </Button>
          </div>
        </div>

        {/* Quantity pricing */}
        {product.pricingTiers && product.pricingTiers.length > 0 && (
          <div className="mt-2">
            <p className="text-sm font-medium mb-2">Volume pricing</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quantity</TableHead>
                  <TableHead className="text-right">Price / unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.pricingTiers.map((t, i) => (
                  <TableRow key={t.id || i}>
                    <TableCell>
                      {t.minQuantity}
                      {t.maxQuantity ? `–${t.maxQuantity}` : "+"} pcs
                    </TableCell>
                    <TableCell className="text-right">
                      {t.pricePerUnitEur != null ? `€${t.pricePerUnitEur}` : `$${t.pricePerUnitUsd}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
