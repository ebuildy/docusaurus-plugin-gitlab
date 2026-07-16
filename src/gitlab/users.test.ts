import { describe, it, expect } from "vitest";
import { parseShow, needsProfile, roleName, parseRole } from "./users";

describe("parseShow", () => {
  it("applies per-component defaults", () => {
    expect(parseShow(undefined, "GitlabUser")).toEqual(["org", "location", "bio", "counts", "since"]);
    expect(parseShow(undefined, "GitlabUsers")).toEqual(["role"]);
  });

  it("parses a comma-separated list, trimming whitespace", () => {
    expect(parseShow(" bio , counts ", "GitlabUser")).toEqual(["bio", "counts"]);
  });

  it("allows an empty string (identity-only card)", () => {
    expect(parseShow("", "GitlabUser")).toEqual([]);
  });

  it("rejects unknown tokens", () => {
    expect(() => parseShow("bogus", "GitlabUser")).toThrow(/"show" token "bogus"/);
  });

  it("rejects non-string values", () => {
    expect(() => parseShow(5, "GitlabUsers")).toThrow(/"show" must be a comma-separated string/);
  });

  it("rejects the role token on GitlabUser but allows it on GitlabUsers", () => {
    expect(() => parseShow("role", "GitlabUser")).toThrow(/does not support "role"/);
    expect(parseShow("role", "GitlabUsers")).toEqual(["role"]);
  });
});

describe("needsProfile", () => {
  it("is false for identity/role-only tokens", () => {
    expect(needsProfile([])).toBe(false);
    expect(needsProfile(["role"])).toBe(false);
  });

  it("is true when any profile token is present", () => {
    expect(needsProfile(["role", "bio"])).toBe(true);
    expect(needsProfile(["counts"])).toBe(true);
    expect(needsProfile(["org"])).toBe(true);
    expect(needsProfile(["since"])).toBe(true);
    expect(needsProfile(["location"])).toBe(true);
  });
});

describe("roles", () => {
  it("maps GitLab access levels to role names", () => {
    expect(roleName(5)).toBe("minimal");
    expect(roleName(10)).toBe("guest");
    expect(roleName(15)).toBe("planner");
    expect(roleName(20)).toBe("reporter");
    expect(roleName(30)).toBe("developer");
    expect(roleName(40)).toBe("maintainer");
    expect(roleName(50)).toBe("owner");
  });

  it("falls back to the numeric value for unknown levels", () => {
    expect(roleName(99)).toBe("99");
  });

  it("parseRole validates case-insensitively; undefined means no filter", () => {
    expect(parseRole(undefined)).toBeUndefined();
    expect(parseRole("Developer")).toBe("developer");
    expect(() => parseRole("boss")).toThrow(/"role" must be one of/);
  });
});
