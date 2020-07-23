// this file borrowed from vex-chat at https://github.com/ExtraHash/vex-chat

import { EventEmitter } from "events";
import fs from "fs";
import { sign, SignKeyPair } from "tweetnacl";
import { Utils } from "./utils/TypeUtils";

/**
 * @ignore
 */
const configFolder = {
  keyFolderName: "keys",
  privKey: "key.priv",
  pubKey: "key.pub",
};

// tslint:disable-next-line: interface-name
export declare interface KeyRing {
  /**
   * This is emitted whenever the keyring is done initializing. In the initialization
   * process, it will either load or create the key folder and key files at the
   * specified path.
   *
   * Example:
   *
   * ```ts
   *   keyring.on("ready", () => {
   *   const signed = keyring.sign(keyring.getPub());
   *   const verified = keyring.verify(keyring.getPub(), signed, keyring.getPub());
   *
   *   if (verified) {
   *     console.log("The signature is verified!");
   *   }
   * });
   *
   *   keyring.on("error", (error: Error) => {
   *     // do something with the error
   *   });
   * ```
   *
   * @event
   */
  on(event: "ready", callback: () => void): this;

  /**
   * This is emitted whenever the keyring experiences an error initializing.
   *
   * Example:
   *
   * ```ts
   *
   *   keyring.on("error", (error: Error) => {
   *     // do something with the error
   *   });
   * ```
   *
   * @event
   */
  on(event: "error", callback: (error: Error) => void): this;
}

/**
 * The KeyRing provides an interface that allows you to generate
 * and store a pair of ed25519 keys, as well as sign and
 * verify ed25519 signatures.
 *
 * It takes a directory as the only argument of the constructor.
 * It will create a new keyring in this directory or load the keyring
 * from the directory if it is already present.
 *
 * It also takes the special string `:memory:` as a parameter to only
 * store the keys in memory, so this module an run in a browser.
 * Make sure you provide a way for the client to export the keys and
 * cert if you do this.
 *
 * Keyrings can only be used with one coordinator. You can not connect
 * to two different  coordinators with one keyring, you must generate
 * a new keyring for each coordinator.
 *
 * Example Usage:
 *
 * ```ts
 * const keyring = new KeyRing("./keyring");
 *
 * // If you want to perform operations with the keyring, wait for the ready event.
 *   keyring.on("ready", () => {
 *   const signed = keyring.sign(keyring.getPub());
 *   const verified = keyring.verify(keyring.getPub(), signed, keyring.getPub());
 *
 *   if (verified) {
 *     console.log("The signature is verified!");
 *   }
 * });
 *
 *   keyring.on("error", (error: Error) => {
 *     // do something with the error
 *   });
 * ```
 *
 * Note that the sign() and verify() functions take uint8 arrays.
 * If you need to convert hex strings into Uint8 arrays, use the
 * helper functions in the Utils class.
 *
 * @noInheritDoc
 */
export class KeyRing extends EventEmitter {
  private signKeyPair: SignKeyPair | null;
  private keyFolder: string;
  private pubKeyFile: string;
  private privKeyFile: string;
  private memoryOnly: boolean;
  private providedKey: string | null;

  /**
   * @param keyFolder - The folder where you want the keys to be saved.
   * If the folder does not exist, it will be created.
   * Keys are saved as utf8 encoded hex strings on the disk.
   * You may use the `:memory:` string to hold the keys only in memory.
   * If using a browser, you must only use `:memory:`.
   * @param secretKey - If you are initializing a secret key you already have, input it here.
   */
  constructor(keyFolder: string, secretKey: string | null = null) {
    super();
    this.memoryOnly = keyFolder === ":memory:";
    this.init = this.init.bind(this);
    this.keyFolder = keyFolder;
    this.pubKeyFile = `${this.keyFolder}/${configFolder.pubKey}`;
    this.privKeyFile = `${this.keyFolder}/${configFolder.privKey}`;
    this.signKeyPair = null;
    this.providedKey = secretKey;
  }

  /**
   * Signs a message with the keyring private key.
   *
   * @param message - The message to sign.
   * @returns The resulting signature.
   */
  public sign(message: Uint8Array): Uint8Array {
    return sign.detached(message, this.getPriv());
  }

  /**
   * Verifies a message signature is valid for a given public key.
   *
   * @param message - The message to sign.
   * @param signature - The signature to verify.
   * @param publicKey - The public key to verify against.
   * @returns true if the signature verifies, false if it doesn't.
   */
  public verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): boolean {
    return sign.detached.verify(message, signature, publicKey);
  }

  /**
   * Get the public key.
   *
   * @returns The public key.
   */
  public getPub(): Uint8Array {
    return this.signKeyPair!.publicKey;
  }

  /**
   * Get the keyring directory path.
   *
   * @returns The key folder path.
   */
  public getKeyFolder(): string {
    return this.keyFolder;
  }

  /**
   * Re-initializes the keyring. This may be useful if you've made changes to the key files on disk and want them to update.
   */
  public init(): void {
    if (this.memoryOnly) {
      this.signKeyPair = this.providedKey
        ? sign.keyPair.fromSecretKey(Utils.fromHexString(this.providedKey))
        : sign.keyPair();

      if (!this.providedKey) {
        this.providedKey = Utils.toHexString(this.signKeyPair.secretKey);
      }

      this.emit("ready");
      return;
    }

    try {
      if (!fs.existsSync(this.keyFolder)) {
        fs.mkdirSync(this.keyFolder);
      }

      // if the private key doesn't exist
      if (!fs.existsSync(this.privKeyFile)) {
        // generate and write keys to disk
        const signingKeys = sign.keyPair();
        fs.writeFileSync(
          this.pubKeyFile,
          Utils.toHexString(signingKeys.publicKey),
          {
            encoding: "utf8",
          }
        );
        fs.writeFileSync(
          this.privKeyFile,
          Utils.toHexString(signingKeys.secretKey),
          {
            encoding: "utf8",
          }
        );
      }

      const priv = Utils.fromHexString(
        fs.readFileSync(this.privKeyFile, {
          encoding: "utf8",
        })
      );

      if (priv.length !== 64) {
        throw new Error(
          "Invalid keyfiles. Please generate new keyfiles and replace them in the signingKeys directory."
        );
      }

      const signKeyPair = sign.keyPair.fromSecretKey(priv);
      this.signKeyPair = signKeyPair;
      this.emit("ready");
    } catch (err) {
      this.emit("error", err);
    }
  }

  /**
   * Get the private key.
   *
   * @returns The public key.
   */
  public getPriv(): Uint8Array {
    return this.signKeyPair!.secretKey;
  }
}
