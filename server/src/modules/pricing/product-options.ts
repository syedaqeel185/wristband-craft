/**
 * Dynamic product customization options — the single source of truth for what
 * a supplier offers on a product and what it costs.
 *
 * Options live in the `product_options` table (one row per option). Products
 * created before this system exists have no rows; for those we synthesize an
 * equivalent option list from the legacy fixed columns (printExtraUsd, ...) so
 * pricing and display stay correct without a data migration. The first time a
 * supplier saves such a product from the new builder, real rows are written
 * and the synthesized view is no longer used.
 */

export type OptionPricingMode = 'per_unit' | 'one_time';

/** How the Design Studio renders an option. Unknown values fall back to 'toggle'. */
export type StudioModule = 'toggle' | 'print' | 'qr' | 'trademark' | 'design_setup';

export interface OptionChoice {
  key: string;
  label: string;
  description?: string | null;
  /** When set, the selected choice's price replaces the option's base price. */
  priceUsd?: number | null;
  priceEur?: number | null;
  priceGbp?: number | null;
}

export interface ProductOptionConfig {
  id?: string;
  key: string;
  label: string;
  description?: string | null;
  groupName?: string | null;
  pricingMode: OptionPricingMode;
  priceUsd: number;
  priceEur?: number | null;
  priceGbp?: number | null;
  isActive: boolean;
  sortOrder: number;
  studioModule: string;
  choices?: OptionChoice[];
}

/** Well-known keys the legacy boolean quote flags map onto. */
export const LEGACY_OPTION_KEYS = {
  blackPrint: 'black_print',
  fullColorPrint: 'full_color_print',
  logo: 'logo_print',
  qrCode: 'qr_code',
  designSetup: 'design_setup',
  trademark: 'trademark',
} as const;

/**
 * Starting template shown when a supplier creates a new product. Purely a
 * suggestion — the supplier can remove, rename, reprice, reorder, or replace
 * every entry, and add unlimited custom options.
 */
export const DEFAULT_PRODUCT_OPTIONS: ProductOptionConfig[] = [
  {
    key: LEGACY_OPTION_KEYS.blackPrint,
    label: 'Black print',
    description: 'Single-colour (black) print of your text or artwork',
    groupName: 'Print',
    pricingMode: 'per_unit',
    priceUsd: 0,
    isActive: true,
    sortOrder: 0,
    studioModule: 'print',
  },
  {
    key: LEGACY_OPTION_KEYS.fullColorPrint,
    label: 'Full-colour print',
    description: 'Full-colour print of your design',
    groupName: 'Print',
    pricingMode: 'per_unit',
    priceUsd: 0,
    isActive: true,
    sortOrder: 1,
    studioModule: 'print',
  },
  {
    key: LEGACY_OPTION_KEYS.logo,
    label: 'Logo printing',
    description: 'Print your uploaded logo on each wristband',
    groupName: 'Print',
    pricingMode: 'per_unit',
    priceUsd: 0,
    isActive: true,
    sortOrder: 2,
    studioModule: 'print',
  },
  {
    key: LEGACY_OPTION_KEYS.qrCode,
    label: 'QR code',
    description: 'Printed QR code on each wristband',
    groupName: 'Codes & tracking',
    pricingMode: 'per_unit',
    priceUsd: 0,
    isActive: true,
    sortOrder: 3,
    studioModule: 'qr',
    choices: [
      { key: 'static_qr', label: 'Static QR' },
      { key: 'dynamic_qr', label: 'Dynamic QR' },
    ],
  },
  {
    key: 'numbering',
    label: 'Sequential numbering',
    description: 'Unique sequential number printed on each wristband',
    groupName: 'Codes & tracking',
    pricingMode: 'per_unit',
    priceUsd: 0,
    isActive: true,
    sortOrder: 4,
    studioModule: 'toggle',
  },
  {
    key: 'barcode',
    label: 'Barcode',
    description: 'Printed barcode on each wristband',
    groupName: 'Codes & tracking',
    pricingMode: 'per_unit',
    priceUsd: 0,
    isActive: true,
    sortOrder: 5,
    studioModule: 'toggle',
  },
  {
    key: LEGACY_OPTION_KEYS.designSetup,
    label: 'Custom design setup',
    description: 'One-time setup fee when a custom design is used',
    groupName: 'One-time fees',
    pricingMode: 'one_time',
    priceUsd: 0,
    isActive: true,
    sortOrder: 6,
    studioModule: 'design_setup',
  },
  {
    key: LEGACY_OPTION_KEYS.trademark,
    label: 'Trademark / branding',
    description: 'One-time fee for trademark or brand text',
    groupName: 'One-time fees',
    pricingMode: 'one_time',
    priceUsd: 0,
    isActive: true,
    sortOrder: 7,
    studioModule: 'trademark',
  },
];

/** Shape of the legacy Product pricing columns the synthesizer reads. */
export interface LegacyOptionColumns {
  printExtraUsd: number;
  colorPrintExtraUsd: number;
  logoExtraUsd: number;
  qrCodePriceUsd: number;
  qrCodePriceEur?: number | null;
  qrCodePriceGbp?: number | null;
  designSetupFeeUsd: number;
  designSetupFeeEur?: number | null;
  designSetupFeeGbp?: number | null;
  trademarkFeeUsd: number;
  trademarkFeeEur?: number | null;
  trademarkFeeGbp?: number | null;
}

/**
 * Build an option list equivalent to the legacy fixed columns, for products
 * that have no `product_options` rows yet.
 */
