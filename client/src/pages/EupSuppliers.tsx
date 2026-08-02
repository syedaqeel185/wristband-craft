import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Tag, Percent, Info, UserPlus } from "lucide-react";
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
  createEupBuyer,
  setEupBuyerStatus,
  setEupBuyerProduction,
  deleteEupBuyer,
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

  /** Run a mutation, surface the outcome, refresh. */
  const act = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast.success(success);
      load();
    } catch (e: any) {
      toast.error(e.message || "Update failed");
    }
  };

  /**
   * Deleting is refused server-side once a supplier has any order history, so
   * surface that as guidance rather than letting them discover it as an error.
   */
  const remove = async (b: EupBuyer) => {
    const theirs = orders.filter((o) => o.buyer?.id === b.id).length;
    const warning = theirs
      ? `${b.companyName} has ${theirs} order(s) with you. Deleting will be refused — suspend them instead. Try anyway?`
      : `Delete ${b.companyName}? This removes their account and cannot be undone.`;
    if (!window.confirm(warning)) return;
    try {
      await deleteEupBuyer(b.id);
      toast.success(`${b.companyName} removed`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Could not delete supplier");
    }
  };

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
      <InviteSupplier onCreated={load} />

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
              No suppliers are buying from you yet. Add one above, or ask the platform owner to assign
              an existing supplier to you.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Buys from you</TableHead>
                    <TableHead className="text-right">Overrides</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Paid to you</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Remove</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buyers.map((b) => {
                    const s = statsFor(b.id);
                    return (
                      <TableRow key={b.id} className={b.status === "SUSPENDED" ? "opacity-60" : ""}>
                        <TableCell>
                          <div className="font-medium">{b.companyName}</div>
                          <div className="text-xs text-muted-foreground">{b.contactEmail}</div>
                        </TableCell>
                        <TableCell>{b.countryCode || b.country || "—"}</TableCell>
                        <TableCell>
                          {/* Off = they manufacture in-house and never order from EUP. */}
                          <Switch
                            checked={!b.hasOwnProduction}
                            onCheckedChange={(v) =>
                              act(
                                () => setEupBuyerProduction(b.id, !v),
                                v ? "Now buys stock from you" : "Marked as having own production",
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {s.overrides || <span className="text-muted-foreground">default</span>}
                        </TableCell>
                        <TableCell className="text-right">{s.orderCount}</TableCell>
                        <TableCell className="text-right font-medium">{money2(s.spend)}</TableCell>
                        <TableCell>
                          <Switch
                            checked={b.status !== "SUSPENDED"}
                            onCheckedChange={(v) =>
                              act(
                                () => setEupBuyerStatus(b.id, v ? "ACTIVE" : "SUSPENDED"),
                                v ? "Reactivated" : "Suspended",
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600"
                            onClick={() => remove(b)}
                            title={
                              s.orderCount
                                ? "Has order history — suspend instead"
                                : "Delete this supplier"
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
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

/**
 * Onboard a supplier into EUP's book. The server generates the password — EUP
 * never picks it — and returns it once. There is no way to read it back, so it
 * stays on screen until dismissed.
 */
function InviteSupplier({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [buysFromYou, setBuysFromYou] = useState(true);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ company: string; email: string; tempPassword: string } | null>(
    null,
  );

  const submit = async () => {
    if (!email.trim() || !companyName.trim()) {
      toast.error("Company name and email are required");
      return;
    }
    setSaving(true);
    try {
      const res = await createEupBuyer({
        email: email.trim(),
        companyName: companyName.trim(),
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        countryCode: countryCode.trim() || undefined,
        hasOwnProduction: !buysFromYou,
      });
      setCreated({ company: res.supplier.companyName, email: email.trim(), tempPassword: res.tempPassword });
      setEmail("");
      setCompanyName("");
      setContactName("");
      setContactPhone("");
      setCountryCode("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message || "Could not create supplier");
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <Card className="border-green-300 bg-green-50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-green-900">
            <UserPlus className="h-4 w-4" /> {created.company} added
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-green-900">
            Send them these sign-in details. <span className="font-medium">This password is shown
            once</span> — it is stored hashed and cannot be retrieved again.
          </p>
          <div className="rounded border bg-background p-3 font-mono text-sm space-y-1">
            <div>{created.email}</div>
            <div>{created.tempPassword}</div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(`${created.email} / ${created.tempPassword}`);
                toast.success("Copied");
              }}
            >
              Copy
            </Button>
            <Button size="sm" onClick={() => setCreated(null)}>
              Done
            </Button>
          </div>
          <p className="text-xs text-green-800">
            Remind them to change it after signing in. Next step: give them a price under{" "}
            <span className="font-medium">Price lists</span>, or they will not be able to order.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!open) {
    return (
      <div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Add a supplier
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" /> Add a supplier
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">Company name</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Funky Gorillas AS"
            />
          </div>
          <div>
            <Label className="text-xs">Sign-in email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="post@funkygorillas.no"
            />
          </div>
          <div>
            <Label className="text-xs">Contact name (optional)</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Phone (optional)</Label>
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Country (ISO-2, optional)</Label>
            <Input
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              placeholder="NO"
              maxLength={2}
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs">Buys stock from you</Label>
              <p className="text-xs text-muted-foreground">
                Off if they manufacture in-house.
              </p>
            </div>
            <Switch checked={buysFromYou} onCheckedChange={setBuysFromYou} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Create account
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
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
