import { describe, expect, it } from "vitest";
import { normalizeUrl } from "@/lib/search/normalize-url";

describe("normalizeUrl", () => {
  it("strips trailing slashes from the path", () => {
    expect(normalizeUrl("https://example.com/report/")).toBe(
      "https://example.com/report",
    );
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
  });

  it("removes tracking parameters and keeps the rest", () => {
    expect(
      normalizeUrl(
        "https://example.com/a?utm_source=news&id=2&utm_medium=email",
      ),
    ).toBe("https://example.com/a?id=2");
  });

  it("sorts remaining query parameters deterministically", () => {
    expect(normalizeUrl("https://example.com/?b=2&a=1")).toBe(
      "https://example.com?a=1&b=2",
    );
  });

  it("strips the fragment", () => {
    expect(normalizeUrl("https://example.com/a#section-2")).toBe(
      "https://example.com/a",
    );
  });

  it("lowercases the host but preserves path case", () => {
    expect(normalizeUrl("HTTPS://EXAMPLE.COM/Report")).toBe(
      "https://example.com/Report",
    );
  });

  it("treats distinct paths as distinct URLs", () => {
    expect(normalizeUrl("https://example.com/a")).not.toBe(
      normalizeUrl("https://example.com/b"),
    );
  });

  it("treats different schemes as distinct URLs", () => {
    expect(normalizeUrl("http://example.com/a")).not.toBe(
      normalizeUrl("https://example.com/a"),
    );
  });

  it("returns the input unchanged for non-http URLs", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
    expect(normalizeUrl("ftp://example.com/file")).toBe(
      "ftp://example.com/file",
    );
  });
});
