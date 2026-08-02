import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Package, ArrowRight } from "lucide-react";

/**
 * Pricing now lives on each product (base prices, quantity tiers, and the
 * customization option builder) so there is a single source of truth that the
 * storefront, Design Studio, cart and checkout all read from.
 *
 * This page previously edited a parallel per-type price table that the
 * checkout engine never used — a recipe for inconsistent pricing and the
 * "saved tiers disappear after re-login" bug. It now points suppliers to the
 * product editor instead.
 */
const SupplierPricing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <header className="max-w-3xl mx-auto border-b bg-card/50 backdrop-blur-sm p-4 flex items-center gap-4 rounded-t-xl mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/supplier")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">Pricing</h1>
      </header>

      <main className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Pricing has moved into your products
            </CardTitle>
            <CardDescription>
              Every price a customer sees — base price, quantity tiers, and customization add-ons — is
              now configured on the product itself, so the storefront, Design Studio, cart and checkout
              always show the same numbers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              <li>Set base prices in USD, EUR and GBP per product.</li>
              <li>Add quantity pricing tiers (volume discounts) per product.</li>
              <li>Build your own customization options — rename, reprice, reorder, disable, or add unlimited custom add-ons.</li>
            </ul>
            <Button onClick={() => navigate("/supplier/products")}>
              Manage products &amp; pricing
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default SupplierPricing;
