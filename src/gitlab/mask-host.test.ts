import { describe, it, expect } from "vitest";
import { createHostMask, maskHostDeep } from "./mask-host.js";

const HOST = "http://gitlab.internal:8080";
const PUBLIC = "https://gitlab.example.com";
const mask = createHostMask(HOST, PUBLIC);

describe("createHostMask", () => {
  it("is disabled when the public url is empty", () => {
    const m = createHostMask(HOST, "");
    expect(m.disabled).toBe(true);
    expect(m(`${HOST}/acme/app`)).toBe(`${HOST}/acme/app`);
  });

  it("is disabled when the public url is undefined", () => {
    expect(createHostMask(HOST, undefined).disabled).toBe(true);
  });

  it("is disabled when the public url equals the host", () => {
    expect(createHostMask(HOST, HOST).disabled).toBe(true);
  });

  it("replaces a single occurrence", () => {
    expect(mask(`${HOST}/acme/app`)).toBe(`${PUBLIC}/acme/app`);
  });

  it("replaces every occurrence, not just the first", () => {
    expect(mask(`a ${HOST}/x b ${HOST}/y`)).toBe(`a ${PUBLIC}/x b ${PUBLIC}/y`);
  });

  it("leaves a non-matching string alone", () => {
    expect(mask("https://gitlab.com/acme/app")).toBe("https://gitlab.com/acme/app");
  });

  it("matches the origin case-insensitively", () => {
    const m = createHostMask("https://GitLab.internal", PUBLIC);
    expect(m("see https://gitlab.internal/acme/app")).toBe(`see ${PUBLIC}/acme/app`);
  });

  it("matches a path prefix case-sensitively", () => {
    const m = createHostMask("https://example.com/GitLab", PUBLIC);
    expect(m("https://example.com/GitLab/acme")).toBe(`${PUBLIC}/acme`);
    expect(m("https://example.com/gitlab/acme")).toBe("https://example.com/gitlab/acme");
  });

  it("replaces the percent-encoded form too", () => {
    expect(mask("https://img.shields.io/b?url=http%3A%2F%2Fgitlab.internal%3A8080%2Fx")).toBe(
      "https://img.shields.io/b?url=https%3A%2F%2Fgitlab.example.com%2Fx",
    );
  });

  it("tolerates lowercase percent-encoding", () => {
    expect(mask("?url=http%3a%2f%2fgitlab.internal%3a8080")).toBe(
      "?url=https%3A%2F%2Fgitlab.example.com",
    );
  });

  it("tolerates trailing slashes on both inputs", () => {
    const m = createHostMask("https://gl.internal/", "https://gl.public/");
    expect(m("https://gl.internal/x")).toBe("https://gl.public/x");
  });

  it("does not match a host that is a prefix of a longer hostname", () => {
    const m = createHostMask("https://gitlab.internal", PUBLIC);
    expect(m("see https://gitlab.internal2.otherdomain.com/x")).toBe(
      "see https://gitlab.internal2.otherdomain.com/x",
    );
  });

  it("does not match a path prefix that is a prefix of a longer path segment", () => {
    const m = createHostMask("https://example.com/GitLab", PUBLIC);
    expect(m("https://example.com/GitLabExtra/x")).toBe("https://example.com/GitLabExtra/x");
  });

  it("still matches at a legitimate boundary when the host includes a port", () => {
    expect(mask(`${HOST}/x`)).toBe(`${PUBLIC}/x`);
    expect(mask(`${HOST}`)).toBe(`${PUBLIC}`);
  });

  it("inserts a public url containing $& literally, not as a replacement token", () => {
    const m = createHostMask(HOST, "https://pub.example.com/$&");
    expect(m(`${HOST}/x`)).toBe("https://pub.example.com/$&/x");
  });
});

describe("maskHostDeep", () => {
  it("walks nested objects and arrays", () => {
    const data = {
      webUrl: `${HOST}/acme/app`,
      count: 3,
      avatarUrl: null,
      assets: [{ name: "bin", url: `${HOST}/acme/app/-/releases/v1/bin` }],
    };
    expect(maskHostDeep(data, mask)).toEqual({
      webUrl: `${PUBLIC}/acme/app`,
      count: 3,
      avatarUrl: null,
      assets: [{ name: "bin", url: `${PUBLIC}/acme/app/-/releases/v1/bin` }],
    });
  });

  it("returns the same object when nothing matched", () => {
    const data = { webUrl: "https://gitlab.com/acme/app", tags: ["a"] };
    expect(maskHostDeep(data, mask)).toBe(data);
  });

  it("returns the input untouched when the mask is disabled", () => {
    const data = { webUrl: `${HOST}/x` };
    expect(maskHostDeep(data, createHostMask(HOST, ""))).toBe(data);
  });

  it("passes non-plain values through by reference", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    const out = maskHostDeep({ date, webUrl: `${HOST}/x` }, mask);
    expect(out.date).toBe(date);
    expect(out.webUrl).toBe(`${PUBLIC}/x`);
  });
});
