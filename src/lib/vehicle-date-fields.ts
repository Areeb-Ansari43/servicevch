type UnknownRow = Record<string, unknown>;

function firstDate(row: UnknownRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function getNextMotDate(row: UnknownRow): string {
  return firstDate(row, [
    "next_mot_date",
    "mot_expiry_date",
    "mot_due_date",
    "mot_expiry",
    "mot_date",
  ]);
}

export function getPcoExpiryDate(row: UnknownRow): string {
  return firstDate(row, [
    "pco_expiry_date",
    "pco_license_expiry_date",
    "insurance_expiry",
    "insurance_expiry_date",
    "pco_expiry",
    "pco_license_expiry",
  ]);
}
