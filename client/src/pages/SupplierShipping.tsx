import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMyShipping,
  createShipping,
  updateShipping,
  deleteShipping,
  type ShippingRate,
  type ShippingRateTier,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Save, Edit2, Truck, Star } from "lucide-react";

interface EditableRate {
  id?: string;
  courier: string;
  label: string;
  freeOverQty: number | null;
  estMinDays: number | null;
  estMaxDays: number | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  tiers: ShippingRateTier[];
}

const EMPTY_TIER: ShippingRateTier = { minQuantity: 1, maxQuantity: null, priceEur: 0, priceUsd: null, priceGbp: null };

const EMPTY_RATE: EditableRate = {
  courier: "",
  label: "",
  freeOverQty: null,
  estMinDays: null,
  estMaxDays: null,
  isActive: true,
  isDefault: false,
  sortOrder: 0,
  tiers: [{ ...EMPTY_TIER }],
};

const SupplierShipping = () => {
  const navigate = useNavigate();
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EditableRate>(EMPTY_RATE);
  const [isEdit, setIsEdit] = useState(false);

  useEffect(() => {
    fetchRates();
  }, []);

  const fetchRates = async () => {
    try {
      setLoading(true);
      setRates(await getMyShipping());
    } catch {
      toast.error("Failed to load delivery options");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing({ ...EMPTY_RATE, tiers: [{ ...EMPTY_TIER }], isDefault: rates.length === 0 });
    setIsEdit(false);
    setDialogOpen(true);
  };

  const openEdit = (r: ShippingRate) => {
    setEditing({
      id: r.id,
      courier: r.courier,
      label: r.label || "",
      freeOverQty: r.freeOverQty ?? null,
      estMinDays: r.estMinDays ?? null,
      estMaxDays: r.estMaxDays ?? null,
      isActive: r.isActive,
      isDefault: r.isDefault,
      sortOrder: r.sortOrder,
      tiers: r.tiers.length ? r.tiers : [{ ...EMPTY_TIER }],
    });
    setIsEdit(true);
    setDialogOpen(true);
  };

  const setField = (field: keyof EditableRate, value: any) => setEditing((p) => ({ ...p, [field]: value }));

  const addTier = () => setEditing((p) => ({ ...p, tiers: [...p.tiers, { ...EMPTY_TIER }] }));
  const removeTier = (idx: number) => setEditing((p) => ({ ...p, tiers: p.tiers.filter((_, i) => i !== idx) }));
  const updateTier = (idx: number, field: keyof ShippingRateTier, raw: string) => {
    const value = raw === "" ? null : Number(raw);
    setEditing((p) => ({ ...p, tiers: p.tiers.map((t, i) => (i === idx ? { ...t, [field]: value } : t)) }));
  };

  const handleSave = async () => {
    if (!editing.courier.trim()) {
      toast.error("Courier name is required");
      return;
    }
    if (editing.tiers.length === 0 || editing.tiers.some((t) => t.priceEur == null || t.priceEur < 0)) {
      toast.error("Each tier needs a valid EUR price");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        courier: editing.courier,
        label: editing.label || null,
        freeOverQty: editing.freeOverQty,
        estMinDays: editing.estMinDays,
        estMaxDays: editing.estMaxDays,
        isActive: editing.isActive,
        isDefault: editing.isDefault,
        sortOrder: editing.sortOrder,
        tiers: editing.tiers.map((t) => ({
          minQuantity: Number(t.minQuantity) || 1,
          maxQuantity: t.maxQuantity == null ? null : Number(t.maxQuantity),
          priceEur: Number(t.priceEur) || 0,
          priceUsd: t.priceUsd == null ? null : Number(t.priceUsd),
          priceGbp: t.priceGbp == null ? null : Number(t.priceGbp),
        })),
      };
      if (isEdit && editing.id) {
        await updateShipping(editing.id, payload);
        toast.success("Courier updated");
      } else {
        await createShipping(payload);
        toast.success("Courier added");
      }
      setDialogOpen(false);
      fetchRates();
    } catch (e: any) {
      toast.error(e.message || "Failed to save courier");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this courier option?")) return;
    try {
      await deleteShipping(id);
      toast.success("Courier deleted");
      fetchRates();
    } catch {
      toast.error("Failed to delete courier");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <header className="max-w-5xl mx-auto border-b bg-card/50 backdrop-blur-sm p-4 flex items-center justify-between rounded-t-xl mb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/supplier")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">Delivery & Couriers</h1>
        </div>
        <Button onClick={openCreate} className="flex gap-2">
          <Plus className="h-4 w-4" /> Add Courier
        </Button>
      </header>

      <main className="max-w-5xl mx-auto space-y-4">
        <Card className="bg-secondary/10">
          <CardContent className="pt-4 text-sm text-muted-foreground">
            Set your own couriers and delivery rates. Rates are tiered by total order quantity — the customer is charged
            your default courier's rate at checkout. If you don't configure any courier, a standard delivery rate applies.
          </CardContent>
        </Card>

        {rates.length === 0 ? (
          <Card className="p-8 text-center">
            <Truck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">No delivery options yet. Add your first courier and its rates.</p>
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Your First Courier</Button>
          </Card>
        ) : (
          rates.map((r) => (
            <Card key={r.id} className="shadow">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-lg">{r.courier}</h3>
                      {r.label && <span className="text-sm text-muted-foreground">— {r.label}</span>}
                      {r.isDefault && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                          <Star className="h-3 w-3 fill-current" /> Default
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {r.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                      {(r.estMinDays != null || r.estMaxDays != null) && (
                        <span>Est. {r.estMinDays ?? "?"}–{r.estMaxDays ?? "?"} days</span>
                      )}
                      {r.freeOverQty != null && <span>Free over {r.freeOverQty} pcs</span>}
                      <span>
                        {r.tiers.length} tier{r.tiers.length !== 1 ? "s" : ""}
                        {r.tiers.length > 0 && ` (from €${Math.min(...r.tiers.map((t) => t.priceEur)).toFixed(2)})`}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                      {[...r.tiers]
                        .sort((a, b) => a.minQuantity - b.minQuantity)
                        .map((t, i) => (
                          <div key={t.id || i}>
                            {t.minQuantity}
                            {t.maxQuantity ? `–${t.maxQuantity}` : "+"} pcs → €{t.priceEur.toFixed(2)}
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(r.id)}>
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
            <DialogTitle>{isEdit ? "Edit Courier" : "New Courier"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Courier *</Label>
                <Input value={editing.courier} onChange={(e) => setField("courier", e.target.value)} placeholder="e.g. DHL" />
              </div>
              <div className="space-y-1">
                <Label>Service label (optional)</Label>
                <Input value={editing.label} onChange={(e) => setField("label", e.target.value)} placeholder="e.g. Express" />
              </div>
              <div className="space-y-1">
                <Label>Est. min days</Label>
                <Input type="number" value={editing.estMinDays ?? ""} onChange={(e) => setField("estMinDays", e.target.value === "" ? null : Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>Est. max days</Label>
                <Input type="number" value={editing.estMaxDays ?? ""} onChange={(e) => setField("estMaxDays", e.target.value === "" ? null : Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>Free delivery over (qty)</Label>
                <Input type="number" value={editing.freeOverQty ?? ""} onChange={(e) => setField("freeOverQty", e.target.value === "" ? null : Number(e.target.value))} placeholder="none" />
              </div>
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={editing.isActive} onCheckedChange={(v) => setField("isActive", v)} /> Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={editing.isDefault} onCheckedChange={(v) => setField("isDefault", v)} /> Default courier
              </label>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">Rate Tiers (by total quantity)</h4>
                <Button type="button" variant="outline" size="sm" onClick={addTier}>
                  <Plus className="h-4 w-4 mr-1" /> Add Tier
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                A flat rate = one tier with min 1 and no max. EUR is required; USD/GBP fall back to the EUR price.
              </p>
              {editing.tiers.map((tier, idx) => (
                <Card key={idx} className="mb-2">
                  <CardContent className="pt-3 pb-3">
                    <div className="grid grid-cols-5 gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Min Qty</Label>
                        <Input type="number" value={tier.minQuantity} onChange={(e) => updateTier(idx, "minQuantity", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max Qty</Label>
                        <Input type="number" value={tier.maxQuantity ?? ""} onChange={(e) => updateTier(idx, "maxQuantity", e.target.value)} placeholder="∞" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">€ price</Label>
                        <Input type="number" step="0.01" value={tier.priceEur ?? ""} onChange={(e) => updateTier(idx, "priceEur", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">$ price</Label>
                        <Input type="number" step="0.01" value={tier.priceUsd ?? ""} onChange={(e) => updateTier(idx, "priceUsd", e.target.value)} placeholder="—" />
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeTier(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="flex gap-2">
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Courier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupplierShipping;
