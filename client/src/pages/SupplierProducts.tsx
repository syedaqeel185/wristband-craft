import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, uploadImage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Save, Edit2, ImagePlus, X, Star, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface PricingTier {
  id?: string;
  minQuantity: number;
  maxQuantity?: number | null;
  pricePerUnitUsd: number;
  pricePerUnitEur?: number | null;
  pricePerUnitGbp?: number | null;
}

interface Product {
  id?: string;
  name: string;
  description?: string;
  wristbandType: string;
  priceUsd: number;
  priceEur?: number | null;
  priceGbp?: number | null;
  minOrderQuantity: number;
  maxOrderQuantity?: number | null;
  isActive: boolean;
  allowsCustomText: boolean;
  allowsCustomColor: boolean;
  allowsLogoUpload: boolean;
  // Product photo gallery, persisted as a JSON string of URLs (first = primary).
  imageUrls?: string;
  // Customization add-on pricing (read by the dynamic pricing engine)
  printExtraUsd: number;
  colorPrintExtraUsd: number;
  logoExtraUsd: number;
  designSetupFeeUsd: number;
  qrCodePriceUsd: number;
  trademarkFeeUsd: number;
  pricingTiers: PricingTier[];
}

const EMPTY_PRODUCT: Product = {
  name: "",
  description: "",
  wristbandType: "tyvek",
  priceUsd: 0,
  priceEur: null,
  priceGbp: null,
  minOrderQuantity: 100,
  maxOrderQuantity: null,
  isActive: true,
  allowsCustomText: true,
  allowsCustomColor: true,
  allowsLogoUpload: true,
  imageUrls: "[]",
  printExtraUsd: 0,
  colorPrintExtraUsd: 0,
  logoExtraUsd: 0,
  designSetupFeeUsd: 0,
  qrCodePriceUsd: 0,
  trademarkFeeUsd: 0,
  pricingTiers: [],
};

const EMPTY_TIER: PricingTier = {
  minQuantity: 1,
  maxQuantity: null,
  pricePerUnitUsd: 0,
  pricePerUnitEur: null,
  pricePerUnitGbp: null,
};

