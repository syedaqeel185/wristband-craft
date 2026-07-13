import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { apiFetch, getQuote, addToCart, getCart, type PriceQuote, type PrintType as QuotePrintType } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { ArrowLeft, ShoppingCart, Loader2, Save, Download, Printer, Trash2, Plus } from "lucide-react";
import { Canvas as FabricCanvas, Image as FabricImage, IText, Line, Rect } from "fabric";
import QRPlaceholderImg from "@/assets/QR2.png";
import QRCheckedImg from "@/assets/QR.jpg";

type Currency = "EUR" | "USD" | "GBP";
type WristbandType = "silicone" | "fabric" | "vinyl" | "tyvek";
type PrintType = "none" | "black" | "full_color";

// Real wristband proportions: 255mm x 25mm (~10.2 : 1). Rendered 1:1 (no scaling
// of the band itself) so the studio scrolls horizontally at the true size.
const BAND_W = 1200;
const BAND_H = Math.round((BAND_W * 25) / 255); // 118
const DIECUT_PAD = 8; // px padding for the top/bottom die-cut lines

const CANVAS_DIMS: Record<WristbandType, { width: number; height: number }> = {
  tyvek: { width: BAND_W, height: BAND_H },
  vinyl: { width: BAND_W, height: BAND_H },
  fabric: { width: BAND_W, height: BAND_H },
  silicone: { width: BAND_W, height: BAND_H },
};

// Left -> right: [QR] [5px] [vertical trademark] [print area].
// No borders/lines between QR and trademark — they share the left area.
function bandLayout(w: number, h: number) {
  const qrSize = Math.max(48, h - 16);
  const qrLeft = 8;
  const qrRight = qrLeft + qrSize;
  const tmW = Math.max(22, Math.round(h * 0.18));
  const tmX = qrRight + 5; // trademark begins exactly 5px after the QR
  const designLeft = tmX + tmW + 6;
  const designRight = w - 10;
  return { qrSize, qrLeft, qrRight, tmW, tmX, designLeft, designRight };
}

const TYVEK_COLORS = [
  { name: "White", value: "#FFFFFF" },
  { name: "Black", value: "#000000" },
  { name: "Silver", value: "#C0C0C0" },
  { name: "Yellow", value: "#FFFF00" },
  { name: "Neon Yellow", value: "#DFFF00" },
  { name: "Gold", value: "#FFD700" },
  { name: "Red", value: "#FF0000" },
  { name: "Neon Red", value: "#FF073A" },
  { name: "Orange", value: "#FF8C00" },
  { name: "Neon Green", value: "#39FF14" },
  { name: "Green", value: "#00FF00" },
  { name: "Sky Blue", value: "#87CEEB" },
  { name: "Blue", value: "#0000FF" },
  { name: "Aqua", value: "#00FFFF" },
  { name: "Purple", value: "#800080" },
  { name: "Pink", value: "#FF69B4" },
  { name: "Magenta", value: "#FF00FF" },
  { name: "Violet", value: "#8B00FF" },
];

interface SavedTemplate {
  id: string;
  designUrl: string;
  wristbandColor: string;
  wristbandType: string;
  createdAt: string;
  canvasJson?: string | null;
  metaJson?: string | null;
  customText?: string | null;
  textColor?: string | null;
}

interface DesignMetaSnapshot {
  quantity: number;
  currency: Currency;
  wristbandType: WristbandType;
  wristbandColor: string;
  printType: PrintType;
  hasPrint: boolean;
  hasQrCode: boolean;
  hasTrademark: boolean;
  trademarkText: string;
  trademarkTextColor: "white" | "black";
  tmFont?: string;
  tmBold?: boolean;
  tmItalic?: boolean;
  supplierId: string;
  productId: string;
  pricing: { unitPrice: number; total: number };
}

const SYMBOL: Record<Currency, string> = { EUR: "€", USD: "$", GBP: "£" };

const FONT_OPTIONS = [
  "Arial",
  "Helvetica",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Trebuchet MS",
  "Impact",
  "Comic Sans MS",
];

const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
};

