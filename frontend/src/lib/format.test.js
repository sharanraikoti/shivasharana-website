import { describe, expect, it } from "vitest";
import { filterRows, fullAddress, sortRows } from "./format";

const rows = [
  { name: "Paracetamol", strength: "500 mg", quantity: 10, expiry_date: "2027-01-01", batch_no: "A1" },
  { name: "cetirizine", strength: "10 mg", quantity: null, expiry_date: null, batch_no: null },
  { name: "Amoxicillin", strength: "500 mg", quantity: 40, expiry_date: "2026-11-30", batch_no: "B7" },
];

describe("stock table helpers", () => {
  it("sorts by name ignoring case", () => {
    expect(sortRows(rows, "name").map((r) => r.name)).toEqual(["Amoxicillin", "cetirizine", "Paracetamol"]);
    expect(sortRows(rows, "name", "desc")[0].name).toBe("Paracetamol");
  });
  it("puts missing quantity and expiry last in both directions", () => {
    expect(sortRows(rows, "quantity").map((r) => r.quantity)).toEqual([10, 40, null]);
    expect(sortRows(rows, "quantity", "desc").map((r) => r.quantity)).toEqual([40, 10, null]);
    expect(sortRows(rows, "expiry").at(-1).expiry_date).toBeNull();
  });
  it("searches name, strength and batch", () => {
    expect(filterRows(rows, "500").length).toBe(2);
    expect(filterRows(rows, "b7")[0].name).toBe("Amoxicillin");
    expect(filterRows(rows, "  ").length).toBe(3);
  });
  it("builds an address without empty parts", () => {
    expect(fullAddress({ address_line1: "12 Main Rd", city: "Bengaluru", state: "Karnataka", pincode: "560001" })).toBe(
      "12 Main Rd, Bengaluru, Karnataka 560001"
    );
    expect(fullAddress({})).toBe("");
  });
});
