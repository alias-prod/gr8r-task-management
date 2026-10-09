import type { PaginationOptions } from "convex/server";
import { ConvexError } from "convex/values";

export function text(value: string, field: string, maxLength: number, allowEmpty = false) {
  const result = value.trim();
  if ((!allowEmpty && !result) || result.length > maxLength) {
    throw new ConvexError(`${field} must contain ${allowEmpty ? "0" : "1"}–${maxLength} characters.`);
  }
  return result;
}

export function date(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value) {
    throw new ConvexError("Choose a valid calendar date.");
  }
  return value;
}

export function dateRange(start: string | null, due: string | null) {
  if (start && due && start > due) {
    throw new ConvexError("The due date cannot be before the start date.");
  }
}

export function pagination(options: PaginationOptions): PaginationOptions {
  if (!Number.isInteger(options.numItems) || options.numItems < 1) {
    throw new ConvexError("Page size must be a positive integer.");
  }
  return { ...options, numItems: Math.min(options.numItems, 100) };
}
