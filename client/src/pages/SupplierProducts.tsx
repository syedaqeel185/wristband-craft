import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, uploadImage, getOptionDefaults, ProductOption, OptionChoice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash2, Save, Edit2, ImagePlus, X, Star, Loader2,
  GripVertical, ChevronDown, ChevronUp, Copy, RotateCcw, ArrowUp, ArrowDown, Wand2,
} from "lucide-react";
import { tyvekPreset } from "@/lib/tyvek";
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
  sortOrder?: number;
  allowsCustomText: boolean;
  allowsCustomColor: boolean;
  allowsLogoUpload: boolean;
  // Product photo gallery, persisted as a JSON string of URLs (first = primary).
  imageUrls?: string;
  // Persisted as JSON strings server-side (e.g. '["19 × 225 mm"]' / '[{"name":"White","value":"#FFF"}]').
  availableSizes?: string;
  availableColors?: string;
  pricingTiers: PricingTier[];
  // Supplier-configured customization add-ons (the pricing source of truth).
  options: ProductOption[];
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
  pricingTiers: [],
  options: [],
};

const EMPTY_TIER: PricingTier = {
  minQuantity: 1,
  maxQuantity: null,
  pricePerUnitUsd: 0,
  pricePerUnitEur: null,
  pricePerUnitGbp: null,
};

/** Suggested wristband types — suppliers can type any custom type as well. */
const TYPE_SUGGESTIONS = ["tyvek", "silicone", "fabric", "vinyl", "plastic", "rfid", "event"];

const STUDIO_MODULES: { value: string; label: string }[] = [
  { value: "toggle", label: "Simple toggle (customer switches it on/off)" },
  { value: "print", label: "Print & artwork (enables design/logo upload)" },
  { value: "qr", label: "QR code" },
  { value: "trademark", label: "Trademark / brand text" },
  { value: "design_setup", label: "Auto fee when a custom design is used" },
];

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "option";

const newCustomOption = (sortOrder: number): ProductOption => ({
  key: "",
  label: "",
  description: "",
  groupName: "Custom",
  pricingMode: "per_unit",
  priceUsd: 0,
  priceEur: null,
  priceGbp: null,
  isActive: true,
  sortOrder,
  studioModule: "toggle",
  choices: undefined,
});

