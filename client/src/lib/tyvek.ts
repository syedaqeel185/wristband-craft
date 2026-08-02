/**
 * Shared TYVEK® reference data from the European Promotion dealer price list.
 * Single source for the 18 solid colours, the two sizes, and a ready-to-load
 * product preset (tiers + options) so suppliers can add the Tyvek catalogue in
 * one click and the Design Studio can render the same colours everywhere.
 */

export interface WristbandColor {
  name: string;
  value: string;
}

/** The 18 solid colours (name + display swatch). */
export const TYVEK_COLORS: WristbandColor[] = [
  { name: 'White', value: '#FFFFFF' },
  { name: 'Black', value: '#0A0A0A' },
  { name: 'Silver', value: '#C0C0C0' },
  { name: 'Yellow', value: '#FFE800' },
  { name: 'Neon Yellow', value: '#E1FF00' },
  { name: 'Gold', value: '#D4AF37' },
  { name: 'Red', value: '#E4002B' },
  { name: 'Neon Red', value: '#FF3B3B' },
  { name: 'Neon Orange', value: '#FF6A13' },
  { name: 'Neon Green', value: '#4CFF4C' },
  { name: 'Green', value: '#3EA34B' },
  { name: 'Sky Blue', value: '#7FC7E8' },
  { name: 'Neon Blue', value: '#2E6BFF' },
  { name: 'Dark Blue', value: '#16307A' },
  { name: 'Aqua', value: '#37C4C4' },
  { name: 'Lavender', value: '#B57EDC' },
  { name: 'Neon Pink', value: '#FF4FC3' },
  { name: 'Purple', value: '#7B2FA0' },
];

export const TYVEK_SIZES = ['19 × 225 mm', '25 × 225 mm'];

/** Quantity tiers (per-unit EUR = USD) for the 19×225 mm size. */
export const TYVEK_TIERS_19MM = [
  { minQuantity: 500, maxQuantity: 2000, pricePerUnitUsd: 0.029, pricePerUnitEur: 0.029 },
  { minQuantity: 2001, maxQuantity: 5000, pricePerUnitUsd: 0.027, pricePerUnitEur: 0.027 },
  { minQuantity: 5001, maxQuantity: 10000, pricePerUnitUsd: 0.025, pricePerUnitEur: 0.025 },
  { minQuantity: 10001, maxQuantity: null, pricePerUnitUsd: 0.023, pricePerUnitEur: 0.023 },
];

/** Quantity tiers (per-unit EUR = USD) for the 25×225 mm size. */
export const TYVEK_TIERS_25MM = [
  { minQuantity: 500, maxQuantity: 2000, pricePerUnitUsd: 0.036, pricePerUnitEur: 0.036 },
  { minQuantity: 2001, maxQuantity: 5000, pricePerUnitUsd: 0.035, pricePerUnitEur: 0.035 },
  { minQuantity: 5001, maxQuantity: 10000, pricePerUnitUsd: 0.034, pricePerUnitEur: 0.034 },
  { minQuantity: 10001, maxQuantity: null, pricePerUnitUsd: 0.033, pricePerUnitEur: 0.033 },
];

/** The Tyvek customization options (black/full-colour print, QR serial, RFID). */
export const TYVEK_OPTIONS_PRESET = [
  {
    key: 'black_print',
    label: 'Black print (1 colour)',
    description: 'Single-colour black print of your text or artwork',
    groupName: 'Print',
    pricingMode: 'per_unit' as const,
    priceUsd: 0.01,
    priceEur: 0.01,
    priceGbp: null,
    isActive: true,
    sortOrder: 0,
    studioModule: 'print',
  },
  {
    key: 'full_color_print',
    label: 'Full-colour print (CMYK)',
    description: 'Full-colour CMYK print of your design',
    groupName: 'Print',
    pricingMode: 'per_unit' as const,
    priceUsd: 0.03,
    priceEur: 0.03,
    priceGbp: null,
    isActive: true,
    sortOrder: 1,
    studioModule: 'print',
  },
  {
    key: 'qr_code',
    label: 'QR Code Serial ID',
    description: 'Unique QR code with a serial number for easy check-in and access control',
    groupName: 'Extra services',
    pricingMode: 'per_unit' as const,
    priceUsd: 0.02,
    priceEur: 0.02,
    priceGbp: null,
    isActive: true,
    sortOrder: 2,
    studioModule: 'qr',
  },
  {
    key: 'rfid_sticker',
    label: 'RFID Sticker (Mifare / F08 / 1K)',
    description: 'Contactless RFID technology for access control, payments and tracking',
    groupName: 'Extra services',
    pricingMode: 'per_unit' as const,
    priceUsd: 0.29,
    priceEur: 0.29,
    priceGbp: null,
    isActive: true,
    sortOrder: 3,
    studioModule: 'toggle',
  },
];

/** A full product-form preset for the 19×225 mm size (the smaller/cheaper size). */
export function tyvekPreset() {
  return {
    name: 'Tyvek Wristband — 19 × 225 mm',
    wristbandType: 'tyvek',
    description:
      'TYVEK® DuPont event wristband — waterproof, comfortable and eco-friendly. 19 × 225 mm.',
    minOrderQuantity: 500,
    availableSizes: TYVEK_SIZES,
    availableColors: TYVEK_COLORS,
    pricingTiers: TYVEK_TIERS_19MM,
    options: TYVEK_OPTIONS_PRESET,
  };
}
