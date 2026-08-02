import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Tag, Percent, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import EupLayout from "@/components/EupLayout";
import {
  getEupBuyers,
  getEupPrices,
  getWholesaleInbound,
  getWholesaleDiscounts,
  upsertWholesaleDiscount,
  deleteWholesaleDiscount,
  getWholesaleOffers,
  createWholesaleOffer,
  updateWholesaleOffer,
  deleteWholesaleOffer,
  type EupBuyer,
  type EupPrice,
  type WholesaleOrder,
  type WholesalerDiscount,
  type WholesalerOffer,
} from "@/lib/api";
import { money2 } from "@/lib/wholesale-format";

/**
 * EUP's book of business: the suppliers that buy from it, what each has been
 * priced for, and what they have spent.
 */
export default function EupSuppliers() {
  const [loading, setLoading] = useState(true);
  const [buyers, setBuyers] = useState<EupBuyer[]>([]);
  const [prices, setPrices] = useState<EupPrice[]>([]);
  const [orders, setOrders] = useState<WholesaleOrder[]>([]);
  const [discounts, setDiscounts] = useState<WholesalerDiscount[]>([]);
  const [offers, setOffers] = useState<WholesalerOffer[]>([]);

  const load = async () => {
    try {
      const [b, p, o, d, of] = await Promise.all([
        getEupBuyers(),
        getEupPrices(),
        getWholesaleInbound().catch(() => []),
        getWholesaleDiscounts().catch(() => []),
        getWholesaleOffers().catch(() => []),
      ]);
      setBuyers(b);
      setPrices(p);
      setOrders(o);
      setDiscounts(d);
      setOffers(of);
    } catch (e: any) {
      toast.error(e.message || "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const statsFor = (supplierId: string) => {
    const theirs = orders.filter((o) => o.buyer?.id === supplierId);
    const paid = theirs.filter((o) => o.paymentStatus === "paid");
    return {
      orderCount: theirs.length,
      spend: paid.reduce((sum, o) => sum + (o.totalPrice || 0), 0),
      overrides: prices.filter((p) => p.supplierId === supplierId).length,
    };
  };

  return (
    <EupLayout
      title="Your suppliers"
      description="The suppliers who buy from you. They resell to end customers at their own prices."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supplier accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !buyers.length ? (
            <p className="text-sm text-muted-foreground">
              No suppliers are buying from you yet. The platform owner assigns suppliers to an EUP from
              the platform dashboard.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Production</TableHead>
                    <TableHead className="text-right">Price overrides</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Paid to you</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buyers.map((b) => {
                    const s = statsFor(b.id);
                    return (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div className="font-medium">{b.companyName}</div>
                          <div className="text-xs text-muted-foreground">{b.contactEmail}</div>
                        </TableCell>
                        <TableCell>{b.countryCode || b.country || "—"}</TableCell>
                        <TableCell>
                          {b.hasOwnProduction ? (
                            <Badge variant="outline">Own production</Badge>
                          ) : (
                            <Badge className="bg-blue-100 text-blue-800">Buys from you</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {s.overrides || <span className="text-muted-foreground">default</span>}
                        </TableCell>
                        <TableCell className="text-right">{s.orderCount}</TableCell>
                        <TableCell className="text-right font-medium">{money2(s.spend)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-muted">
        <CardContent className="pt-6 flex gap-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            The two sections below are <span className="font-medium">marketing only</span>. What a
            supplier actually pays is the fixed price you set under{" "}
            <span className="font-medium">Price lists</span> — discounts and offers no longer change it.
          </p>
        </CardContent>
      </Card>

      <DiscountsEditor discounts={discounts} onChanged={load} />
      <OffersEditor offers={offers} onChanged={load} />
    </EupLayout>
  );
}

function DiscountsEditor({
  discounts,
  onChanged,
}: {
  discounts: WholesalerDiscount[];
  onChanged: () => void;
}) {
  const defaultRow = discounts.find((d) => !d.supplierId);
  const [percent, setPercent] = useState(defaultRow ? String(defaultRow.percent) : "");

  const saveDefault = async () => {
    try {
      await upsertWholesaleDiscount({ supplierId: null, percent: Number(percent) || 0 });
      toast.success("Advertised discount saved");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Percent className="h-4 w-4 text-muted-foreground" /> Advertised discount
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <Label className="text-xs">Headline % shown to suppliers</Label>
            <Input
              className="w-32"
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="0"
            />
          </div>
          <Button size="sm" variant="secondary" onClick={saveDefault}>
            Save
          </Button>
          {defaultRow ? (
            <span className="text-sm text-muted-foreground">Current: {defaultRow.percent}%</span>
          ) : null}
        </div>
        {discounts.filter((d) => d.supplierId).length ? (
          <div className="space-y-1">
            {discounts
              .filter((d) => d.supplierId)
              .map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{d.supplier?.companyName || d.supplierId}</span>
                  <span>{d.percent}%</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={async () => {
                      await deleteWholesaleDiscount(d.id);
                      onChanged();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OffersEditor({ offers, onChanged }: { offers: WholesalerOffer[]; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");

  const add = async () => {
    if (!title.trim()) {
      toast.error("Offer needs a title");
      return;
    }
    try {
      await createWholesaleOffer({
        title: title.trim(),
        description: description.trim() || undefined,
        discountPercent: discountPercent ? Number(discountPercent) : undefined,
      });
      setTitle("");
      setDescription("");
      setDiscountPercent("");
      toast.success("Offer added");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to add offer");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" /> Promotional banners
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto] items-end">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Summer bulk deal" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <Label className="text-xs">Headline %</Label>
            <Input
              inputMode="decimal"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
            />
          </div>
          <Button size="sm" variant="secondary" onClick={add}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
        {offers.length ? (
          <div className="space-y-1">
            {offers.map((o) => (
              <div key={o.id} className="flex items-center gap-2 text-sm rounded border p-2">
                <div className="flex-1">
                  <span className="font-medium">{o.title}</span>
                  {o.discountPercent ? (
                    <Badge className="ml-2 bg-amber-600">{o.discountPercent}%</Badge>
                  ) : null}
                  {o.description ? (
                    <div className="text-xs text-muted-foreground">{o.description}</div>
                  ) : null}
                </div>
                <Switch
                  checked={o.isActive}
                  onCheckedChange={async (v) => {
                    await updateWholesaleOffer(o.id, { title: o.title, isActive: v });
                    onChanged();
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={async () => {
                    await deleteWholesaleOffer(o.id);
                    onChanged();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No promotional banners yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
