import { describe, expect, it } from "vitest";
import { date, dateRange, pagination, text } from "../convex/validation";

describe("backend input validation", () => {
  it("trims required text and enforces length", () => {
    expect(text("  Review release  ", "Title", 100)).toBe("Review release");
    expect(() => text("  ", "Title", 100)).toThrow("Title must contain");
    expect(() => text("x".repeat(101), "Title", 100)).toThrow("Title must contain");
  });

  it("allows an empty optional description without allowing oversized input", () => {
    expect(text("  ", "Description", 100, true)).toBe("");
    expect(() => text("x".repeat(101), "Description", 100, true)).toThrow("Description must contain");
  });

  it("accepts leap days only when the calendar date exists", () => {
    expect(date("2028-02-29")).toBe("2028-02-29");
    expect(() => date("2026-02-29")).toThrow("valid calendar date");
    expect(() => date("2026-02-30")).toThrow("valid calendar date");
    expect(() => date("2026-13-01")).toThrow("valid calendar date");
    expect(() => date("10/09/2026")).toThrow("valid calendar date");
  });

  it("normalizes missing dates to null", () => {
    expect(date(null)).toBeNull();
    expect(date(undefined)).toBeNull();
    expect(date("")).toBeNull();
  });

  it("rejects a due date before the start date", () => {
    expect(() => dateRange("2026-10-10", "2026-10-09")).toThrow("due date cannot");
    expect(() => dateRange("2026-10-09", "2026-10-09")).not.toThrow();
    expect(() => dateRange(null, "2026-10-09")).not.toThrow();
  });

  it("caps pages and rejects zero, negative, and fractional sizes", () => {
    expect(pagination({ cursor: null, numItems: 500 })).toEqual({ cursor: null, numItems: 100 });
    expect(pagination({ cursor: "next-page", numItems: 10 })).toEqual({ cursor: "next-page", numItems: 10 });
    for (const numItems of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() => pagination({ cursor: null, numItems })).toThrow("positive integer");
    }
  });
});
