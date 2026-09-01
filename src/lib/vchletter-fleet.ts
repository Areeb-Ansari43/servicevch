import { PDF_FLEET } from "@/lib/pdf-fleet";

export type VchLetterVehicle = { reg: string; model: string };

/** Current fleet from VCHCarFleet01092026.pdf, shared with Permission Letters and Contracts. */
export const VCHLETTER_FLEET: VchLetterVehicle[] = PDF_FLEET.map(
  ({ registration, displayName }) => ({
    reg: registration,
    model: displayName.toUpperCase(),
  }),
);

export const normalizeVchReg = (value: string) => value.replace(/\s+/g, "").toUpperCase();
