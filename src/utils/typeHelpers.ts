export function fromHexString(hexString: string): Uint8Array {
  return new Uint8Array(
    hexString.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
}

export function toHexString(bytes: Uint8Array): string {
  return bytes.reduce(
    (str, byte) => str + byte.toString(16).padStart(2, "0"),
    ""
  );
}
