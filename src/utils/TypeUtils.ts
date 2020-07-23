/**
 * The Utils class provides a few helpful type conversion functions for
 * working with ed25519 keys.
 *
 * You can convert to and from a valid hex string
 * to a Uint8 Array in order to easily work with the signatures sent from the
 * coordinator.
 *
 * Note that the methods are static so you do not need to initialize the class.
 */

export class Utils {
  /**
   * Convert hex data encoded as a Uint8 Array to string.
   *
   * @returns The converted hex string.
   */
  public static fromHexString(hexString: string): Uint8Array {
    return new Uint8Array(
      hexString.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );
  }

  /**
   * Convert a valid hex string to Uint8Array.
   *
   * @returns The converted Uint8Array.
   */
  public static toHexString(bytes: Uint8Array): string {
    return bytes.reduce(
      (str, byte) => str + byte.toString(16).padStart(2, "0"),
      ""
    );
  }

  /**
   * @ignore
   */
  public static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
