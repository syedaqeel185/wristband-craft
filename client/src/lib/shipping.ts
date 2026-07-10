// DHL shipping cost, tiered by total order quantity (EUR).
//   up to 5,000 pcs      → €23
//   5,001 – 10,000 pcs   → €35
//   10,001 – 20,000 pcs  → €49
// Above 20,000 pcs keeps the top tier (contact for bulk quotes).
export function dhlShipping(totalQty: number): number {
  if (!totalQty || totalQty <= 0) return 0;
  if (totalQty <= 5000) return 23;
  if (totalQty <= 10000) return 35;
  return 49;
}

export function dhlTierLabel(totalQty: number): string {
  if (!totalQty || totalQty <= 0) return "";
  if (totalQty <= 5000) return "up to 5,000 pcs";
  if (totalQty <= 10000) return "5,001–10,000 pcs";
  return "10,001–20,000 pcs";
}
