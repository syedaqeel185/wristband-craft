import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface PricingConfig {
  id?: string;
  wristbandType: string;
  minQuantity: number;
  basePriceUsd: number;
  basePriceEur: number;
  basePriceGbp: number;
  blackPrintExtraUsd: number;
  blackPrintExtraEur: number;
  blackPrintExtraGbp: number;
  fullColorPrintExtraUsd: number;
  fullColorPrintExtraEur: number;
  fullColorPrintExtraGbp: number;
  secureGuestsExtraUsd: number;
  secureGuestsExtraEur: number;
}

const WRISTBAND_TYPES = ["tyvek", "vinyl", "fabric", "silicone"] as const;

const EMPTY_CONFIG: PricingConfig = {
  wristbandType: "tyvek",
  minQuantity: 0,
  basePriceUsd: 0,
  basePriceEur: 0,
  basePriceGbp: 0,
  blackPrintExtraUsd: 0,
  blackPrintExtraEur: 0,
  blackPrintExtraGbp: 0,
  fullColorPrintExtraUsd: 0,
  fullColorPrintExtraEur: 0,
  fullColorPrintExtraGbp: 0,
  secureGuestsExtraUsd: 0,
  secureGuestsExtraEur: 0,
};

// Default used when the supplier adds a brand-new wristband type tab.
const DEFAULT_CONFIG: PricingConfig = EMPTY_CONFIG;

