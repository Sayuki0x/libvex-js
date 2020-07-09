import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { Client, IChatMessage } from "../src/Client";
import { KeyRing } from "../src/Keyring";
import { Utils } from "../src/Utils";

const keyring = new KeyRing(":memory:");

const file = fs.readFileSync("./LICENSE");

keyring.on("ready", () => {
  console.log("--------keys---------");
  console.log("PUBLIC KEY", Utils.toHexString(keyring.getPub()));
  // make sure you save your private key somewhere
  console.log("PRIVATE KEY", Utils.toHexString(keyring.getPriv()));
});

const vexClient = new Client("dev.vex.chat", keyring, null, true);

const testID = uuidv4();
console.log("TEST ID", testID);

vexClient.on("ready", async () => {
  const account = await vexClient.register();
  diagPrint("account", account);
  const serverPubkey = await vexClient.auth();
  console.log("SERVER PUBKEY", serverPubkey);

  const channelID = "191a90e6-15b7-4e40-8ae2-2cf60c3f70eb";

  await vexClient.channels.join(channelID);

  const uploadedFile = await vexClient.files.create(file, "LICENSE", channelID);
  diagPrint("file", uploadedFile);

  await vexClient.messages.send(channelID, testID);
});

vexClient.on("message", async (message: IChatMessage) => {
  diagPrint("message", message);
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
