import { PDF_FLEET } from "@/lib/pdf-fleet";
import type { PdfFleetFuelType } from "@/lib/pdf-fleet";

export type VchLetterVehicle = {
  reg: string;
  model: string;
  fuelType: PdfFleetFuelType;
  year: number;
};

/** Current fleet from VCHCarFleet01092026.pdf, shared with Permission Letters and Contracts. */
export const VCHLETTER_FLEET: VchLetterVehicle[] = PDF_FLEET.map(
  ({ registration, displayName, fuelType, year }) => ({
    reg: registration,
    model: displayName.toUpperCase(),
    fuelType,
    year,
  }),
);

export const normalizeVchReg = (value: string) => value.replace(/\s+/g, "").toUpperCase();
