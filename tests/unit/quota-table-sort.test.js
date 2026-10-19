// QuotaTable ordering rules: exhausted quotas (remaining 0, non-unlimited)
// always sink to the back of the list so active allowances stay on the first
// page — regardless of sort mode. Unlimited rows must NOT be treated as
// exhausted even though their computed remaining percentage is 0.
import { describe, it, expect } from "vitest";
import { sortQuotas } from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

const row = (name, remaining, extra = {}) => ({ name, remaining, ...extra });

describe("sortQuotas exhausted-last partition", () => {
  it("sinks exhausted quotas to the back in default mode, preserving order", () => {
    const rows = [
      row("Bonus Pack 1", 0),
      row("Monthly", 82),
      row("Bonus Pack 2", 0),
      row("Weekly", 15),
    ];

    const out = sortQuotas(rows, "default").map((q) => q.name);
    expect(out).toEqual(["Monthly", "Weekly", "Bonus Pack 1", "Bonus Pack 2"]);
  });

  it("sinks exhausted quotas even in remaining-asc (they would sort first)", () => {
    const rows = [row("Empty", 0), row("Low", 10), row("Full", 90)];

    const out = sortQuotas(rows, "remaining-asc").map((q) => q.name);
    expect(out).toEqual(["Low", "Full", "Empty"]);
  });

  it("keeps exhausted quotas last in remaining-desc", () => {
    const rows = [row("Full", 90), row("Empty", 0), row("Low", 10)];

    const out = sortQuotas(rows, "remaining-desc").map((q) => q.name);
    expect(out).toEqual(["Full", "Low", "Empty"]);
  });

  it("never sinks unlimited rows even when remaining percentage is 0", () => {
    const rows = [row("Unlimited", 0, { unlimited: true }), row("Empty", 0), row("Monthly", 40)];

    const out = sortQuotas(rows, "default").map((q) => q.name);
    expect(out).toEqual(["Unlimited", "Monthly", "Empty"]);
  });

  it("keeps relative order within each partition (stable)", () => {
    const rows = [
      row("E1", 0),
      row("A2", 50),
      row("A1", 50),
      row("E2", 0),
    ];

    const out = sortQuotas(rows, "default").map((q) => q.name);
    expect(out).toEqual(["A2", "A1", "E1", "E2"]);
  });
});
