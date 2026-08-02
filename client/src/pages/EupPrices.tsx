import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  upsertEupPrice,
  deleteEupPrice,
  getMyProducts,
  type EupBuyer,
  type EupPrice,
  type MyProduct,
} from "@/lib/api";
import { money2 } from "@/lib/wholesale-format";

/** Key for the default (all-suppliers) column. */
const DEFAULT_COL = "__default__";

/**
 * EUP's price grid: rows are EUP's products, columns are the suppliers that buy
 * from it, plus a default column that applies to everyone without an override.
 *
 * Every price is entered here — nothing is derived from a supplier's own retail
 * list and nothing is hardcoded. A blank cell means that supplier cannot order
 * that product at all, which is deliberate: an unpriced product should fail
 * loudly rather than fall back to a number nobody chose.
 */
export default function EupPrices() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<MyProduct[]>([]);
  const [buyers, setBuyers] = useState<EupBuyer[]>([]);
  const [prices, setPrices] = useState<EupPrice[]>([]);

  const load = async () => {
    try {
      const [p, b, pr] = await Promise.all([
        getMyProducts(),
        getEupBuyers(),
        getEupPrices(),
      ]);
      setProducts(p.filter((x) => x.isActive));
      setBuyers(b);
      setPrices(pr);
    } catch (e: any) {
      toast.error(e.message || "Failed to load price lists");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /** productId -> (supplierId | DEFAULT_COL) -> price row */
  const byCell = useMemo(() => {
    const map = new Map<string, Map<string, EupPrice>>();
    for (const row of prices) {
      const col = row.supplierId ?? DEFAULT_COL;
      if (!map.has(row.productId)) map.set(row.productId, new Map());
      map.get(row.productId)!.set(col, row);
    }
    return map;
  }, [prices]);

  const save = async (productId: string, col: string, value: string) => {
    const trimmed = value.trim();
    const existing = byCell.get(productId)?.get(col);

    // Clearing a cell removes the price; for an override that falls back to the
    // default column, for the default column it makes the product unorderable.
    if (!trimmed) {
      if (!existing) return;
      try {
        await deleteEupPrice(existing.id);
        toast.success("Price removed");
        load();
      } catch (e: any) {
        toast.error(e.message || "Could not remove price");
      }
      return;
    }

    const amount = Number(trimmed);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a price per 1000 pcs, e.g. 33");
      return;
    }
    if (existing && existing.pricePer1000Eur === amount) return;

    try {
      await upsertEupPrice({
        productId,
        supplierId: col === DEFAULT_COL ? null : col,
        pricePer1000Eur: amount,
      });
      toast.success("Price saved");
      load();
    } catch (e: any) {
      toast.error(e.message || "Could not save price");
    }
  };

  const unpriced = useMemo(
    () => products.filter((p) => !byCell.get(p.id)?.get(DEFAULT_COL)),
    [products, byCell],
  );

  if (loading) {
    return (
      <EupLayout title="Price lists">
        <div className="py-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </EupLayout>
    );
  }

  return (
    <EupLayout
      title="Price lists"
      description="What each supplier pays you, per 1000 pcs. Freight is charged separately under Freight."
    >
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6 flex gap-3 text-sm">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>
              Set a <span className="font-medium">Default</span> price to make a product available to
              every supplier, then override it per supplier where you have agreed a different rate.
            </p>
            <p className="text-muted-foreground">
              A blank cell with no default means that supplier cannot order the product. Clear a cell
              to remove the price.
            </p>
          </div>
        </CardContent>
      </Card>

      {!products.length ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You have no products yet. Add them to your catalogue first, then price them here.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Price per 1000 pcs (EUR)
              {unpriced.length ? (
                <Badge variant="outline" className="ml-2 text-amber-700 border-amber-300">
                  {unpriced.length} product{unpriced.length > 1 ? "s" : ""} without a default
                </Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[14rem]">Product</TableHead>
                    <TableHead className="min-w-[9rem]">Default</TableHead>
                    {buyers.map((b) => (
                      <TableHead key={b.id} className="min-w-[9rem]">
                        <div className="font-medium">{b.companyName}</div>
                        <div className="text-xs font-normal text-muted-foreground">
                          {b.countryCode || b.country || "—"}
                          {!b.hasOwnProduction ? " · no production" : ""}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => {
                    const row = byCell.get(p.id);
                    const hasDefault = !!row?.get(DEFAULT_COL);
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">
                            MOQ {p.minOrderQuantity}
                            {!hasDefault ? " · no default price" : ""}
                          </div>
                        </TableCell>
                        <TableCell>
                          <PriceCell
                            value={row?.get(DEFAULT_COL)?.pricePer1000Eur}
                            onSave={(v) => save(p.id, DEFAULT_COL, v)}
                          />
                        </TableCell>
                        {buyers.map((b) => {
                          const override = row?.get(b.id);
                          const fallback = row?.get(DEFAULT_COL);
                          return (
                            <TableCell key={b.id}>
                              <PriceCell
                                value={override?.pricePer1000Eur}
                                placeholder={
                                  fallback ? money2(fallback.pricePer1000Eur) : "not orderable"
                                }
                                muted={!override}
                                onSave={(v) => save(p.id, b.id, v)}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {!buyers.length ? (
              <p className="text-sm text-muted-foreground mt-4">
                No suppliers are assigned to you yet. Set a default price so any supplier who joins can
                order straight away.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {prices.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-supplier overrides</CardTitle>
          </CardHeader>
          <CardContent>
            {prices.filter((p) => p.supplierId).length ? (
              <div className="space-y-1">
                {prices
                  .filter((p) => p.supplierId)
                  .map((p) => (
                    <div key={p.id} className="flex items-center gap-3 text-sm rounded border p-2">
                      <span className="flex-1">
                        <span className="font-medium">{p.supplier?.companyName || p.supplierId}</span>
                        <span className="text-muted-foreground"> · {p.product?.name}</span>
                      </span>
                      <span className="font-medium">{money2(p.pricePer1000Eur)} / 1000</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        onClick={async () => {
                          try {
                            await deleteEupPrice(p.id);
                            toast.success("Override removed");
                            load();
                          } catch (e: any) {
                            toast.error(e.message || "Could not remove override");
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No per-supplier overrides — every supplier pays the default price.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </EupLayout>
  );
}

/** A price cell that commits on blur or Enter, and reverts on Escape. */
function PriceCell({
  value,
  placeholder,
  muted,
  onSave,
}: {
  value?: number | null;
  placeholder?: string;
  muted?: boolean;
  onSave: (value: string) => void;
}) {
  const asText = value == null ? "" : String(value);
  const [draft, setDraft] = useState(asText);

  // Re-sync when the saved value changes underneath (e.g. after a reload).
  useEffect(() => setDraft(asText), [asText]);

  return (
    <Input
      className={`h-9 w-28 ${muted ? "text-muted-foreground" : ""}`}
      inputMode="decimal"
      value={draft}
      placeholder={placeholder ?? "—"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== asText) onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(asText);
      }}
    />
  );
}
