import jsPDF from "jspdf";

/**
 * Production export utilities for the design studio.
 *
 * A saved design carries a flattened preview (`designUrl`), the full Fabric
 * canvas (`canvasJson`) and a customization snapshot (`metaJson`). Suppliers
 * need the raw production assets out of that — every uploaded logo, every text
 * element, and a print-ready spec sheet — which is what this module extracts.
 */

export interface DesignMeta {
  quantity?: number;
  currency?: string;
  wristbandType?: string;
  wristbandColor?: string;
  printType?: string;
  hasPrint?: boolean;
  hasQrCode?: boolean;
  hasTrademark?: boolean;
  trademarkText?: string;
  trademarkTextColor?: string;
  supplierId?: string;
  productId?: string;
  pricing?: { unitPrice?: number; total?: number };
  [key: string]: unknown;
}

export interface ProductionDesign {
  id: string;
  designUrl?: string | null;
  wristbandType?: string | null;
  wristbandColor?: string | null;
  customText?: string | null;
  textColor?: string | null;
  canvasJson?: string | null;
  metaJson?: string | null;
  createdAt?: string;
  user?: { email?: string; fullName?: string | null } | null;
}

export interface ExtractedText {
  text: string;
  fill: string;
  /** Structural/managed elements (e.g. the trademark) are not selectable. */
  isManaged: boolean;
}

function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function parseMeta(design: ProductionDesign): DesignMeta {
  return parse<DesignMeta>(design.metaJson) ?? {};
}

type FabricObj = {
  type?: string;
  src?: string;
  text?: string;
  fill?: string;
  selectable?: boolean;
  [key: string]: unknown;
};

function canvasObjects(canvasJson: string | null | undefined): FabricObj[] {
  const data = parse<{ objects?: FabricObj[] }>(canvasJson);
  return Array.isArray(data?.objects) ? data!.objects! : [];
}

const isImage = (o: FabricObj) => (o.type || "").toLowerCase() === "image";
const isText = (o: FabricObj) =>
  ["i-text", "text", "textbox"].includes((o.type || "").toLowerCase());

/** Uploaded logos = image objects the user can manipulate (QR/structural are not selectable). */
export function extractLogos(canvasJson: string | null | undefined): string[] {
  return canvasObjects(canvasJson)
    .filter((o) => isImage(o) && o.selectable !== false && typeof o.src === "string")
    .map((o) => o.src as string);
}

export function extractTexts(canvasJson: string | null | undefined): ExtractedText[] {
  return canvasObjects(canvasJson)
    .filter((o) => isText(o) && typeof o.text === "string" && o.text!.trim() !== "")
    .map((o) => ({
      text: o.text as string,
      fill: typeof o.fill === "string" ? o.fill : "#000000",
      isManaged: o.selectable === false,
    }));
}

// --- download helpers -------------------------------------------------------

function triggerDownload(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  triggerDownload(dataUrl, filename);
}

