const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_UUID_V7_TIMESTAMP = 2 ** 48;

const toHex = (value: number) => value.toString(16).padStart(2, "0");

export const isUuidV7 = (value: string): boolean => UUID_V7_PATTERN.test(value);

// UUID v7 provides a globally unique installation identifier.
// Monotonic sequencing is unnecessary because a client id is generated only once.
export const generateUuidV7 = (
  timestampMs = Date.now(),
  fillRandom: (bytes: Uint8Array<ArrayBuffer>) => void = (bytes) => {
    globalThis.crypto.getRandomValues(bytes);
  },
): string => {
  if (!Number.isInteger(timestampMs) || timestampMs < 0 || timestampMs >= MAX_UUID_V7_TIMESTAMP) {
    throw new RangeError("UUID v7 timestamp must be an unsigned 48-bit integer");
  }

  const bytes = new Uint8Array(16);
  fillRandom(bytes);
  let remainingTimestamp = timestampMs;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = remainingTimestamp % 256;
    remainingTimestamp = Math.floor(remainingTimestamp / 256);
  }

  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, toHex).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
