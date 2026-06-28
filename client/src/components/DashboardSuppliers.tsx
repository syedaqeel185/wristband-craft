import { useEffect, useState } from "react";
import { type DirectorySupplier, getSupplierDirectory, getRecentSuppliers } from "@/lib/api";
import { SupplierGrid } from "@/components/SuppliersShowcase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

/** Suppliers section for the customer dashboard, split into Recently / All. */
export const DashboardSuppliers = () => {
  const [all, setAll] = useState<DirectorySupplier[]>([]);
  const [recent, setRecent] = useState<DirectorySupplier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getSupplierDirectory().catch(() => []),
      getRecentSuppliers().catch(() => []),
    ])
      .then(([a, r]) => {
        setAll(a);
        setRecent(r);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (all.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto mt-12">
      <h3 className="text-2xl font-bold mb-1">Choose a Supplier</h3>
      <p className="text-muted-foreground mb-4">Pick a supplier to start designing — your order goes straight to them.</p>
      <Tabs defaultValue={recent.length ? "recent" : "all"}>
        <TabsList className="mb-4">
          <TabsTrigger value="recent">Recently ordered{recent.length ? ` (${recent.length})` : ""}</TabsTrigger>
          <TabsTrigger value="all">All suppliers ({all.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="recent">
          <SupplierGrid
            suppliers={recent}
            emptyText="You haven't ordered from any supplier yet — browse all suppliers to get started."
          />
        </TabsContent>
        <TabsContent value="all">
          <SupplierGrid suppliers={all} />
        </TabsContent>
      </Tabs>
    </section>
  );
};