export function synthesizeLegacyOptions(p: LegacyOptionColumns): ProductOptionConfig[] {
  const template = new Map(DEFAULT_PRODUCT_OPTIONS.map((o) => [o.key, o]));
  const withPrice = (
    key: string,
    priceUsd: number,
    priceEur?: number | null,
    priceGbp?: number | null,
  ): ProductOptionConfig => ({
    ...(template.get(key) as ProductOptionConfig),
    choices: template.get(key)?.choices?.map((c) => ({ ...c })),
    priceUsd: priceUsd || 0,
    priceEur: priceEur ?? null,
    priceGbp: priceGbp ?? null,
  });

  return [
    withPrice(LEGACY_OPTION_KEYS.blackPrint, p.printExtraUsd),
    withPrice(LEGACY_OPTION_KEYS.fullColorPrint, p.colorPrintExtraUsd),
    withPrice(LEGACY_OPTION_KEYS.logo, p.logoExtraUsd),
    withPrice(LEGACY_OPTION_KEYS.qrCode, p.qrCodePriceUsd, p.qrCodePriceEur, p.qrCodePriceGbp),
    withPrice(LEGACY_OPTION_KEYS.designSetup, p.designSetupFeeUsd, p.designSetupFeeEur, p.designSetupFeeGbp),
    withPrice(LEGACY_OPTION_KEYS.trademark, p.trademarkFeeUsd, p.trademarkFeeEur, p.trademarkFeeGbp),
  ].map((o, i) => ({ ...o, sortOrder: i }));
}

/** DB row (choices as JSON string) → API/engine shape (choices parsed). */
export function optionRowToConfig(row: {
  id: string;
  key: string;
  label: string;
  description: string | null;
  groupName: string | null;
  pricingMode: string;
  priceUsd: number;
  priceEur: number | null;
  priceGbp: number | null;
  isActive: boolean;
  sortOrder: number;
  studioModule: string;
  choicesJson: string | null;
}): ProductOptionConfig {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    groupName: row.groupName,
    pricingMode: row.pricingMode === 'one_time' ? 'one_time' : 'per_unit',
    priceUsd: row.priceUsd,
    priceEur: row.priceEur,
    priceGbp: row.priceGbp,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    studioModule: row.studioModule,
    choices: parseChoices(row.choicesJson),
  };
}

/**
 * The options that actually apply to a product: persisted rows when present,
 * otherwise the legacy-column synthesis. Every read path (catalog, storefront,
 * quote engine, supplier console) goes through this so pricing is consistent
 * everywhere.
 */
export function effectiveOptions(
  product: LegacyOptionColumns & { options?: Parameters<typeof optionRowToConfig>[0][] },
): ProductOptionConfig[] {
  if (product.options && product.options.length > 0) {
    return [...product.options]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(optionRowToConfig);
  }
  return synthesizeLegacyOptions(product);
}

export function parseChoices(json?: string | null): OptionChoice[] | undefined {
  if (!json) return undefined;
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return undefined;
    const choices = v
      .filter((c) => c && typeof c === 'object' && (c.key || c.label))
      .map((c) => sanitizeChoice(c));
    return choices.length ? choices : undefined;
  } catch {
    return undefined;
  }
}

function toNumberOrNull(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sanitizeChoice(raw: any): OptionChoice {
  const label = String(raw.label ?? raw.key ?? '').slice(0, 120);
  return {
    key: slugify(String(raw.key || label)),
    label,
    description: raw.description ? String(raw.description).slice(0, 500) : null,
    priceUsd: toNumberOrNull(raw.priceUsd),
    priceEur: toNumberOrNull(raw.priceEur),
    priceGbp: toNumberOrNull(raw.priceGbp),
  };
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'option'
  );
}

/**
 * Sanitize a client-submitted option into `product_options` column values.
 * Whitelist-based (prevents mass assignment); numbers are coerced; keys are
 * slugified and deduplicated by the caller-provided `usedKeys` set.
 */
export function sanitizeOptionInput(
  raw: any,
  index: number,
  usedKeys: Set<string>,
): {
  key: string;
  label: string;
  description: string | null;
  groupName: string | null;
  pricingMode: string;
  priceUsd: number;
  priceEur: number | null;
  priceGbp: number | null;
  isActive: boolean;
  sortOrder: number;
  studioModule: string;
  choicesJson: string | null;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const label = String(raw.label ?? '').trim().slice(0, 120);
  if (!label) return null;

  let key = slugify(String(raw.key || label));
  while (usedKeys.has(key)) key = `${key}_2`.slice(0, 60);
  usedKeys.add(key);

  const choices = Array.isArray(raw.choices)
    ? raw.choices
        .filter((c: any) => c && typeof c === 'object' && String(c.label ?? c.key ?? '').trim())
        .map((c: any) => sanitizeChoice(c))
    : undefined;

  return {
    key,
    label,
    description: raw.description ? String(raw.description).slice(0, 500) : null,
    groupName: raw.groupName ? String(raw.groupName).slice(0, 80) : null,
    pricingMode: raw.pricingMode === 'one_time' ? 'one_time' : 'per_unit',
    priceUsd: toNumberOrNull(raw.priceUsd) ?? 0,
    priceEur: toNumberOrNull(raw.priceEur),
    priceGbp: toNumberOrNull(raw.priceGbp),
    isActive: raw.isActive !== false,
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : index,
    studioModule: ['toggle', 'print', 'qr', 'trademark', 'design_setup'].includes(raw.studioModule)
      ? raw.studioModule
      : 'toggle',
    choicesJson: choices && choices.length ? JSON.stringify(choices) : null,
  };
}
