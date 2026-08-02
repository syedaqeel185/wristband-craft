import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Info } from "lucide-react";
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
  getEupBuyers,
  getEupFreight,
  createEupFreight,
  updateEupFreight,
  deleteEupFreight,
  type EupBuyer,
  type EupFreightRate,
  type FreightMode,
} from "@/lib/api";
import { money2 } from "@/lib/wholesale-format";

const ALL_SUPPLIERS = "__all__";

const MODE_LABEL: Record<FreightMode, string> = {
  ANY: "Any delivery",
  SHIP_TO_SUPPLIER: "Ship to supplier",
  DROP_SHIP: "Drop-ship to customer",
};

/**
 * Freight EUP charges suppliers, always billed on top of the goods price.
 *
 * Rates are matched most-specific-first: a rule naming both a supplier and a
 * destination country beats a supplier-only rule, which beats a country-only
 * rule, which beats the catch-all. No matching rule means no freight charge.
 */
export default function EupFreight() {
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<EupFreightRate[]>([]);
  const [buyers, setBuyers] = useState<EupBuyer[]>([]);

  const load = async () => {
    try {
      const [r, b] = await Promise.all([getEupFreight(), getEupBuyers()]);
      setRates(r);
      setBuyers(b);
    } catch (e: any) {
      toast.error(e.message || "Failed to load freight rates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (r: EupFreightRate) => {
    try {
      await deleteEupFreight(r.id);
      toast.success("Freight rate removed");
      load();
    } catch (e: any) {
      toast.error(e.message || "Could not remove rate");
    }
  };

  const toggle = async (r: EupFreightRate, isActive: boolean) => {
    try {
      await updateEupFreight(r.id, { ...r, isActive });
      load();
    } catch (e: any) {
      toast.error(e.message || "Could not update rate");
    }
  };

  return (
    <EupLayout
      title="Freight"
      description="Charged on top of the price per 1000 pcs — never folded into it, so suppliers always see both."
    >
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6 flex gap-3 text-sm">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p>
            The most specific matching rule wins: supplier + country beats supplier alone, which beats
            country alone, which beats the catch-all. If nothing matches, no freight is charged.
          </p>
        </CardContent>
      </Card>

      <NewRateForm buyers={buyers} onCreated={load} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current rates</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !rates.length ? (
            <p className="text-sm text-muted-foreground">
              No freight rates yet — suppliers are currently charged goods only.
            </p>
          ) : (
            <div className="space-y-2">
              {rates.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded border p-3 text-sm">
                  <div className="flex-1 min-w-[14rem] space-y-1">
                    <div className="font-medium">{r.label || "Freight"}</div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">
                        {r.supplier?.companyName || "All suppliers"}
                      </Badge>
                      <Badge variant="outline">{r.countryCode || "Any destination"}</Badge>
                      <Badge variant="outline">{MODE_LABEL[r.fulfilmentMode]}</Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{money2(r.pricePer1000Eur)} / 1000 pcs</div>
                    <div className="text-xs text-muted-foreground">
                      {r.minChargeEur ? `min ${money2(r.minChargeEur)}` : "no minimum"}
                      {r.freeOverQty ? ` · free over ${r.freeOverQty}` : ""}
                      {r.estMinDays != null || r.estMaxDays != null
                        ? ` · ${r.estMinDays ?? "?"}–${r.estMaxDays ?? "?"} days`
                        : ""}
                    </div>
                  </div>
                  <Switch checked={r.isActive} onCheckedChange={(v) => toggle(r, v)} />
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(r)}>
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

function NewRateForm({ buyers, onCreated }: { buyers: EupBuyer[]; onCreated: () => void }) {
  const [label, setLabel] = useState("");
  const [supplierId, setSupplierId] = useState(ALL_SUPPLIERS);
  const [countryCode, setCountryCode] = useState("");
  const [mode, setMode] = useState<FreightMode>("ANY");
  const [price, setPrice] = useState("");
  const [minCharge, setMinCharge] = useState("");
  const [freeOverQty, setFreeOverQty] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a freight price per 1000 pcs");
      return;
    }
    setSaving(true);
    try {
      await createEupFreight({
        label: label.trim() || undefined,
        supplierId: supplierId === ALL_SUPPLIERS ? null : supplierId,
        countryCode: countryCode.trim() ? countryCode.trim().toUpperCase() : null,
        fulfilmentMode: mode,
        pricePer1000Eur: amount,
        minChargeEur: minCharge.trim() ? Number(minCharge) : null,
        freeOverQty: freeOverQty.trim() ? Number(freeOverQty) : null,
      });
      setLabel("");
      setCountryCode("");
      setPrice("");
      setMinCharge("");
      setFreeOverQty("");
      toast.success("Freight rate added");
      onCreated();
    } catch (e: any) {
      toast.error(e.message || "Could not add rate");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add a freight rate</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <div>
            <Label className="text-xs">Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. EU standard" />
          </div>
          <div>
            <Label className="text-xs">Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SUPPLIERS}>All suppliers</SelectItem>
                {buyers.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Destination country</Label>
            <Input
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              placeholder="Any (e.g. NO, SE)"
              maxLength={2}
            />
          </div>
          <div>
            <Label className="text-xs">Applies to</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as FreightMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABEL) as FreightMode[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODE_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Price per 1000 pcs (EUR)</Label>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 12" />
          </div>
          <div>
            <Label className="text-xs">Minimum charge (EUR)</Label>
            <Input
              inputMode="decimal"
              value={minCharge}
              onChange={(e) => setMinCharge(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label className="text-xs">Free over qty</Label>
            <Input
              inputMode="numeric"
              value={freeOverQty}
              onChange={(e) => setFreeOverQty(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={add} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add rate
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
