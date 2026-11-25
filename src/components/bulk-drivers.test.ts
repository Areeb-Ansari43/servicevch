import { describe, expect, it } from "bun:test";
import { applyRead, blankDraft, missingFor } from "./bulk-drivers";
import { assessLicenceRead } from "@/lib/driving-licence";

describe("bulk driver drafts", () => {
  it("a licence read fills name, number and expiry, without the title", () => {
    const res = assessLicenceRead(
      { surname: "FARSANG", first_names: "MR PETER ZOLTAN", expiry_date: "04.01.2028", licence_number: "FARSA803076PZ8SP", date_of_birth: "07.03.1986" },
      "2026-11-25",
    );
    const d = applyRead(blankDraft("a.jpg", null), res);
    expect(d.name).toBe("Peter Zoltan Farsang");
    expect(d.licenceNumber).toBe("FARSA803076PZ8SP");
    expect(d.licenceExpiry).toBe("2028-01-04");
    expect(d.status).toBe("read");
  });
  it("a failed read is marked so staff can type it in", () => {
    expect(applyRead(blankDraft("a.jpg", null), undefined).status).toBe("failed");
  });
  it("needs a name, a car and rent before saving", () => {
    expect(missingFor({ name: "", vehicleId: "", weeklyRent: "" })).toEqual(["name", "car", "weekly rent"]);
    expect(missingFor({ name: "A", vehicleId: "v1", weeklyRent: "200" })).toEqual([]);
  });
});