// Upload a file to Blob storage (via the API) and return its public URL.
const uploadImageFile = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);
  const token = localStorage.getItem("token");
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
  const response = await fetch(`${apiUrl}/designs/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const raw = await response.text();
  let data: { url?: string; message?: string | string[] } = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw || response.statusText };
  }
  if (!response.ok) {
    const m = data.message;
    const detail = Array.isArray(m) ? m.join(", ") : m || raw || `Upload failed (${response.status})`;
    throw new Error(detail);
  }
  if (!data.url) throw new Error("Upload did not return an image URL");
  return data.url;
};

const uploadDesignImage = async (dataUrl: string): Promise<string> => {
  const file = await dataUrlToFile(dataUrl, `design-${Date.now()}.png`);
  return uploadImageFile(file);
};

const DesignStudio = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const editDesignState = (location.state as any)?.editDesign;

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const isRestoringRef = useRef(false);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [uploadedImage, setUploadedImage] = useState<FabricImage | null>(null);
  const [customText, setCustomText] = useState("");
  const [wristbandColor, setWristbandColor] = useState("#FFFFFF");
  const [wristbandType, setWristbandType] = useState<WristbandType>("tyvek");
  const [quantity, setQuantity] = useState(1000);
  const [currency] = useState<Currency>("EUR");
  const [printType, setPrintType] = useState<PrintType>("none");
  const [hasTrademark, setHasTrademark] = useState(false);
  const [hasPrint, setHasPrint] = useState(false);
  const [hasQrCode, setHasQrCode] = useState(false);
  const [trademarkText, setTrademarkText] = useState("");
  const [trademarkTextColor, setTrademarkTextColor] = useState<"white" | "black">("black");
  // Custom-text style (defaults for new text; also applied live to selected text)
  const [textFont, setTextFont] = useState("Arial");
  const [textSize, setTextSize] = useState(36);
  const [textColor, setTextColor] = useState("#000000");
  const [textBold, setTextBold] = useState(true);
  const [textItalic, setTextItalic] = useState(false);
  // Trademark text style
  const [tmFont, setTmFont] = useState("Arial");
  const [tmBold, setTmBold] = useState(false);
  const [tmItalic, setTmItalic] = useState(false);
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [supplierProducts, setSupplierProducts] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [cartCount, setCartCount] = useState(0);

  const refreshCartCount = useCallback(() => {
    getCart().then((c) => setCartCount(c.count)).catch(() => {});
  }, []);

  useEffect(() => {
    refreshCartCount();
  }, [refreshCartCount]);

  const selectedProduct = supplierProducts.find((p) => p.id === selectedProductId);
  const minQty: number = selectedProduct?.minOrderQuantity || 1;
  const maxQty: number | undefined = selectedProduct?.maxOrderQuantity || undefined;

  const designClip = useCallback((canvas: FabricCanvas) => {
    const L = bandLayout(canvas.getWidth(), canvas.getHeight());
    return new Rect({
      left: L.designLeft,
      top: 4,
      width: L.designRight - L.designLeft,
      height: canvas.getHeight() - 8,
      absolutePositioned: true,
    });
  }, []);

  // ---- Structural rendering (zones, perforation, QR, trademark) ----
  // Structural objects are tagged with `zone` and are NEVER persisted; they are
  // always rebuilt from state. This keeps saved designs to user content only and
  // avoids the duplicate-element bugs that come from reloading structure.
  const rebuildStructure = useCallback(
    async (
      canvas: FabricCanvas,
      overrides?: {
        hasQrCode?: boolean;
        hasTrademark?: boolean;
        trademarkText?: string;
        trademarkTextColor?: "white" | "black";
        tmFont?: string;
        tmBold?: boolean;
        tmItalic?: boolean;
      },
    ) => {
      // Use explicit overrides when provided (restore path, where state setters
      // haven't applied yet); otherwise fall back to current state.
      const qrOn = overrides?.hasQrCode ?? hasQrCode;
      const tmOn = overrides?.hasTrademark ?? hasTrademark;
      const tmText = overrides?.trademarkText ?? trademarkText;
      const tmColor = overrides?.trademarkTextColor ?? trademarkTextColor;
      const tmFontFamily = overrides?.tmFont ?? tmFont;
      const tmIsBold = overrides?.tmBold ?? tmBold;
      const tmIsItalic = overrides?.tmItalic ?? tmItalic;
      const w = canvas.getWidth();
      const h = canvas.getHeight();
      const L = bandLayout(w, h);

      // Remove previously-added structural objects.
      canvas.getObjects().forEach((o) => {
        if ((o as any).zone) canvas.remove(o);
      });

      const tag = (obj: any, zone: string) => {
        obj.zone = zone;
        obj.set({ selectable: false, evented: false });
        return obj;
      };

      // --- White area covering the QR AND the trademark strip (both sit on white,
      // never on the coloured print area). The print area begins at L.designLeft.
      const closure = tag(
        new Rect({ left: 0, top: 0, width: L.tmX + L.tmW + 4, height: h, fill: "#FFFFFF" }),
        "qr-bg",
      );
      canvas.add(closure);

      // --- Die-cut guide lines, top & bottom of the printable band (a few px inset).
      const diecutTop = tag(
        new Line([2, DIECUT_PAD, w - 2, DIECUT_PAD], {
          stroke: "#9CA3AF",
          strokeWidth: 1,
          strokeDashArray: [6, 4],
        }),
        "diecut",
      );
      const diecutBottom = tag(
        new Line([2, h - DIECUT_PAD, w - 2, h - DIECUT_PAD], {
          stroke: "#9CA3AF",
          strokeWidth: 1,
          strokeDashArray: [6, 4],
        }),
        "diecut",
      );
      canvas.add(diecutTop, diecutBottom);

      // QR code, sitting on the white tab at the left edge.
      const qrSrc = qrOn ? QRCheckedImg : QRPlaceholderImg;
      try {
        const img = await FabricImage.fromURL(qrSrc, { crossOrigin: "anonymous" });
        img.scaleToWidth(L.qrSize);
        if (img.getScaledHeight() > L.qrSize) img.scaleToHeight(L.qrSize);
        img.set({
          left: (L.qrLeft + L.qrRight) / 2,
          top: h / 2,
          originX: "center",
          originY: "center",
          opacity: qrOn ? 1 : 0.5,
        });
        tag(img, "qr");
        canvas.add(img);
      } catch (e) {
        // QR image is decorative; ignore load failures.
      }

      // Trademark: vertical text, 5px to the right of the QR, in the same area.
      // No bordered strip — it shares the left area with the QR.
      if (tmOn && tmText.trim()) {
        const tm = tag(
          new IText(tmText.trim(), {
            left: L.tmX + L.tmW / 2,
            top: h / 2,
            fontSize: Math.max(12, Math.round(L.tmW * 0.7)),
            fill: tmColor === "white" ? "#FFFFFF" : "#000000",
            fontFamily: tmFontFamily,
            fontWeight: tmIsBold ? "bold" : "normal",
            fontStyle: tmIsItalic ? "italic" : "normal",
            originX: "center",
            originY: "center",
            angle: -90,
          }),
          "trademark",
        );
        canvas.add(tm);
      }

      // Z-order: closure tab + perforation sit behind everything else.
      canvas.getObjects().forEach((o) => {
        const z = (o as any).zone;
        if (z === "qr-bg" || z === "diecut") canvas.sendObjectToBack(o);
      });
      canvas.renderAll();
    },
    [hasTrademark, trademarkText, trademarkTextColor, tmFont, tmBold, tmItalic, hasQrCode],
  );

  // ---- Canvas init ----
  useEffect(() => {
    if (!canvasContainerRef.current || fabricCanvas) return;
    const el = canvasContainerRef.current.querySelector("canvas");
    if (!el) return;
    const dims = CANVAS_DIMS[wristbandType] || CANVAS_DIMS.tyvek;
    const canvas = new FabricCanvas(el, {
      width: dims.width,
      height: dims.height,
      backgroundColor: wristbandColor,
      preserveObjectStacking: true,
    });
    setFabricCanvas(canvas);
    loadTemplates();
    loadSuppliers();
    return () => {
      canvas.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Background colour
  useEffect(() => {
    if (!fabricCanvas) return;
    fabricCanvas.backgroundColor = wristbandColor;
    fabricCanvas.renderAll();
  }, [wristbandColor, fabricCanvas]);

  // Canvas dimensions follow wristband type, then structure rebuilds
  useEffect(() => {
    if (!fabricCanvas) return;
    const dims = CANVAS_DIMS[wristbandType] || CANVAS_DIMS.tyvek;
    fabricCanvas.setDimensions({ width: dims.width, height: dims.height });
    if (!isRestoringRef.current) void rebuildStructure(fabricCanvas);
  }, [wristbandType, fabricCanvas, rebuildStructure]);

  // Rebuild structure when QR/trademark options change
  useEffect(() => {
    if (!fabricCanvas || isRestoringRef.current) return;
    void rebuildStructure(fabricCanvas);
  }, [hasQrCode, hasTrademark, trademarkText, trademarkTextColor, tmFont, tmBold, tmItalic, fabricCanvas, rebuildStructure]);

  const loadSuppliers = async () => {
    try {
      const data = await apiFetch("/suppliers");
      setSuppliers(data || []);
      if (data && data.length > 0) {
        // Honour a supplier chosen from the homepage ("Design with this supplier").
        const preferred = localStorage.getItem("preferred_supplier");
        const match = preferred && data.find((s: any) => s.id === preferred);
        if (preferred) localStorage.removeItem("preferred_supplier");
        setSelectedSupplierId(match ? preferred : data[0].id);
      }
    } catch (e) {
      console.error("Failed to load suppliers:", e);
    }
  };

  useEffect(() => {
    if (!selectedSupplierId) return;
    (async () => {
      try {
        const products = (await apiFetch(`/suppliers/${selectedSupplierId}/products`)) || [];
        setSupplierProducts(products);
        if (products.length > 0 && !isRestoringRef.current) {
          // Honour a product chosen from a storefront ("Customize this product").
          const preferredProduct = localStorage.getItem("preferred_product");
          if (preferredProduct) localStorage.removeItem("preferred_product");
          const chosen = (preferredProduct && products.find((p: any) => p.id === preferredProduct)) || products[0];
          setSelectedProductId(chosen.id);
          setWristbandType(chosen.wristbandType as WristbandType);
          setQuantity(chosen.minOrderQuantity || 1000);
        }
      } catch (e) {
        console.error("Failed to load supplier products:", e);
      }
    })();
  }, [selectedSupplierId]);

  const loadTemplates = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const data = await apiFetch("/designs/mine");
      setSavedTemplates(data || []);
    } catch (error) {
      console.error("Failed to load templates:", error);
    }
  };

  // ---- Pricing via the authoritative server engine ----
  useEffect(() => {
    if (!selectedProductId) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      setLoadingPrice(true);
      try {
        const printForQuote: QuotePrintType =
          !hasPrint || printType === "none" ? "none" : printType === "black" ? "black" : "color";
        const q = await getQuote({
          productId: selectedProductId,
          quantity: Math.max(quantity, minQty),
          currency,
          printType: printForQuote,
          hasCustomDesign: hasPrint || !!uploadedImage,
          hasLogo: !!uploadedImage,
          qrEnabled: hasQrCode,
          trademarkEnabled: hasTrademark,
        });
        if (!cancelled) setQuote(q);
      } catch (error: any) {
        if (!cancelled) {
          setQuote(null);
          // Below-min and similar validation errors are surfaced inline, not as toasts.
        }
      } finally {
        if (!cancelled) setLoadingPrice(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [selectedProductId, quantity, minQty, hasPrint, printType, hasQrCode, hasTrademark, uploadedImage, currency]);

  // ---- Image / text tools ----
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricCanvas) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Image must be under 15MB");
      return;
    }
    setPrintType("full_color");
    setHasPrint(true);
    try {
      // Upload to Blob storage first and reference by URL. Embedding the logo
      // as base64 in the canvas JSON would bloat the saved design past the
      // serverless request-body limit (see persistDesign).
      const imgUrl = await uploadImageFile(file);
      const img = await FabricImage.fromURL(imgUrl, { crossOrigin: "anonymous" });
      const L = bandLayout(fabricCanvas.getWidth(), fabricCanvas.getHeight());
      // Auto-fit the logo into the printable area (never block the upload).
      const maxWidth = L.designRight - L.designLeft - 16;
      const maxHeight = fabricCanvas.getHeight() - 12;
      if (img.getScaledWidth() > maxWidth) img.scaleToWidth(maxWidth);
      if (img.getScaledHeight() > maxHeight) img.scaleToHeight(maxHeight);
      img.set({
        left: L.designLeft + img.getScaledWidth() / 2 + 8,
        top: fabricCanvas.getHeight() / 2,
        originY: "center",
        selectable: true,
        evented: true,
        clipPath: designClip(fabricCanvas),
      });
      fabricCanvas.add(img);
      setUploadedImage(img);
      fabricCanvas.setActiveObject(img);
      fabricCanvas.renderAll();
      toast.success("Logo added — drag to position, or use 'Duplicate Logo' to add more");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload logo");
    }
  };

  // Live-apply the current style controls to the selected text object (if any).
  const styleActiveText = (patch: Record<string, unknown>) => {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObject();
    if (active && ["i-text", "text", "textbox"].includes((active.type || "").toLowerCase())) {
      active.set(patch);
      fabricCanvas.requestRenderAll();
    }
  };

  const handleAddText = () => {
    if (!fabricCanvas || !customText.trim()) {
      toast.error("Please enter text to add");
      return;
    }
    const L = bandLayout(fabricCanvas.getWidth(), fabricCanvas.getHeight());
    const text = new IText(customText, {
      left: (L.designLeft + L.designRight) / 2,
      top: fabricCanvas.getHeight() / 2,
      fontSize: Math.min(textSize, fabricCanvas.getHeight() - 20),
      fill: textColor,
      fontFamily: textFont,
      fontWeight: textBold ? "bold" : "normal",
      fontStyle: textItalic ? "italic" : "normal",
      originX: "center",
      originY: "center",
      editable: true,
      selectable: true,
      evented: true,
      clipPath: designClip(fabricCanvas),
    });
    fabricCanvas.add(text);
    fabricCanvas.setActiveObject(text);
    fabricCanvas.renderAll();
    setCustomText("");
    toast.success("Text added — double-click to edit");
  };

  // Full-bleed wristband background image (stretched to cover the band). Sits
  // behind everything; the white QR/trademark tab still renders on top of it.
  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricCanvas) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Image must be under 15MB");
      return;
    }
    try {
      // Upload to Blob first (URL reference, not base64) — same reason as the
      // logo upload: keep the serialized canvas small enough to POST.
      const bgUrl = await uploadImageFile(file);
      const img = await FabricImage.fromURL(bgUrl, { crossOrigin: "anonymous" });
      const w = fabricCanvas.getWidth();
      const h = fabricCanvas.getHeight();
      img.set({
        originX: "left",
        originY: "top",
        left: 0,
        top: 0,
        scaleX: w / (img.width || 1),
        scaleY: h / (img.height || 1),
        selectable: false,
        evented: false,
      });
      fabricCanvas.backgroundImage = img;
      fabricCanvas.renderAll();
      toast.success("Background applied to the wristband");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload background");
    }
  };

  const clearBackgroundImage = () => {
    if (!fabricCanvas) return;
    fabricCanvas.backgroundImage = undefined;
    fabricCanvas.renderAll();
    toast.success("Background removed");
  };

  const handleDuplicateLogo = () => {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObject();
    if (active && (active.type || "").toLowerCase() === "image") {
      const img = active as FabricImage;
      const src = (img.getElement() as HTMLImageElement).src;
      FabricImage.fromURL(src, { crossOrigin: "anonymous" }).then((cloned) => {
        cloned.set({
          left: (img.left || 0) + 30,
          top: (img.top || 0) + 20,
          scaleX: img.scaleX,
          scaleY: img.scaleY,
          angle: img.angle,
          originY: img.originY,
          clipPath: designClip(fabricCanvas),
        });
        fabricCanvas.add(cloned);
        fabricCanvas.setActiveObject(cloned);
        fabricCanvas.renderAll();
        toast.success("Logo duplicated");
      });
    } else {
      toast.error("Select a logo to duplicate");
    }
  };

  // Serialize only user content (logos/text); structure is rebuilt from state.
  const serializeUserCanvas = (): string => {
    if (!fabricCanvas) return "";
    const json: any = fabricCanvas.toJSON(["selectable", "evented", "zone"] as any);
    json.objects = (json.objects || []).filter((o: any) => !o.zone);
    return JSON.stringify(json);
  };

  const buildMeta = (): DesignMetaSnapshot => ({
    quantity: Math.max(quantity, minQty),
    currency,
    wristbandType,
    wristbandColor,
    printType,
    hasPrint,
    hasQrCode,
    hasTrademark,
    trademarkText,
    trademarkTextColor,
    tmFont,
    tmBold,
    tmItalic,
    supplierId: selectedSupplierId,
    productId: selectedProductId,
    pricing: { unitPrice: quote?.unitPrice ?? 0, total: quote?.total ?? 0 },
  });

  // ---- Restore a saved design ----
  const restoreDesign = useCallback(
    async (meta: Partial<DesignMetaSnapshot>, canvasJson?: string | null) => {
      if (!fabricCanvas) return;
      isRestoringRef.current = true;
      try {
        if (meta.wristbandColor) setWristbandColor(meta.wristbandColor);
        if (meta.wristbandType) setWristbandType(meta.wristbandType as WristbandType);
        if (typeof meta.quantity === "number") setQuantity(meta.quantity);
        if (meta.printType) setPrintType(meta.printType as PrintType);
        if (typeof meta.hasPrint === "boolean") setHasPrint(meta.hasPrint);
        if (typeof meta.hasQrCode === "boolean") setHasQrCode(meta.hasQrCode);
        if (typeof meta.hasTrademark === "boolean") setHasTrademark(meta.hasTrademark);
        if (typeof meta.trademarkText === "string") setTrademarkText(meta.trademarkText);
        if (meta.trademarkTextColor) setTrademarkTextColor(meta.trademarkTextColor);
        if (meta.tmFont) setTmFont(meta.tmFont);
        if (typeof meta.tmBold === "boolean") setTmBold(meta.tmBold);
        if (typeof meta.tmItalic === "boolean") setTmItalic(meta.tmItalic);
        if (meta.supplierId) setSelectedSupplierId(meta.supplierId);
        if (meta.productId) setSelectedProductId(meta.productId);

        const dims = CANVAS_DIMS[(meta.wristbandType as WristbandType) || wristbandType] || CANVAS_DIMS.tyvek;
        fabricCanvas.setDimensions({ width: dims.width, height: dims.height });
        fabricCanvas.backgroundColor = meta.wristbandColor || wristbandColor;

        // loadFromJSON in Fabric v6 returns a promise that resolves once every
        // object (images included) has loaded — this is the correct completion
        // signal (the old callback arg was a per-object reviver, which fired early).
        if (canvasJson) {
          const parsed = JSON.parse(canvasJson);
          // Legacy safety net: designs saved before structural objects were
          // tagged with `zone` may still embed the procedural QR/trademark
          // placeholder with a stale absolute URL from whatever origin they
          // were saved on (e.g. an old dev server port). loadFromJSON rejects
          // the whole restore if any embedded image 404s, so strip anything
          // that looks like our own placeholder art — rebuildStructure below
          // regenerates it fresh from the current bundled asset.
          parsed.objects = (parsed.objects || []).filter(
            (o: any) => !o.zone && !(o.type === "image" && typeof o.src === "string" && o.src.includes("/assets/QR")),
          );
          await fabricCanvas.loadFromJSON(parsed);
          fabricCanvas.getObjects().forEach((o) => {
            const t = (o.type || "").toLowerCase();
            if (t === "image" || t === "i-text" || t === "text" || t === "textbox") {
              o.set({ selectable: true, evented: true });
            }
          });
          const logo = fabricCanvas
            .getObjects()
            .find((o) => (o.type || "").toLowerCase() === "image") as FabricImage | undefined;
          setUploadedImage(logo ?? null);
        } else {
          fabricCanvas.remove(...fabricCanvas.getObjects());
          setUploadedImage(null);
        }

        await rebuildStructure(fabricCanvas, {
          hasQrCode: !!meta.hasQrCode,
          hasTrademark: !!meta.hasTrademark,
          trademarkText: meta.trademarkText ?? "",
          trademarkTextColor: meta.trademarkTextColor ?? "black",
          tmFont: meta.tmFont,
          tmBold: meta.tmBold,
          tmItalic: meta.tmItalic,
        });
        fabricCanvas.renderAll();
        toast.success("Design loaded for editing");
      } catch (e) {
        console.error("Failed to restore design:", e);
        toast.error("Failed to load design");
      } finally {
        // Release after effects settle so they don't double-rebuild structure.
        setTimeout(() => {
          isRestoringRef.current = false;
        }, 150);
      }
    },
    [fabricCanvas, rebuildStructure, wristbandColor, wristbandType],
  );

  // Restore from navigation state (MyDesigns / order edit)
  useEffect(() => {
    if (!fabricCanvas || !editDesignState) return;
    const meta = editDesignState.metaJson
      ? JSON.parse(editDesignState.metaJson)
      : editDesignState.orderDetails || {};
    // normalise snake_case order details into the meta shape
    const normalised: Partial<DesignMetaSnapshot> = {
      wristbandColor: meta.wristbandColor ?? meta.wristband_color,
      wristbandType: meta.wristbandType ?? meta.wristband_type,
      quantity: meta.quantity,
      printType: meta.printType ?? meta.print_type,
      hasPrint: meta.hasPrint ?? meta.has_print,
      hasQrCode: meta.hasQrCode ?? meta.has_qr_code,
      hasTrademark: meta.hasTrademark ?? meta.has_trademark,
      trademarkText: meta.trademarkText ?? meta.trademark_text,
      trademarkTextColor: meta.trademarkTextColor ?? meta.trademark_text_color,
      supplierId: meta.supplierId,
      productId: meta.productId,
    };
    void restoreDesign(normalised, editDesignState.canvasJson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabricCanvas]);

  // ---- Persistence / orders ----
  const persistDesign = async (): Promise<any> => {
    const dataUrl = fabricCanvas!.toDataURL({ format: "png", quality: 1, multiplier: 2 });
    const publicUrl = await uploadDesignImage(dataUrl);
    return apiFetch("/designs", {
      method: "POST",
      body: JSON.stringify({
        designUrl: publicUrl,
        wristbandColor,
        wristbandType,
        customText: trademarkText || "",
        textColor: trademarkTextColor === "white" ? "#FFFFFF" : "#000000",
        canvasJson: serializeUserCanvas(),
        metaJson: JSON.stringify(buildMeta()),
      }),
    });
  };

  const handleSaveTemplate = async () => {
    if (!fabricCanvas) return;
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) {
        toast.error("Please sign in to save designs");
        navigate("/auth");
        return;
      }
      await persistDesign();
      toast.success("Design saved");
      loadTemplates();
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error(error.message || "Failed to save design");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await apiFetch(`/designs/${id}`, { method: "DELETE" });
      toast.success("Design deleted");
      loadTemplates();
    } catch {
      toast.error("Failed to delete design");
    }
  };

  const handleDownloadPDF = () => {
    if (!fabricCanvas) return;
    const dataUrl = fabricCanvas.toDataURL({ format: "png", quality: 1, multiplier: 2 });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `wristband-design-${Date.now()}.png`;
    link.click();
    toast.success("Design downloaded");
  };

  const handlePrint = () => {
    if (!fabricCanvas) return;
    const dataUrl = fabricCanvas.toDataURL({ format: "png", quality: 1, multiplier: 2 });
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`<img src="${dataUrl}" onload="window.print();window.close()" />`);
    }
  };

  const submitOrder = async (asCart: boolean) => {
    if (!fabricCanvas) {
      toast.error("Please create a design");
      return;
    }
    if (!selectedSupplierId?.trim()) {
      toast.error("Select a supplier first");
      return;
    }
    if (!quote) {
      toast.error("Please wait for pricing to load");
      return;
    }
    if (quantity < minQty) {
      toast.error(`Minimum quantity is ${minQty} pieces`);
      return;
    }
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) {
        toast.error("Please sign in to continue");
        navigate("/auth");
        return;
      }
      const design = await persistDesign();
      // Add to the real cart (server recomputes the authoritative price).
      await addToCart({
        designId: design.id,
        productId: selectedProductId || undefined,
        supplierId: selectedSupplierId || undefined,
        quantity: Math.max(quantity, minQty),
        currency,
        options: buildMeta(),
      });
      refreshCartCount();
      if (asCart) {
        toast.success("Added to cart — you can close this tab");
        setTimeout(() => window.close(), 1500);
      } else {
        toast.success("Added to cart");
        navigate("/order-summary");
      }
    } catch (error: any) {
      toast.error(error.message || "An error occurred");
    } finally {
      setSaving(false);
    }
  };

  const clearCanvas = () => {
    if (!fabricCanvas) return;
    fabricCanvas.getObjects().forEach((o) => {
      if (!(o as any).zone) fabricCanvas.remove(o);
    });
    fabricCanvas.backgroundImage = undefined;
    setUploadedImage(null);
    setWristbandColor("#FFFFFF");
    setWristbandType("tyvek");
    setPrintType("none");
    setHasPrint(false);
    setHasTrademark(false);
    setTrademarkText("");
    setTrademarkTextColor("black");
    setHasQrCode(false);
    void rebuildStructure(fabricCanvas);
    toast.success("Canvas cleared");
  };

  const sym = SYMBOL[currency];
  const isNewTab = typeof window !== "undefined" && window.opener !== null;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Link to="/">
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent cursor-pointer hover:opacity-80 transition-opacity">
                EU Wristbands · Design Studio
              </h1>
            </Link>
          </div>
          <Button variant="outline" size="sm" className="relative" onClick={() => navigate("/order-summary")}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            Cart
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-semibold">Design Preview</h2>
                <p className="text-sm text-muted-foreground">
                  255 × 25 mm · QR + trademark on the left, then the print area. Scroll sideways to design.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveTemplate} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
                  <Download className="h-4 w-4 mr-2" />
                  PNG
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Block container with horizontal scroll: the band renders at its
                true pixel width (no shrinking) and scrolls sideways while you design. */}
            <div
              className="rounded-lg p-8 overflow-x-auto overflow-y-hidden"
              style={{
                background: "linear-gradient(135deg,#fafafa 0%,#e9e9ee 100%)",
                boxShadow: "inset 0 2px 10px rgba(0,0,0,0.08)",
              }}
            >
              <div
                ref={canvasContainerRef}
                className="shrink-0"
                style={{
                  width: "max-content",
                  borderRadius: 2, // straight wristband — no rounded sides
                  overflow: "hidden",
                  boxShadow: "0 12px 30px rgba(0,0,0,0.28)",
                }}
              >
                <canvas />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Left: die-cut closure (perforation) with the QR; 5px after it, the vertical trademark; the rest is the
              printable area.
            </p>

            <div className="mt-4 flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleDuplicateLogo}>
                <Plus className="h-4 w-4 mr-2" />
                Duplicate Logo
              </Button>
              <Button variant="outline" size="sm" onClick={clearCanvas}>
                Clear Canvas
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const active = fabricCanvas?.getActiveObject();
                  if (active && !(active as any).zone) {
                    fabricCanvas?.remove(active);
                    fabricCanvas?.renderAll();
                    toast.success("Object removed");
                  } else {
                    toast.error("Select an object to delete");
                  }
                }}
              >
                Delete Selected
              </Button>
            </div>

            {savedTemplates.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold mb-3">Saved Mockups</h3>
                <div className="grid grid-cols-2 gap-3">
                  {savedTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="relative group border rounded-lg overflow-hidden cursor-pointer"
                      onClick={() => {
                        const meta = template.metaJson ? JSON.parse(template.metaJson) : {};
                        void restoreDesign(
                          {
                            wristbandColor: meta.wristbandColor ?? template.wristbandColor,
                            wristbandType: meta.wristbandType ?? (template.wristbandType as WristbandType),
                            quantity: meta.quantity,
                            printType: meta.printType,
                            hasPrint: meta.hasPrint,
                            hasQrCode: meta.hasQrCode,
                            hasTrademark: meta.hasTrademark,
                            trademarkText: meta.trademarkText ?? template.customText ?? "",
                            trademarkTextColor:
                              meta.trademarkTextColor ??
                              (template.textColor?.toLowerCase() === "#ffffff" ? "white" : "black"),
                            supplierId: meta.supplierId,
                            productId: meta.productId,
                          },
                          template.canvasJson,
                        );
                      }}
                    >
                      <img src={template.designUrl} alt="Saved mockup" className="w-full h-20 object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <span className="text-white text-xs">Click to edit</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTemplate(template.id);
                          }}
                          className="text-white hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Configure Your Wristband</h2>
            <div className="space-y-6">
              <div>
                <Label>Select Supplier</Label>
                <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                  <SelectTrigger className="mt-2 text-primary font-medium">
                    <SelectValue placeholder="Choose a supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  The supplier sets prices; your total updates live from their price book.
                </p>
              </div>

              {supplierProducts.length > 0 && (
                <div>
                  <Label>Select Product</Label>
                  <Select
                    value={selectedProductId}
                    onValueChange={(id) => {
                      setSelectedProductId(id);
                      const p = supplierProducts.find((x) => x.id === id);
                      if (p) {
                        setWristbandType(p.wristbandType as WristbandType);
                        setQuantity(p.minOrderQuantity || 1000);
                      }
                    }}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Choose a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {supplierProducts.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.wristbandType}) — from {sym}
                          {(p.priceEur ?? p.priceUsd)?.toFixed?.(3)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedProduct && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Starting at {sym}
                      {(selectedProduct.priceEur ?? selectedProduct.priceUsd)?.toFixed?.(3)} / unit · min{" "}
                      {selectedProduct.minOrderQuantity} pcs
                    </p>
                  )}
                </div>
              )}

              <div className="border-t pt-4">
                <Label>
                  Quantity (Min {minQty} pcs{maxQty ? `, Max ${maxQty} pcs` : ""})
                </Label>
                <Input
                  type="number"
                  min={minQty}
                  max={maxQty || undefined}
                  step="100"
                  value={quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || minQty;
                    setQuantity(maxQty ? Math.min(Math.max(val, minQty), maxQty) : Math.max(val, minQty));
                  }}
                  className="mt-2"
                />
                <Button
                  variant="default"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => {
                    window.open("/design-studio", "_blank");
                    toast.success("New design window opened");
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Design
                </Button>
                <p className="text-xs text-muted-foreground mt-1">Opens a new tab to design another wristband.</p>
              </div>

              <div>
                <Label>Wristband Type</Label>
                <Select value={wristbandType} onValueChange={(v: WristbandType) => setWristbandType(v)}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="silicone">Silicone</SelectItem>
                    <SelectItem value="fabric">Fabric</SelectItem>
                    <SelectItem value="vinyl">Vinyl</SelectItem>
                    <SelectItem value="tyvek">Tyvek</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {wristbandType === "tyvek" ? (
                <div>
                  <Label>Tyvek Color</Label>
                  <div className="grid grid-cols-9 gap-2 mt-2">
                    {TYVEK_COLORS.map((color) => (
                      <button
                        key={color.value}
                        className={`w-10 h-10 rounded-full border-2 transition-all ${
                          wristbandColor === color.value ? "border-primary scale-110" : "border-gray-300"
                        }`}
                        style={{ backgroundColor: color.value }}
                        onClick={() => setWristbandColor(color.value)}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <Label>Wristband Color</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      type="color"
                      value={wristbandColor}
                      onChange={(e) => setWristbandColor(e.target.value)}
                      className="w-20 h-10"
                    />
                    <Input
                      type="text"
                      value={wristbandColor}
                      onChange={(e) => setWristbandColor(e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="print"
                    checked={hasPrint}
                    onCheckedChange={(c) => {
                      const checked = !!c;
                      setHasPrint(checked);
                      setPrintType(checked ? "full_color" : "none");
                    }}
                  />
                  <Label htmlFor="print" className="cursor-pointer">
                    Add Print
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox id="qr-code" checked={hasQrCode} onCheckedChange={(c) => setHasQrCode(c as boolean)} />
                  <Label htmlFor="qr-code" className="cursor-pointer">
                    Add QR Code (emergency / secure)
                    {selectedProduct?.qrCodePriceUsd > 0 && (
                      <span className="text-muted-foreground ml-1 text-xs">
                        +{sym}
                        {(selectedProduct.qrCodePriceEur ?? selectedProduct.qrCodePriceUsd).toFixed(3)}/unit
                      </span>
                    )}
                  </Label>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="trademark"
                      checked={hasTrademark}
                      onCheckedChange={(c) => setHasTrademark(c as boolean)}
                    />
                    <Label htmlFor="trademark" className="cursor-pointer">
                      Add Trademark (vertical, right of QR)
                      {selectedProduct?.trademarkFeeUsd > 0 && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          +{sym}
                          {(selectedProduct.trademarkFeeEur ?? selectedProduct.trademarkFeeUsd).toFixed(2)} one-time
                        </span>
                      )}
                    </Label>
                  </div>
                  {hasTrademark && (
                    <div className="ml-6 space-y-2">
                      <Input
                        type="text"
                        maxLength={15}
                        value={trademarkText}
                        onChange={(e) => setTrademarkText(e.target.value)}
                        placeholder="Web address (max 15 chars)"
                      />
                      <div className="flex items-center gap-4">
                        <Label>Text Color:</Label>
                        <RadioGroup
                          value={trademarkTextColor}
                          onValueChange={(v) => setTrademarkTextColor(v as "white" | "black")}
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="white" id="tm-white" />
                            <Label htmlFor="tm-white" className="cursor-pointer">
                              White
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="black" id="tm-black" />
                            <Label htmlFor="tm-black" className="cursor-pointer">
                              Black
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select value={tmFont} onValueChange={setTmFont}>
                          <SelectTrigger className="h-8 flex-1" style={{ fontFamily: tmFont }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FONT_OPTIONS.map((f) => (
                              <SelectItem key={f} value={f} style={{ fontFamily: f }}>
                                {f}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant={tmBold ? "default" : "outline"}
                          size="sm"
                          className="font-bold w-9"
                          onClick={() => setTmBold((v) => !v)}
                        >
                          B
                        </Button>
                        <Button
                          type="button"
                          variant={tmItalic ? "default" : "outline"}
                          size="sm"
                          className="italic w-9"
                          onClick={() => setTmItalic((v) => !v)}
                        >
                          I
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Logo + background uploads appear once "Add Print" is enabled. */}
              {hasPrint && (
                <div className="space-y-4 border rounded-lg p-3 bg-secondary/10">
                  <div>
                    <Label>Upload Your Logo</Label>
                    <Input type="file" accept="image/*" onChange={handleImageUpload} className="mt-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      Up to 15MB. Logo is clipped to the print area. Select it and click 'Duplicate Logo' to repeat.
                    </p>
                  </div>
                  <div>
                    <Label>Upload Wristband Background</Label>
                    <div className="flex gap-2 mt-2">
                      <Input type="file" accept="image/*" onChange={handleBackgroundUpload} className="flex-1" />
                      <Button variant="outline" size="sm" onClick={clearBackgroundImage}>
                        Remove
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Stretched across the whole band as the printed background (the QR/trademark tab stays white).
                    </p>
                  </div>
                </div>
              )}

              <div>
                <Label>Add Custom Text</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="text"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="Enter your text"
                    onKeyDown={(e) => e.key === "Enter" && handleAddText()}
                  />
                  <Button onClick={handleAddText} variant="default">
                    Add
                  </Button>
                </div>

                {/* Style toolbar — applies to new text and to the selected text. */}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Select
                    value={textFont}
                    onValueChange={(v) => {
                      setTextFont(v);
                      styleActiveText({ fontFamily: v });
                    }}
                  >
                    <SelectTrigger className="h-8 w-40" style={{ fontFamily: textFont }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((f) => (
                        <SelectItem key={f} value={f} style={{ fontFamily: f }}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={8}
                    max={120}
                    value={textSize}
                    onChange={(e) => {
                      const s = parseInt(e.target.value) || 12;
                      setTextSize(s);
                      styleActiveText({ fontSize: s });
                    }}
                    className="h-8 w-20"
                    title="Font size"
                  />
                  <Button
                    type="button"
                    variant={textBold ? "default" : "outline"}
                    size="sm"
                    className="font-bold w-9"
                    onClick={() => {
                      const v = !textBold;
                      setTextBold(v);
                      styleActiveText({ fontWeight: v ? "bold" : "normal" });
                    }}
                  >
                    B
                  </Button>
                  <Button
                    type="button"
                    variant={textItalic ? "default" : "outline"}
                    size="sm"
                    className="italic w-9"
                    onClick={() => {
                      const v = !textItalic;
                      setTextItalic(v);
                      styleActiveText({ fontStyle: v ? "italic" : "normal" });
                    }}
                  >
                    I
                  </Button>
                  <Input
                    type="color"
                    className="h-8 w-12 p-1"
                    value={textColor}
                    onChange={(e) => {
                      setTextColor(e.target.value);
                      styleActiveText({ fill: e.target.value });
                    }}
                    title="Text colour"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Pick a font, size, weight and colour. Select any text on the canvas to restyle it; drag to position.
                </p>
              </div>

              <div className="bg-secondary/20 p-4 rounded-lg space-y-2">
                <h3 className="font-semibold text-lg mb-3">Order Summary</h3>
                {loadingPrice ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : quote ? (
                  <>
                    {quote.components.map((c) => (
                      <div key={c.code} className="flex justify-between text-sm">
                        <span>
                          {c.label}
                          {c.kind === "per_unit" ? ` (${sym}${c.unitAmount.toFixed(3)} × ${c.quantity})` : ""}:
                        </span>
                        <span>
                          {c.code === "base" ? "" : "+"}
                          {sym}
                          {c.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                    <div className="border-t pt-2 mt-2">
                      <div className="flex justify-between font-medium">
                        <span>Unit Price:</span>
                        <span>
                          {sym}
                          {quote.unitPrice.toFixed(3)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Quantity:</span>
                        <span>{quote.quantity} pcs</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-lg font-bold border-t pt-2 text-primary">
                      <span>Total:</span>
                      <span>
                        {sym}
                        {quote.total.toFixed(2)}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {selectedProductId
                      ? "Adjust quantity/options to see pricing (check the minimum quantity)."
                      : selectedSupplierId
                        ? "This supplier has no products yet."
                        : "Select a supplier and product to see pricing."}
                  </p>
                )}
              </div>

              <Button
                onClick={() => submitOrder(isNewTab)}
                disabled={saving || !quote}
                variant="hero"
                className="w-full"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                {isNewTab ? "Add to Cart" : "Continue to Summary"}
              </Button>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default DesignStudio;