const SupplierProducts = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product>(EMPTY_PRODUCT);
  const [isEditMode, setIsEditMode] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const parseImages = (value?: string): string[] => {
    if (!value) return [];
    try {
      const v = JSON.parse(value);
      return Array.isArray(v) ? v.filter((u) => typeof u === "string" && u) : [];
    } catch {
      return [];
    }
  };

  const handleUploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} is not an image`);
          continue;
        }
        const { url } = await uploadImage(file);
        uploaded.push(url);
      }
      if (uploaded.length) {
        setImages((prev) => [...prev, ...uploaded]);
        toast.success(`${uploaded.length} photo${uploaded.length !== 1 ? "s" : ""} added`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to upload photo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));
  const makePrimary = (idx: number) =>
    setImages((prev) => (idx <= 0 ? prev : [prev[idx], ...prev.filter((_, i) => i !== idx)]));

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await apiFetch("/suppliers/me/products");
      setProducts(data || []);
    } catch {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingProduct({ ...EMPTY_PRODUCT, pricingTiers: [] });
    setImages([]);
    setIsEditMode(false);
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct({ ...product });
    setImages(parseImages(product.imageUrls));
    setIsEditMode(true);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingProduct.name.trim()) {
      toast.error("Product name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = { ...editingProduct, imageUrls: JSON.stringify(images) };
      if (isEditMode && editingProduct.id) {
        await apiFetch(`/suppliers/me/products/${editingProduct.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Product updated");
      } else {
        await apiFetch("/suppliers/me/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Product created");
      }
      setDialogOpen(false);
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    try {
      await apiFetch(`/suppliers/me/products/${productId}`, { method: "DELETE" });
      toast.success("Product deleted");
      fetchProducts();
    } catch {
      toast.error("Failed to delete product");
    }
  };

  const addTier = () => {
    setEditingProduct(p => ({
      ...p,
      pricingTiers: [...p.pricingTiers, { ...EMPTY_TIER }],
    }));
  };

  const removeTier = (idx: number) => {
    setEditingProduct(p => ({
      ...p,
      pricingTiers: p.pricingTiers.filter((_, i) => i !== idx),
    }));
  };

  const updateTier = (idx: number, field: keyof PricingTier, value: any) => {
    setEditingProduct(p => ({
      ...p,
      pricingTiers: p.pricingTiers.map((t, i) =>
        i === idx ? { ...t, [field]: value === "" ? null : isNaN(Number(value)) ? value : Number(value) } : t
      ),
    }));
  };

  const updateField = (field: keyof Product, value: any) => {
    setEditingProduct(p => ({ ...p, [field]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <header className="max-w-5xl mx-auto border-b bg-card/50 backdrop-blur-sm p-4 flex items-center justify-between rounded-t-xl mb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/supplier")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            My Products
          </h1>
        </div>
        <Button onClick={openCreate} className="flex gap-2">
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </header>

      <main className="max-w-5xl mx-auto space-y-4">
        {products.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No products yet. Create your first product to let customers order from you.</p>
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Your First Product</Button>
          </Card>
        ) : (
          products.map((product: any) => (
            <Card key={product.id} className="shadow">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  {(() => {
                    const primary = parseImages(product.imageUrls)[0];
                    return primary ? (
                      <img
                        src={primary}
                        alt={product.name}
                        className="w-20 h-20 rounded-lg object-cover border shrink-0"
                      />
                    ) : null;
                  })()}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{product.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${product.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {product.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{product.description || "—"}</p>
                    <div className="flex gap-4 mt-2 text-sm">
                      <span>Type: <strong>{product.wristbandType}</strong></span>
                      <span>Min Qty: <strong>{product.minOrderQuantity}</strong></span>
                      {product.maxOrderQuantity && <span>Max Qty: <strong>{product.maxOrderQuantity}</strong></span>}
                      <span>Base: <strong>${product.priceUsd}</strong>{product.priceEur ? ` / €${product.priceEur}` : ""}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                      {product.qrCodePriceUsd > 0 && <span>QR: +${product.qrCodePriceUsd}/unit</span>}
                      {product.designSetupFeeUsd > 0 && <span>Design: +${product.designSetupFeeUsd}</span>}
                      {product.trademarkFeeUsd > 0 && <span>Trademark: +${product.trademarkFeeUsd}</span>}
                      {product.colorPrintExtraUsd > 0 && <span>Colour print: +${product.colorPrintExtraUsd}/unit</span>}
                      {product.pricingTiers?.length > 0 && (
                        <span>{product.pricingTiers.length} quantity tier{product.pricingTiers.length !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(product)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(product.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit Product" : "New Product"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <Label>Product Name *</Label>
                <Input value={editingProduct.name} onChange={e => updateField("name", e.target.value)} placeholder="e.g. Tyvek Standard Wristband" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Description</Label>
                <Input value={editingProduct.description || ""} onChange={e => updateField("description", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Wristband Type</Label>
                <Select value={editingProduct.wristbandType} onValueChange={v => updateField("wristbandType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tyvek">Tyvek</SelectItem>
                    <SelectItem value="silicone">Silicone</SelectItem>
                    <SelectItem value="fabric">Fabric</SelectItem>
                    <SelectItem value="vinyl">Vinyl</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={editingProduct.isActive ? "active" : "inactive"} onValueChange={v => updateField("isActive", v === "active")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Min Order Quantity</Label>
                <Input type="number" value={editingProduct.minOrderQuantity} onChange={e => updateField("minOrderQuantity", parseInt(e.target.value) || 1)} />
              </div>
              <div className="space-y-1">
                <Label>Max Order Quantity (optional)</Label>
                <Input type="number" value={editingProduct.maxOrderQuantity ?? ""} onChange={e => updateField("maxOrderQuantity", e.target.value === "" ? null : parseInt(e.target.value))} />
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-medium">Product Photos</h4>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleUploadImages(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ImagePlus className="h-4 w-4 mr-1" />}
                  {uploading ? "Uploading…" : "Add Photos"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                These photos appear on your public storefront and product pages. The first photo is the main image.
              </p>
              {images.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-lg">
                  No photos yet. Add product photos so customers can see what they're ordering.
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {images.map((url, idx) => (
                    <div key={url + idx} className="relative group aspect-square rounded-lg overflow-hidden border">
                      <img src={url} alt={`Product photo ${idx + 1}`} className="w-full h-full object-cover" />
                      {idx === 0 && (
                        <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Star className="h-2.5 w-2.5 fill-current" /> Main
                        </span>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                        {idx !== 0 && (
                          <Button type="button" size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => makePrimary(idx)}>
                            Set main
                          </Button>
                        )}
                        <Button type="button" size="icon" variant="destructive" className="h-7 w-7" onClick={() => removeImage(idx)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Base Prices</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>USD ($) *</Label>
                  <Input type="number" step="0.001" value={editingProduct.priceUsd} onChange={e => updateField("priceUsd", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label>EUR (€)</Label>
                  <Input type="number" step="0.001" value={editingProduct.priceEur ?? ""} onChange={e => updateField("priceEur", e.target.value === "" ? null : parseFloat(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label>GBP (£)</Label>
                  <Input type="number" step="0.001" value={editingProduct.priceGbp ?? ""} onChange={e => updateField("priceGbp", e.target.value === "" ? null : parseFloat(e.target.value))} />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-1">Customization Add-on Pricing (USD)</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Charges added on top of the base price when a customer enables these options.
                Per-unit charges are multiplied by quantity; one-time fees are charged once per order.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Black print / unit</Label>
                  <Input type="number" step="0.001" value={editingProduct.printExtraUsd} onChange={e => updateField("printExtraUsd", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label>Full-colour print / unit</Label>
                  <Input type="number" step="0.001" value={editingProduct.colorPrintExtraUsd} onChange={e => updateField("colorPrintExtraUsd", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label>Logo printing / unit</Label>
                  <Input type="number" step="0.001" value={editingProduct.logoExtraUsd} onChange={e => updateField("logoExtraUsd", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label>QR code / unit</Label>
                  <Input type="number" step="0.001" value={editingProduct.qrCodePriceUsd} onChange={e => updateField("qrCodePriceUsd", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label>Custom design setup (one-time)</Label>
                  <Input type="number" step="0.01" value={editingProduct.designSetupFeeUsd} onChange={e => updateField("designSetupFeeUsd", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label>Trademark / branding (one-time)</Label>
                  <Input type="number" step="0.01" value={editingProduct.trademarkFeeUsd} onChange={e => updateField("trademarkFeeUsd", parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Quantity Pricing Tiers</h4>
                <Button type="button" variant="outline" size="sm" onClick={addTier}>
                  <Plus className="h-4 w-4 mr-1" />Add Tier
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">If tiers are set, the unit price is determined by which tier the order quantity falls into.</p>
              {editingProduct.pricingTiers.map((tier, idx) => (
                <Card key={idx} className="mb-2">
                  <CardContent className="pt-3 pb-3">
                    <div className="grid grid-cols-5 gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Min Qty</Label>
                        <Input type="number" value={tier.minQuantity} onChange={e => updateTier(idx, "minQuantity", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max Qty</Label>
                        <Input type="number" value={tier.maxQuantity ?? ""} onChange={e => updateTier(idx, "maxQuantity", e.target.value)} placeholder="unlimited" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">$/unit</Label>
                        <Input type="number" step="0.001" value={tier.pricePerUnitUsd} onChange={e => updateTier(idx, "pricePerUnitUsd", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">€/unit</Label>
                        <Input type="number" step="0.001" value={tier.pricePerUnitEur ?? ""} onChange={e => updateTier(idx, "pricePerUnitEur", e.target.value)} />
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeTier(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {editingProduct.pricingTiers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">No tiers. Base price applies to all quantities.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="flex gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupplierProducts;
