import { describe, it, expect } from "vitest";
import { toSaoPauloInput, parseSaoPauloInput, formatSaoPaulo } from "../shared/timezone";

// 2024-03-01T11:00:00Z = 2024-03-01T08:00 SP (UTC-3)
const UTC_MS = new Date("2024-03-01T11:00:00Z").getTime();
const SP_LOCAL = "2024-03-01T08:00";

describe("toSaoPauloInput", () => {
  it("converts UTC ms to São Paulo datetime-local string", () => {
    expect(toSaoPauloInput(UTC_MS)).toBe(SP_LOCAL);
  });

  it("returns empty string for null/undefined/0", () => {
    expect(toSaoPauloInput(null)).toBe("");
    expect(toSaoPauloInput(undefined)).toBe("");
    expect(toSaoPauloInput(0)).toBe("");
  });

  it("is not affected by server/browser local timezone (explicit SP)", () => {
    // 2024-06-15T15:00:00Z = 2024-06-15T12:00 SP
    const utcMs = new Date("2024-06-15T15:00:00Z").getTime();
    expect(toSaoPauloInput(utcMs)).toBe("2024-06-15T12:00");
  });
});

describe("parseSaoPauloInput", () => {
  it("parses São Paulo local string to UTC ms", () => {
    expect(parseSaoPauloInput(SP_LOCAL)).toBe(UTC_MS);
  });

  it("returns 0 for empty string", () => {
    expect(parseSaoPauloInput("")).toBe(0);
  });

  it("round-trips: parseSaoPauloInput(toSaoPauloInput(ms)) === ms", () => {
    expect(parseSaoPauloInput(toSaoPauloInput(UTC_MS))).toBe(UTC_MS);
  });
});

describe("formatSaoPaulo", () => {
  it("returns — for null/undefined/0", () => {
    expect(formatSaoPaulo(null)).toBe("—");
    expect(formatSaoPaulo(undefined)).toBe("—");
    expect(formatSaoPaulo(0)).toBe("—");
  });

  it("includes the São Paulo date in the output", () => {
    // 2024-03-01T11:00Z = 08:00 SP — date should be 01/03/2024 in pt-BR
    const result = formatSaoPaulo(UTC_MS);
    expect(result).toContain("01/03/2024");
    expect(result).toContain("08:00");
  });
});
