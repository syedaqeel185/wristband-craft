import { useEffect, useState } from "react";
import { getSupplierDirectory } from "@/lib/api";
import { SupplierDirectory } from "@/components/SupplierDirectory";
import { Loader2 } from "lucide-react";

// Re-export the grid from its own module so existing imports keep working.
export { SupplierGrid } from "@/components/SupplierGrid";

/** Homepage section: heading + country-aware supplier directory. */
export const SuppliersShowcase = () => {
  const [hasSuppliers, setHasSuppliers] = useState<boolean | null>(null);

  useEffect(() => {
    getSupplierDirectory()
      .then((s) => setHasSuppliers(s.length > 0))
      .catch(() => setHasSuppliers(false));
  }, []);

  if (hasSuppliers === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!hasSuppliers) return null;

  return (
    <section className="container mx-auto px-4 py-20">
      <h3 className="text-3xl md:text-4xl font-bold text-center mb-2">Find your supplier</h3>
      <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
        Pick a trusted supplier in your country and get started designing your wristbands — see their services and
        ratings, and order directly from the one you choose.
      </p>
      <div className="max-w-6xl mx-auto">
        <SupplierDirectory />
      </div>
    </section>
  );
};
