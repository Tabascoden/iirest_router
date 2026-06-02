import { describe, expect, it } from "vitest";
import { splitText } from "../../src/outbound/outbound.service.js";

describe("splitText", () => {
  it("keeps short text intact", () => {
    expect(splitText("hello", 10)).toEqual(["hello"]);
  });

  it("splits long text", () => {
    expect(splitText("abcdef", 3)).toEqual(["abc", "def"]);
  });
});