const numOrNull = (v: string) => (v === "" ? null : isNaN(Number(v)) ? null : Number(v));

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
  const [optionDefaults, setOptionDefaults] = useState<ProductOption[]>([]);
  const [expandedOptions, setExpandedOptions] = useState<Set<number>>(new Set());
  const [previewQty, setPreviewQty] = useState<number>(500);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Drag state for the product list + the option builder.
  const dragProductIdx = useRef<number | null>(null);
  const dragOptionIdx = useRef<number | null>(null);

  useEffect(() => {
    fetchProducts();
    getOptionDefaults()
      .then(setOptionDefaults)
      .catch(() => {
        // Defaults are only a convenience for new products — non-fatal.
      });
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
    setEditingProduct({
      ...EMPTY_PRODUCT,
      pricingTiers: [],
      // Start from the default template — the supplier can remove, rename,
      // reprice, reorder, or replace every entry.
      options: optionDefaults.map((o) => ({ ...o, choices: o.choices?.map((c) => ({ ...c })) })),
    });
    setImages([]);
    setExpandedOptions(new Set());
    setIsEditMode(false);
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct({
      ...product,
      pricingTiers: Array.isArray(product.pricingTiers) ? product.pricingTiers : [],
      options: Array.isArray(product.options)
        ? product.options.map((o) => ({ ...o, choices: o.choices?.map((c) => ({ ...c })) }))
        : [],
    });
    setImages(parseImages(product.imageUrls));
    setExpandedOptions(new Set());
    setPreviewQty(product.minOrderQuantity || 500);
    setIsEditMode(true);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingProduct.name.trim()) {
      toast.error("Product name is required");
      return;
    }
    if (!editingProduct.wristbandType.trim()) {
      toast.error("Product type is required");
      return;
    }
    const unlabeled = (editingProduct.options || []).some((o) => !o.label.trim());
    if (unlabeled) {
      toast.error("Every customization option needs a name (or remove the empty ones)");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...editingProduct,
        wristbandType: editingProduct.wristbandType.trim().toLowerCase(),
        imageUrls: JSON.stringify(images),
        options: (editingProduct.options || []).map((o, i) => ({
          ...o,
          key: o.key || slugify(o.label),
          sortOrder: i,
        })),
      };
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

  // ---- Product list reordering (drag & drop + keyboard buttons) ----

  const persistOrder = async (ordered: Product[]) => {
    setProducts(ordered);
    try {
      await apiFetch("/suppliers/me/products/reorder", {
        method: "PATCH",
        body: JSON.stringify({ productIds: ordered.map((p) => p.id) }),
      });
    } catch {
      toast.error("Failed to save the new order");
      fetchProducts();
    }
  };

  const moveProduct = (from: number, to: number) => {
    if (to < 0 || to >= products.length || from === to) return;
    const next = [...products];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persistOrder(next);
  };

  // ---- Tier editing ----

  const addTier = () => {
    setEditingProduct(p => ({
      ...p,
      pricingTiers: [...(p.pricingTiers || []), { ...EMPTY_TIER }],
    }));
  };

  const removeTier = (idx: number) => {
    setEditingProduct(p => ({
      ...p,
      pricingTiers: (p.pricingTiers || []).filter((_, i) => i !== idx),
    }));
  };

  const updateTier = (idx: number, field: keyof PricingTier, value: any) => {
    setEditingProduct(p => ({
      ...p,
      pricingTiers: (p.pricingTiers || []).map((t, i) =>
        i === idx ? { ...t, [field]: value === "" ? null : isNaN(Number(value)) ? value : Number(value) } : t
      ),
    }));
  };

  const updateField = (field: keyof Product, value: any) => {
    setEditingProduct(p => ({ ...p, [field]: value }));
  };

  // One-click prefill of the standard TYVEK® catalogue (types/sizes/colours/tiers/options).
  // Only fills the form state — the supplier still reviews and clicks Save.
  const loadTyvekPreset = () => {
    const preset = tyvekPreset();
    setEditingProduct((p) => ({
      ...p,
      // Keep any name the supplier already typed; otherwise use the preset name.
      name: p.name.trim() ? p.name : preset.name,
      wristbandType: preset.wristbandType,
      description: preset.description,
      minOrderQuantity: preset.minOrderQuantity,
      // availableSizes/availableColors are stored as JSON strings server-side.
      availableSizes: JSON.stringify(preset.availableSizes),
      availableColors: JSON.stringify(preset.availableColors),
      pricingTiers: preset.pricingTiers.map((t) => ({
        minQuantity: t.minQuantity,
        maxQuantity: t.maxQuantity,
        pricePerUnitUsd: t.pricePerUnitUsd,
        pricePerUnitEur: t.pricePerUnitEur,
        pricePerUnitGbp: null,
      })),
      options: preset.options.map((o, i) => ({
        key: o.key,
        label: o.label,
        description: o.description,
        groupName: o.groupName,
        pricingMode: o.pricingMode,
        priceUsd: o.priceUsd,
        priceEur: o.priceEur,
        priceGbp: o.priceGbp,
        isActive: o.isActive,
        sortOrder: i,
        studioModule: o.studioModule,
        choices: undefined,
      })),
    }));
    setExpandedOptions(new Set());
    setPreviewQty(preset.minOrderQuantity);
    toast.success("Tyvek preset loaded — review and save");
  };

  // ---- Option builder ----

  const setOptions = (updater: (opts: ProductOption[]) => ProductOption[]) => {
    setEditingProduct((p) => ({ ...p, options: updater(p.options || []) }));
  };

  const updateOption = (idx: number, patch: Partial<ProductOption>) => {
    setOptions((opts) => opts.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const removeOption = (idx: number) => {
    setOptions((opts) => opts.filter((_, i) => i !== idx));
    setExpandedOptions((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => { if (i !== idx) next.add(i > idx ? i - 1 : i); });
      return next;
    });
  };

  const duplicateOption = (idx: number) => {
    setOptions((opts) => {
      const src = opts[idx];
      const copy: ProductOption = {
        ...src,
        id: undefined,
        key: "",
        label: src.label ? `${src.label} (copy)` : "",
        choices: src.choices?.map((c) => ({ ...c })),
      };
      return [...opts.slice(0, idx + 1), copy, ...opts.slice(idx + 1)];
    });
  };

  const moveOption = (from: number, to: number) => {
    setOptions((opts) => {
      if (to < 0 || to >= opts.length || from === to) return opts;
      const next = [...opts];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setExpandedOptions(new Set());
  };

  const addOption = () => {
    setOptions((opts) => [...opts, newCustomOption(opts.length)]);
    setExpandedOptions((prev) => new Set(prev).add((editingProduct.options || []).length));
  };

  const resetToDefaults = () => {
    if (!optionDefaults.length) return;
    if (!confirm("Replace the current option list with the default template?")) return;
    setOptions(() => optionDefaults.map((o) => ({ ...o, choices: o.choices?.map((c) => ({ ...c })) })));
    setExpandedOptions(new Set());
  };

  const toggleExpanded = (idx: number) => {
    setExpandedOptions((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  // ---- Choice editing (sub-options like Static QR / Dynamic QR) ----

  const updateChoices = (optIdx: number, updater: (c: OptionChoice[]) => OptionChoice[]) => {
    setOptions((opts) =>
      opts.map((o, i) => (i === optIdx ? { ...o, choices: updater(o.choices || []) } : o)),
    );
  };

  // ---- Live pricing preview (display-only; the server quote is authoritative) ----

  const preview = useMemo(() => {
    const qty = Math.max(1, previewQty || 1);
    const tier = (editingProduct.pricingTiers || []).find(
      (t) => qty >= (Number(t.minQuantity) || 0) && (t.maxQuantity == null || qty <= Number(t.maxQuantity)),
    );
    const baseUnit = tier ? Number(tier.pricePerUnitUsd) || 0 : Number(editingProduct.priceUsd) || 0;
    let perUnitExtras = 0;
    let oneTime = 0;
    const activeOptions = (editingProduct.options || []).filter((o) => o.isActive);
    for (const o of activeOptions) {
      const price = Number(o.priceUsd) || 0;
      if (o.pricingMode === "one_time") oneTime += price;
      else perUnitExtras += price;
    }
    const allIn = (baseUnit + perUnitExtras) * qty + oneTime;
    return { qty, baseUnit, perUnitExtras, oneTime, allIn, tierUsed: !!tier };
  }, [editingProduct.priceUsd, editingProduct.pricingTiers, editingProduct.options, previewQty]);

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
        {products.length > 1 && (
          <p className="text-xs text-muted-foreground">
            Drag the handle (or use the arrows) to change the order customers see your products in.
          </p>
        )}
        {products.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No products yet. Create your first product to let customers order from you.</p>
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Your First Product</Button>
          </Card>
        ) : (
          products.map((product: any, idx: number) => (
            <Card
              key={product.id}
              className="shadow"
              draggable
              onDragStart={() => { dragProductIdx.current = idx; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragProductIdx.current;
                dragProductIdx.current = null;
                if (from != null) moveProduct(from, idx);
              }}
            >
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col items-center gap-1 pt-1 text-muted-foreground">
                    <button type="button" className="cursor-grab active:cursor-grabbing" title="Drag to reorder" aria-label="Drag to reorder">
                      <GripVertical className="h-5 w-5" />
                    </button>
                    <button type="button" onClick={() => moveProduct(idx, idx - 1)} disabled={idx === 0} className="disabled:opacity-30" aria-label="Move up">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => moveProduct(idx, idx + 1)} disabled={idx === products.length - 1} className="disabled:opacity-30" aria-label="Move down">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
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
                    <div className="flex flex-wrap gap-x-2 gap-y-1 mt-2 text-xs text-muted-foreground">
                      {(product.options || [])
                        .filter((o: ProductOption) => o.isActive && (Number(o.priceUsd) > 0 || Number(o.priceEur) > 0))
                        .slice(0, 5)
                        .map((o: ProductOption) => (
                          <span key={o.key}>
                            {o.label}: +${o.priceUsd}{o.pricingMode === "per_unit" ? "/unit" : ""}
                          </span>
                        ))}
                      {(product.options || []).filter((o: ProductOption) => o.isActive).length > 0 && (
                        <span>· {(product.options || []).filter((o: ProductOption) => o.isActive).length} option{(product.options || []).filter((o: ProductOption) => o.isActive).length !== 1 ? "s" : ""}</span>
                      )}
                      {product.pricingTiers?.length > 0 && (
                        <span>· {product.pricingTiers.length} quantity tier{product.pricingTiers.length !== 1 ? "s" : ""}</span>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit Product" : "New Product"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Don't sell Tyvek yet? Load the standard TYVEK® catalogue — sizes, 18 colours,
                quantity tiers and print/QR/RFID options — in one click.
              </p>
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={loadTyvekPreset}>
                <Wand2 className="h-4 w-4 mr-1" />
                Load Tyvek preset
              </Button>
            </div>

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
                <Label>Product Type</Label>
                <Input
                  list="wristband-type-suggestions"
                  value={editingProduct.wristbandType}
                  onChange={e => updateField("wristbandType", e.target.value)}
                  placeholder="e.g. tyvek, silicone, rfid…"
                />
                <datalist id="wristband-type-suggestions">
                  {TYPE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
                </datalist>
                <p className="text-[11px] text-muted-foreground">
                  Pick a suggestion or type your own — customers only see the types you actually sell.
                </p>
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
              <h4 className="font-medium mb-3">Base Prices (per unit)</h4>
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

            {/* ---- Customization option builder ---- */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-medium">Customization Options</h4>
                <div className="flex gap-2">
                  {optionDefaults.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={resetToDefaults} title="Replace with the default template">
                      <RotateCcw className="h-4 w-4 mr-1" />Reset to defaults
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={addOption}>
                    <Plus className="h-4 w-4 mr-1" />Add option
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                These are the add-ons customers can pick in the Design Studio. Drag to reorder, switch off to hide,
                or delete what you don't offer. Per-unit prices are multiplied by quantity; one-time fees are charged once per order.
              </p>

              {(editingProduct.options || []).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-lg">
                  No customization options. Customers will only be able to order the plain product.
                </p>
              )}

              <div className="space-y-2">
                {(editingProduct.options || []).map((opt, idx) => {
                  const expanded = expandedOptions.has(idx);
                  return (
                    <div
                      key={idx}
                      className={`rounded-lg border ${opt.isActive ? "bg-card" : "bg-muted/40 opacity-70"}`}
                      draggable
                      onDragStart={() => { dragOptionIdx.current = idx; }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = dragOptionIdx.current;
                        dragOptionIdx.current = null;
                        if (from != null) moveOption(from, idx);
                      }}
                    >
                      <div className="flex items-center gap-2 p-2">
                        <span className="cursor-grab active:cursor-grabbing text-muted-foreground" title="Drag to reorder">
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <Switch
                          checked={opt.isActive}
                          onCheckedChange={(v) => updateOption(idx, { isActive: v })}
                          title={opt.isActive ? "Offered to customers" : "Hidden from customers"}
                        />
                        <Input
                          className="flex-1 h-8"
                          value={opt.label}
                          placeholder="Option name (e.g. RFID Sticker)"
                          onChange={(e) => updateOption(idx, { label: e.target.value })}
                        />
                        <Select value={opt.pricingMode} onValueChange={(v) => updateOption(idx, { pricingMode: v as "per_unit" | "one_time" })}>
                          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="per_unit">per unit</SelectItem>
                            <SelectItem value="one_time">one-time</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="relative">
                          <span className="absolute left-2 top-1.5 text-xs text-muted-foreground">$</span>
                          <Input
                            className="w-24 h-8 pl-5"
                            type="number"
                            step="0.001"
                            value={opt.priceUsd}
                            onChange={(e) => updateOption(idx, { priceUsd: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleExpanded(idx)} title="More settings">
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateOption(idx)} title="Duplicate">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeOption(idx)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {expanded && (
                        <div className="border-t px-3 py-3 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Description (shown to customers)</Label>
                              <Textarea
                                rows={2}
                                value={opt.description || ""}
                                onChange={(e) => updateOption(idx, { description: e.target.value })}
                              />
                            </div>
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Group</Label>
                                <Input
                                  className="h-8"
                                  value={opt.groupName || ""}
                                  placeholder="e.g. Print, Codes & tracking"
                                  onChange={(e) => updateOption(idx, { groupName: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Design Studio behaviour</Label>
                                <Select value={opt.studioModule || "toggle"} onValueChange={(v) => updateOption(idx, { studioModule: v })}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {STUDIO_MODULES.map((m) => (
                                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Price EUR (€) — optional override</Label>
                              <Input className="h-8" type="number" step="0.001" value={opt.priceEur ?? ""} onChange={(e) => updateOption(idx, { priceEur: numOrNull(e.target.value) })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Price GBP (£) — optional override</Label>
                              <Input className="h-8" type="number" step="0.001" value={opt.priceGbp ?? ""} onChange={(e) => updateOption(idx, { priceGbp: numOrNull(e.target.value) })} />
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <Label className="text-xs">Choices (optional sub-options, e.g. Static QR / Dynamic QR)</Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => updateChoices(idx, (c) => [...c, { key: "", label: "" }])}
                              >
                                <Plus className="h-3 w-3 mr-1" />Add choice
                              </Button>
                            </div>
                            {(opt.choices || []).length === 0 ? (
                              <p className="text-[11px] text-muted-foreground">No choices — the option is a simple on/off add-on.</p>
                            ) : (
                              <div className="space-y-1">
                                {(opt.choices || []).map((choice, cIdx) => (
                                  <div key={cIdx} className="flex items-center gap-2">
                                    <Input
                                      className="h-7 flex-1 text-xs"
                                      value={choice.label}
                                      placeholder="Choice name (e.g. Dynamic QR)"
                                      onChange={(e) =>
                                        updateChoices(idx, (c) => c.map((x, i) => (i === cIdx ? { ...x, label: e.target.value } : x)))
                                      }
                                    />
                                    <div className="relative">
                                      <span className="absolute left-2 top-1 text-[11px] text-muted-foreground">$</span>
                                      <Input
                                        className="h-7 w-24 pl-5 text-xs"
                                        type="number"
                                        step="0.001"
                                        placeholder="option price"
                                        title="Optional — overrides the option price when this choice is selected"
                                        value={choice.priceUsd ?? ""}
                                        onChange={(e) =>
                                          updateChoices(idx, (c) => c.map((x, i) => (i === cIdx ? { ...x, priceUsd: numOrNull(e.target.value) } : x)))
                                        }
                                      />
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive"
                                      onClick={() => updateChoices(idx, (c) => c.filter((_, i) => i !== cIdx))}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Live preview of what an order would cost with everything enabled. */}
              {(editingProduct.options || []).length > 0 && (
                <div className="mt-3 rounded-lg bg-muted/50 border px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="font-medium">Live preview:</span>
                  <span className="flex items-center gap-1">
                    qty
                    <Input
                      className="h-6 w-20 text-xs inline-block"
                      type="number"
                      value={previewQty}
                      onChange={(e) => setPreviewQty(parseInt(e.target.value) || 0)}
                    />
                  </span>
                  <span>base ${preview.baseUnit.toFixed(3)}/unit{preview.tierUsed ? " (tier)" : ""}</span>
                  <span>+ options ${preview.perUnitExtras.toFixed(3)}/unit</span>
                  <span>+ one-time ${preview.oneTime.toFixed(2)}</span>
                  <span className="font-semibold">≈ ${preview.allIn.toFixed(2)} with every option on</span>
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Quantity Pricing Tiers</h4>
                <Button type="button" variant="outline" size="sm" onClick={addTier}>
                  <Plus className="h-4 w-4 mr-1" />Add Tier
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">If tiers are set, the unit price is determined by which tier the order quantity falls into.</p>
              {(editingProduct.pricingTiers || []).map((tier, idx) => (
                <Card key={idx} className="mb-2">
                  <CardContent className="pt-3 pb-3">
                    <div className="grid grid-cols-6 gap-2 items-end">
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
                      <div className="space-y-1">
                        <Label className="text-xs">£/unit</Label>
                        <Input type="number" step="0.001" value={tier.pricePerUnitGbp ?? ""} onChange={e => updateTier(idx, "pricePerUnitGbp", e.target.value)} />
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeTier(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {(editingProduct.pricingTiers || []).length === 0 && (
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
