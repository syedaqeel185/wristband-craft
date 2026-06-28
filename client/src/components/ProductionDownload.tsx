import { Button } from "@/components/ui/button";
import { Download, FileText, Image as ImageIcon, FileType } from "lucide-react";
import { toast } from "sonner";
import {
  type ProductionDesign,
  extractLogos,
  extractTexts,
  downloadLogos,
  downloadTexts,
  downloadRemote,
  generateProductionPdf,
  downloadWristbandPdf,
} from "@/lib/production";

interface ProductionDownloadProps {
  order: any;
}

/**
 * Production asset downloads for an order's design: full mockup, each uploaded
 * logo, the text content, and a print-ready specification PDF — separately.
 */
export const ProductionDownload = ({ order }: ProductionDownloadProps) => {
  const design = order?.design;
  if (!design) {
    return <span className="text-xs text-muted-foreground">No design attached</span>;
  }

  // Prefer the design's own snapshot; fall back to the order's customizationNotes.
  const d: ProductionDesign = {
    id: design.id || order.id,
    designUrl: design.designUrl,
    wristbandType: design.wristbandType,
    wristbandColor: design.wristbandColor,
    customText: design.customText,
    textColor: design.textColor,
    canvasJson: design.canvasJson,
    metaJson: design.metaJson || order.customizationNotes || null,
    createdAt: order.createdAt,
    user: order.user,
  };

  const logoCount = extractLogos(d.canvasJson).length;
  const textCount = extractTexts(d.canvasJson).length;

  return (
    <div className="flex gap-2 flex-wrap">
      {d.designUrl && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() =>
            downloadRemote(d.designUrl!, `mockup-${d.id.slice(0, 8)}.png`).catch(() =>
              toast.error("Failed to download mockup"),
            )
          }
        >
          <ImageIcon className="h-4 w-4" />
          Mockup
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={logoCount === 0}
        onClick={() => {
          const n = downloadLogos(d);
          n ? toast.success(`Downloading ${n} logo${n > 1 ? "s" : ""}`) : toast.info("No logos uploaded");
        }}
      >
        <Download className="h-4 w-4" />
        Logo{logoCount > 1 ? `s (${logoCount})` : ""}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={textCount === 0 && !d.customText}
        onClick={() => {
          const n = downloadTexts(d);
          n ? toast.success("Text downloaded") : toast.info("No text on this design");
        }}
      >
        <FileText className="h-4 w-4" />
        Text
      </Button>
      {d.designUrl && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() =>
            downloadWristbandPdf(d)
              .then(() => toast.success("Wristband PDF generated"))
              .catch(() => toast.error("Failed to generate wristband PDF"))
          }
        >
          <FileType className="h-4 w-4" />
          Wristband PDF
        </Button>
      )}
      <Button
        variant="default"
        size="sm"
        className="gap-2"
        onClick={() =>
          generateProductionPdf(d)
            .then(() => toast.success("Production PDF generated"))
            .catch(() => toast.error("Failed to generate PDF"))
        }
      >
        <FileType className="h-4 w-4" />
        Spec PDF
      </Button>
    </div>
  );
};