const SupplierPricing = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<PricingConfig[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0);

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      setLoading(true);
      const data = await apiFetch("/suppliers/me/pricing");
      if (data && data.length > 0) {
        setConfigs(data);
        setActiveTabIndex(0);
      } else {
        setConfigs([EMPTY_CONFIG]);
        setActiveTabIndex(0);
      }
    } catch (error) {
      toast.error("Failed to load pricing data");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (index: number, field: keyof PricingConfig, value: string | number) => {
    const newConfigs = [...configs];
    const parsedValue = typeof value === 'string' && field !== 'wristbandType' ? parseFloat(value) || 0 : value;
    newConfigs[index] = { ...newConfigs[index], [field]: parsedValue };
    setConfigs(newConfigs);
  };

  const handleAddNewType = () => {
    const newConfig: PricingConfig = {
      ...EMPTY_CONFIG,
      wristbandType: WRISTBAND_TYPES.find(t => !configs.some(c => c.wristbandType === t)) || "tyvek",
    };
    setConfigs([...configs, newConfig]);
    setActiveTabIndex(configs.length);
  };

  const handleDeleteType = (index: number) => {
    if (configs[index].id) {
      toast.error("Cannot delete saved types. Please contact support to remove pricing tiers.");
      return;
    }
    const newConfigs = configs.filter((_, i) => i !== index);
    setConfigs(newConfigs);
    setActiveTabIndex(Math.max(0, activeTabIndex - 1));
  };

  const handleSave = async () => {
    if (configs.length === 0) {
      toast.error("Please add at least one wristband type");
      return;
    }

    try {
      setSaving(true);
      
      // Save each configuration
      for (const config of configs) {
        await apiFetch("/suppliers/me/pricing", {
          method: "POST",
          body: JSON.stringify(config),
        });
      }
      
      toast.success("Pricing configuration saved successfully");
      fetchPricing();
    } catch (error: any) {
      toast.error(error.message || "Failed to save pricing");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p>Loading pricing data...</p>
      </div>
    );
  }

  const activeConfig = activeTabIndex >= 0 ? configs[activeTabIndex] : null;
  const availableTypes = WRISTBAND_TYPES.filter(
    t => t === activeConfig?.wristbandType || !configs.some(c => c.wristbandType === t)
  );

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <header className="max-w-6xl mx-auto border-b bg-card/50 backdrop-blur-sm p-4 flex items-center gap-4 rounded-t-xl mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          Manage Pricing
        </h1>
      </header>

      <main className="max-w-6xl mx-auto space-y-6">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Wristband Types & Pricing</CardTitle>
            <CardDescription>
              Add different wristband types and set pricing for each one. Customers will see these when placing orders.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Tabs for different wristband types */}
            <div className="flex flex-wrap gap-2 border-b pb-4">
              {configs.map((config, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveTabIndex(idx)}
                  className={`px-4 py-2 rounded-t-lg capitalize transition-colors ${
                    activeTabIndex === idx
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  {config.wristbandType}
                </button>
              ))}
              <button
                onClick={handleAddNewType}
                disabled={configs.length >= WRISTBAND_TYPES.length}
                className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Type
              </button>
            </div>

            {/* Configuration form for active tab */}
            {activeConfig && activeTabIndex >= 0 ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Wristband Type</Label>
                    <Select value={activeConfig.wristbandType} onValueChange={(value) => handleInputChange(activeTabIndex, 'wristbandType', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            <span className="capitalize">{type}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Min Quantity</Label>
                    <Input 
                      type="number" 
                      value={activeConfig.minQuantity} 
                      onChange={(e) => handleInputChange(activeTabIndex, 'minQuantity', e.target.value)} 
                      min="1"
                    />
                  </div>
                </div>

                <h3 className="font-semibold text-lg border-b pb-2 pt-4">Base Prices</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>USD ($)</Label>
                    <Input type="number" step="0.01" value={activeConfig.basePriceUsd} onChange={(e) => handleInputChange(activeTabIndex, 'basePriceUsd', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>EUR (€)</Label>
                    <Input type="number" step="0.01" value={activeConfig.basePriceEur} onChange={(e) => handleInputChange(activeTabIndex, 'basePriceEur', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>GBP (£)</Label>
                    <Input type="number" step="0.01" value={activeConfig.basePriceGbp} onChange={(e) => handleInputChange(activeTabIndex, 'basePriceGbp', e.target.value)} />
                  </div>
                </div>

                <h3 className="font-semibold text-lg border-b pb-2 pt-4">Black Print Extra</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>USD</Label>
                    <Input type="number" step="0.01" value={activeConfig.blackPrintExtraUsd} onChange={(e) => handleInputChange(activeTabIndex, 'blackPrintExtraUsd', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>EUR</Label>
                    <Input type="number" step="0.01" value={activeConfig.blackPrintExtraEur} onChange={(e) => handleInputChange(activeTabIndex, 'blackPrintExtraEur', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>GBP</Label>
                    <Input type="number" step="0.01" value={activeConfig.blackPrintExtraGbp} onChange={(e) => handleInputChange(activeTabIndex, 'blackPrintExtraGbp', e.target.value)} />
                  </div>
                </div>

                <h3 className="font-semibold text-lg border-b pb-2 pt-4">Full Color Print Extra</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>USD</Label>
                    <Input type="number" step="0.01" value={activeConfig.fullColorPrintExtraUsd} onChange={(e) => handleInputChange(activeTabIndex, 'fullColorPrintExtraUsd', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>EUR</Label>
                    <Input type="number" step="0.01" value={activeConfig.fullColorPrintExtraEur} onChange={(e) => handleInputChange(activeTabIndex, 'fullColorPrintExtraEur', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>GBP</Label>
                    <Input type="number" step="0.01" value={activeConfig.fullColorPrintExtraGbp} onChange={(e) => handleInputChange(activeTabIndex, 'fullColorPrintExtraGbp', e.target.value)} />
                  </div>
                </div>

                <h3 className="font-semibold text-lg border-b pb-2 pt-4">Secure Guests Extra (QR)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>USD</Label>
                    <Input type="number" step="0.01" value={activeConfig.secureGuestsExtraUsd} onChange={(e) => handleInputChange(activeTabIndex, 'secureGuestsExtraUsd', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>EUR</Label>
                    <Input type="number" step="0.01" value={activeConfig.secureGuestsExtraEur} onChange={(e) => handleInputChange(activeTabIndex, 'secureGuestsExtraEur', e.target.value)} />
                  </div>
                </div>

                {!activeConfig.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteType(activeTabIndex)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove This Type
                  </Button>
                )}
              </div>
            ) : configs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No pricing configurations yet.</p>
                <Button onClick={handleAddNewType}>Add First Wristband Type</Button>
              </div>
            ) : null}

            <div className="pt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => fetchPricing()}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || configs.length === 0} className="px-8 flex gap-2">
                <Save size={18} />
                {saving ? "Saving..." : "Save Pricing"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default SupplierPricing;