export async function downloadRemote(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch asset (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    triggerDownload(objectUrl, filename);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

/** Download every uploaded logo as a separate PNG. Returns the count. */
export function downloadLogos(design: ProductionDesign): number {
  const logos = extractLogos(design.canvasJson);
  const base = design.id.slice(0, 8);
  logos.forEach((src, i) => {
    const ext = src.startsWith("data:image/jpeg") ? "jpg" : "png";
    downloadDataUrl(src, `logo-${base}-${i + 1}.${ext}`);
  });
  return logos.length;
}

/** Download all text content (with colours) as a single .txt production note. */
export function downloadTexts(design: ProductionDesign): number {
  const meta = parseMeta(design);
  const texts = extractTexts(design.canvasJson);
  if (texts.length === 0 && !meta.trademarkText && !design.customText) return 0;

  const lines: string[] = [
    `Design #${design.id.slice(0, 8)} — text elements`,
    "=".repeat(40),
    "",
  ];
  texts.forEach((t, i) => {
    lines.push(`${i + 1}. "${t.text}"`);
    lines.push(`   colour: ${t.fill}${t.isManaged ? "  (trademark/managed)" : ""}`);
    lines.push("");
  });
  if (texts.length === 0 && (meta.trademarkText || design.customText)) {
    lines.push(`Trademark / text: "${meta.trademarkText || design.customText}"`);
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, `text-${design.id.slice(0, 8)}.txt`);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return texts.length || 1;
}

const MEASUREMENTS: Record<string, string> = {
  tyvek: 'Width: 19mm (3/4") x Length: 254mm (10")\nPrint Area: 228mm x 15mm\nAdhesive Strip: 25mm',
  vinyl: 'Width: 19mm (3/4") x Length: 254mm (10")\nPrint Area: 228mm x 15mm\nSnap Closure: Plastic',
  silicone: 'Width: 12mm (1/2") x Circumference: 202mm (8")\nPrint Area: Full surface\nDebossed/Embossed Depth: 0.5mm',
  fabric: 'Width: 15mm (5/8") x Length: 350mm (13.75")\nWoven Text Height: 10mm\nClosure: Metal/Plastic Clasp',
};

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function imageDims(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Download the designed wristband at full length as a landscape PDF — the actual
 * artwork sized to the band's aspect ratio, ready to hand to production.
 */
export async function downloadWristbandPdf(design: ProductionDesign): Promise<void> {
  if (!design.designUrl) throw new Error("No design image");
  const meta = parseMeta(design);
  const dataUrl = await urlToDataUrl(design.designUrl);
  const dims = await imageDims(dataUrl);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;
  const imgW = pageW - margin * 2;
  const imgH = imgW * (dims.h / dims.w);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`Wristband #${design.id.slice(0, 8)} — full length`, margin, margin);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const type = (meta.wristbandType || design.wristbandType || "tyvek").toString();
  doc.text(
    `Type: ${type}   ·   Size: 255 x 25 mm   ·   Qty: ${meta.quantity || "—"}   ·   Colour: ${meta.wristbandColor || design.wristbandColor || "—"}`,
    margin,
    margin + 6,
  );

  doc.addImage(dataUrl, "PNG", margin, margin + 12, imgW, imgH);

  doc.save(`wristband-${design.id.slice(0, 8)}.pdf`);
}

/** Generate and download a print-ready production specification PDF. */
export async function generateProductionPdf(design: ProductionDesign): Promise<void> {
  const meta = parseMeta(design);
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 20;

  const heading = (text: string, size = 16) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin, y);
    y += size === 16 ? 10 : 14;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
  };
  const line = (text: string) => {
    doc.text(text, margin, y);
    y += 7;
  };

  heading("Production Specification", 20);
  line(`Design ID: ${design.id.slice(0, 8)}`);
  if (design.createdAt) line(`Date: ${new Date(design.createdAt).toLocaleDateString()}`);
  if (design.user?.email) line(`Customer: ${design.user.fullName || design.user.email}`);
  y += 6;

  const type = (meta.wristbandType || design.wristbandType || "tyvek").toString();
  heading("Wristband Specifications");
  line(`Type: ${type}`);
  if (meta.quantity) line(`Quantity: ${meta.quantity} pieces`);
  line(`Colour: ${meta.wristbandColor || design.wristbandColor || "#FFFFFF"}`);
  if (meta.printType && meta.printType !== "none") {
    line(`Print: ${meta.printType === "black" ? "Black" : "Full colour"}`);
  }
  line(`QR code: ${meta.hasQrCode ? "Yes (left edge)" : "No"}`);
  line(`Trademark: ${meta.hasTrademark ? `Yes — "${meta.trademarkText || ""}" (${meta.trademarkTextColor || "black"}, vertical, right of QR)` : "No"}`);
  y += 4;

  const texts = extractTexts(design.canvasJson);
  if (texts.length) {
    heading("Text Elements");
    texts.forEach((t, i) => line(`${i + 1}. "${t.text}"  (${t.fill})`));
    y += 4;
  }

  heading("Standard Measurements");
  (MEASUREMENTS[type.toLowerCase()] || "Contact production for measurements.")
    .split("\n")
    .forEach(line);
  y += 6;

  if (design.designUrl) {
    heading("Design Preview");
    try {
      const dataUrl = await urlToDataUrl(design.designUrl);
      const imgWidth = pageWidth - 2 * margin;
      const imgHeight = 40;
      doc.addImage(dataUrl, "PNG", margin, y, imgWidth, imgHeight);
      y += imgHeight + 8;
    } catch {
      doc.setTextColor(0, 0, 255);
      doc.textWithLink("View design online", margin, y, { url: design.designUrl });
      doc.setTextColor(0, 0, 0);
      y += 8;
    }
  }

  doc.setFontSize(9);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `Generated ${new Date().toLocaleString()} | EU Wristbands Production`,
    pageWidth / 2,
    doc.internal.pageSize.getHeight() - 10,
    { align: "center" },
  );

  doc.save(`production-${design.id.slice(0, 8)}.pdf`);
}
