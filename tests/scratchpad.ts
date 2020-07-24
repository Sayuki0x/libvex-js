import fs from "fs";
import { KeyRing, KeyRingUtils } from "libvex-keyring";
import { v4 as uuidv4 } from "uuid";
import { Client, IChatMessage, IEmoji } from "../src/Client";

const keyring = new KeyRing("./keys");

const emojiList: string[] = JSON.parse(
  fs.readFileSync("./emojis.json", { encoding: "utf8" })
);

keyring.on("ready", () => {
  console.log("--------keys---------");
  console.log("PUBLIC KEY", KeyRingUtils.encodeHex(keyring.getPub()));
  // make sure you save your private key somewhere
  console.log("PRIVATE KEY", KeyRingUtils.encodeHex(keyring.getPriv()));
});

const vexClient = new Client("us2.vex.chat", keyring, null, true);

const testID = uuidv4();
console.log("TEST ID", testID);

vexClient.on("ready", async () => {
  try {
    const account = await vexClient.register();
    await vexClient.auth();

    const results = await vexClient.emojis.retrieve("yes");
    console.log(results);
  } catch (error) {
    console.warn(error);
    console.warn("Tests failed.");
    process.exit(1);
  }
});

vexClient.on("message", async (message: IChatMessage) => {
  diagPrint("INCOMING MESSAGE", message);
  if (message.message === testID) {
    console.log("All tests passed.");
    process.exit(0);
  }
});

vexClient.on("error", (error: any) => {
  console.log(error);
});

function diagPrint(name: string, object: Record<string, any>) {
  console.log("--------" + name + "---------");
  // tslint:disable-next-line: forin
  for (const key in object) {
    console.log(key.toUpperCase(), object[key]);
  }
}
