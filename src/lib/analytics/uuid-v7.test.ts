import { describe, expect, it } from "vitest";

import { generateUuidV7, isUuidV7 } from "./uuid-v7";

const fillWith = (value: number) => (bytes: Uint8Array<ArrayBuffer>) => {
  bytes.fill(value);
};

describe("generateUuidV7", () => {
  it("encodes the millisecond timestamp and RFC version/variant bits", () => {
    const timestamp = 1_721_234_567_890;
    const id = generateUuidV7(timestamp, fillWith(0xff));

    expect(id).toBe("0190c193-32d2-7fff-bfff-ffffffffffff");
    expect(Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16)).toBe(timestamp);
    expect(isUuidV7(id)).toBe(true);
  });

  it("rejects timestamps outside the UUID v7 48-bit field", () => {
    expect(() => generateUuidV7(-1, fillWith(0))).toThrow(RangeError);
    expect(() => generateUuidV7(2 ** 48, fillWith(0))).toThrow(RangeError);
  });
});
