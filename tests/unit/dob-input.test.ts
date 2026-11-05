import { describe, expect, it } from "vitest";
import { parseWholeDate, toIso, typePart } from "../../src/lib/dobInput";

describe("birthday boxes move on by themselves", () => {
  it("day: two digits, or one digit that can't start a day", () => {
    expect(typePart("day", "0")).toEqual({ value: "0", advance: false });
    expect(typePart("day", "04")).toEqual({ value: "04", advance: true });
    expect(typePart("day", "1")).toEqual({ value: "1", advance: false }); // could be 1x
    expect(typePart("day", "3")).toEqual({ value: "3", advance: false }); // could be 30/31
    expect(typePart("day", "4")).toEqual({ value: "04", advance: true });
    expect(typePart("day", "31")).toEqual({ value: "31", advance: true });
    expect(typePart("day", "4a")).toEqual({ value: "04", advance: true });
  });
  it("month: two digits, or one digit that can't start a month", () => {
    expect(typePart("month", "1")).toEqual({ value: "1", advance: false });
    expect(typePart("month", "11")).toEqual({ value: "11", advance: true });
    expect(typePart("month", "2")).toEqual({ value: "02", advance: true });
    expect(typePart("month", "09")).toEqual({ value: "09", advance: true });
  });
  it("year: four digits, never moves on", () => {
    expect(typePart("year", "19955")).toEqual({ value: "1995", advance: false });
  });
  it("a whole pasted or autofilled date fills all three boxes", () => {
    expect(parseWholeDate("04/11/1995")).toEqual({ day: "04", month: "11", year: "1995" });
    expect(parseWholeDate("4-1-1995")).toEqual({ day: "04", month: "01", year: "1995" });
    expect(parseWholeDate("1995-11-04")).toEqual({ day: "04", month: "11", year: "1995" });
    expect(parseWholeDate("04111995")).toEqual({ day: "04", month: "11", year: "1995" });
    expect(parseWholeDate("04")).toBeNull();
  });
  it("only real dates make an ISO date", () => {
    expect(toIso("04", "11", "1995")).toBe("1995-11-04");
    expect(toIso("31", "02", "1995")).toBeNull();
    expect(toIso("29", "02", "2000")).toBe("2000-02-29");
    expect(toIso("04", "11", "199")).toBeNull();
  });
});
