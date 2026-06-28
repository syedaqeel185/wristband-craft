import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Trash2, ShoppingCart } from "lucide-react";

interface Design {
  id: string;
  designUrl: string;
  wristbandColor: string;
  wristbandType?: string | null;
  customText: string | null;
  textColor: string;
  canvasJson?: string | null;
  metaJson?: string | null;
  createdAt: string;
}

const MyDesigns = () => {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDesigns();
  }, []);

  const fetchDesigns = async () => {
    try {
      const data = await apiFetch("/designs/mine");
      setDesigns(data || []);
    } catch (error) {
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/designs/${id}`, { method: "DELETE" });
      toast.success("Design deleted");
      setDesigns(designs.filter((d) => d.id !== id));
    } catch {
      toast.error("Failed to delete design");
    }
  };

  const handleOrder = (design: Design) => {
    navigate("/design-studio", {
      state: {
        editDesign: {
          // Prefer the full snapshot; fall back to basic fields for legacy designs.
          metaJson: design.metaJson || undefined,
          canvasJson: design.canvasJson || undefined,
          orderDetails: design.metaJson
            ? undefined
            : {
                wristband_color: design.wristbandColor,
                wristband_type: design.wristbandType || "tyvek",
                quantity: 1000,
                print_type: "none",
                has_trademark: !!design.customText,
                trademark_text: design.customText || "",
                trademark_text_color: design.textColor === "#FFFFFF" ? "white" : "black",
                has_qr_code: false,
                has_print: false,
              },
          designUrl: design.designUrl,
          designId: design.id,
        },
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            My Designs
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading designs...</p>
          </div>
        ) : designs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xl text-muted-foreground mb-6">No designs yet</p>
            <Button variant="hero" onClick={() => navigate("/design-studio")}>
              Create Your First Design
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {designs.map((design) => (
              <Card key={design.id} className="overflow-hidden hover:shadow-xl transition-shadow">
                <CardContent className="p-0">
                  <img
                    src={design.designUrl}
                    alt="Wristband design"
                    className="w-full h-48 object-cover"
                  />
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-6 h-6 rounded-full border-2"
                        style={{ backgroundColor: design.wristbandColor }}
                      />
                      <span className="text-sm text-muted-foreground">
                        {design.customText || "No text"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(design.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="flex gap-2 p-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleDelete(design.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                  <Button
                    variant="hero"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleOrder(design)}
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Order
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MyDesigns;
