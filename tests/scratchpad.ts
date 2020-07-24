import fs from "fs";
import { KeyRing, KeyRingUtils } from "libvex-keyring";
import { v4 as uuidv4 } from "uuid";
import { Client, IChatMessage } from "../src/Client";

const keyring = new KeyRing("./keys");

const file = fs.readFileSync("./LICENSE");

keyring.on("ready", () => {
  console.log("--------keys---------");
  console.log("PUBLIC KEY", KeyRingUtils.encodeHex(keyring.getPub()));
  // make sure you save your private key somewhere
  console.log("PRIVATE KEY", KeyRingUtils.encodeHex(keyring.getPriv()));
});

const vexClient = new Client("localhost:8080", keyring, null, false);

const testID = uuidv4();
console.log("TEST ID", testID);

vexClient.on("ready", async () => {
  try {
    const account = await vexClient.register();
    diagPrint("ACCOUNT INFO", account);
    const serverPubkey = await vexClient.auth();
    console.log("SERVER PUBKEY", serverPubkey);

    diagPrint("CLIENT INFO", vexClient.user!);

    const channelList = await vexClient.channels.retrieve();
    console.log(channelList);

    const [channel] = channelList;

    for (const ch of channelList) {
      diagPrint("AVAILABLE CHANNEL", ch);
    }

    await vexClient.channels.join(channel.channelID);
    diagPrint("JOINED CHANNEL", channel);

    const onlineList = await vexClient.channels.active(channel.channelID);
    for (const user of onlineList) {
      diagPrint("ONLINE USER LIST", user);
    }

    const uploadedFile = await vexClient.files.create(
      file,
      "LICENSE",
      channel.channelID
    );
    diagPrint("UPLOADED FILE", uploadedFile);

    await vexClient.messages.send(channel.channelID, testID);
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
