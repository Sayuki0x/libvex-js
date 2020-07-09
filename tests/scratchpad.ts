import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { Client, IChatMessage } from "../src/Client";
import { KeyRing } from "../src/Keyring";
import { Utils } from "../src/Utils";

const keyring = new KeyRing("./keys");

const file = fs.readFileSync("./LICENSE");

keyring.on("ready", () => {
  console.log("--------keys---------");
  console.log("PUBLIC KEY", Utils.toHexString(keyring.getPub()));
  // make sure you save your private key somewhere
  console.log("PRIVATE KEY", Utils.toHexString(keyring.getPriv()));
});

const vexClient = new Client("localhost:8000", keyring, null, false);

const testID = uuidv4();
console.log("TEST ID", testID);

vexClient.on("ready", async () => {
  try {
    const account = await vexClient.register();
    diagPrint("account", account);
    const serverPubkey = await vexClient.auth();
    console.log("SERVER PUBKEY", serverPubkey);

    const channelID = "60d51418-6bcb-442e-a13f-92d475cf2752";

    await vexClient.channels.join(channelID);

    const uploadedFile = await vexClient.files.create(
      file,
      "LICENSE",
      channelID
    );
    diagPrint("file", uploadedFile);

    const fileList = await vexClient.files.retrieve(channelID);

    await vexClient.messages.send(channelID, testID);
  } catch (error) {
    console.warn(error);
    console.warn("Tests failed.");
    process.exit(1);
  }
});

vexClient.on("message", async (message: IChatMessage) => {
  diagPrint("message", message);
  if (message.message === testID) {
    console.log("All tests passed.");
    // process.exit(0);
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
