import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, ImageIcon, FileText, Download, Image as ImageIco, FileType } from "lucide-react";
import {
  type ProductionDesign,
  parseMeta,
  extractLogos,
  extractTexts,
  downloadLogos,
  downloadTexts,
  downloadRemote,
  generateProductionPdf,
} from "@/lib/production";

type DesignRow = ProductionDesign & {
  wristbandType: string;
  visibility?: "full" | "fulfillment" | "platform";
  orders?: { id: string; supplierId?: string | null; status: string; createdAt: string }[];
};

const SupplierDesigns = () => {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState<DesignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!user?.roles?.includes("supplier") && !user?.roles?.includes("admin")) {
          navigate("/");
          return;
        }
        setIsAdmin(user.roles.includes("admin"));
        const data = await apiFetch("/designs/platform");
        setDesigns(data || []);
      } catch {
        toast.error("Could not load designs");
        navigate("/supplier");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const handlePdf = async (d: DesignRow) => {
    setBusyId(d.id);
    try {
      await generateProductionPdf(d);
      toast.success("Production PDF generated");
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setBusyId(null);
    }
  };

  const handleDesignPng = async (d: DesignRow) => {
    if (!d.designUrl) return;
    try {
      await downloadRemote(d.designUrl, `design-${d.id.slice(0, 8)}.png`);
    } catch {
      toast.error("Failed to download design");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate("/supplier")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent flex-1">
            {isAdmin ? "All designs" : "All designs (platform)"}
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
          Every design ships with production assets: download the full mockup, each uploaded logo, the text content,
          or a print-ready specification PDF. Customer contact details stay hidden until you fulfil an order using
          that design.
        </p>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading…</div>
        ) : designs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
            <ImageIcon className="h-12 w-12 opacity-50" />
            <p>No designs yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {designs.map((d) => {
              const meta = parseMeta(d);
              const logoCount = extractLogos(d.canvasJson).length;
              const textCount = extractTexts(d.canvasJson).length;
              return (
                <Card key={d.id} className="overflow-hidden flex flex-col">
                  <div className="aspect-[6/1] bg-[linear-gradient(135deg,#fafafa,#e9e9ee)] flex items-center p-2">
                    {d.designUrl ? (
                      <img src={d.designUrl} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                        No image
                      </div>
                    )}
                  </div>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-mono">#{d.id.slice(0, 8)}</CardTitle>
                      {d.visibility && (
                        <Badge variant="outline" className="shrink-0">
                          {d.visibility}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {d.user?.email}
                      {d.user?.fullName ? ` · ${d.user.fullName}` : ""}
                    </p>
                  </CardHeader>

                  <CardContent className="text-sm space-y-1 flex-1">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <Spec label="Type" value={meta.wristbandType || d.wristbandType} />
                      <Spec label="Quantity" value={meta.quantity ? `${meta.quantity} pcs` : "—"} />
                      <Spec
                        label="Colour"
                        value={
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="inline-block w-3 h-3 rounded-full border"
                              style={{ backgroundColor: meta.wristbandColor || d.wristbandColor || "#fff" }}
                            />
                            {meta.wristbandColor || d.wristbandColor || "—"}
                          </span>
                        }
                      />
                      <Spec
                        label="Print"
                        value={meta.printType && meta.printType !== "none" ? meta.printType : "none"}
                      />
                      <Spec label="QR" value={meta.hasQrCode ? "Yes" : "No"} />
                      <Spec label="Trademark" value={meta.hasTrademark ? "Yes" : "No"} />
                    </div>
                    {meta.hasTrademark && meta.trademarkText && (
                      <p className="pt-1">
                        <span className="text-muted-foreground">Trademark text:</span> {meta.trademarkText} (
                        {meta.trademarkTextColor || "black"})
                      </p>
                    )}
                    {(d.customText || textCount > 0) && (
                      <p>
                        <span className="text-muted-foreground">Text elements:</span>{" "}
                        {textCount || (d.customText ? 1 : 0)}
                      </p>
                    )}
                    <p>
                      <span className="text-muted-foreground">Logos:</span> {logoCount}
                    </p>
                    {d.orders && d.orders.length > 0 && (
                      <p className="text-xs text-muted-foreground pt-1">Linked orders: {d.orders.length}</p>
                    )}
                  </CardContent>

                  <div className="border-t p-3 grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleDesignPng(d)} disabled={!d.designUrl}>
                      <ImageIco className="h-4 w-4 mr-1" />
                      Mockup
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const n = downloadLogos(d);
                        n ? toast.success(`Downloading ${n} logo${n > 1 ? "s" : ""}`) : toast.info("No logos uploaded");
                      }}
                      disabled={logoCount === 0}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Logo{logoCount > 1 ? `s (${logoCount})` : ""}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const n = downloadTexts(d);
                        n ? toast.success("Text downloaded") : toast.info("No text on this design");
                      }}
                      disabled={textCount === 0 && !d.customText && !meta.trademarkText}
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      Text
                    </Button>
                    <Button variant="default" size="sm" onClick={() => handlePdf(d)} disabled={busyId === d.id}>
                      <FileType className="h-4 w-4 mr-1" />
                      {busyId === d.id ? "…" : "Spec PDF"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

const Spec = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <p className="truncate">
    <span className="text-muted-foreground">{label}:</span> {value}
  </p>
);

export default SupplierDesigns;
