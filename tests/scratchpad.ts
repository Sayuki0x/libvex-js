import { v4 as uuidv4 } from "uuid";
import { Client, IChatMessage } from "../src/Client";
import { KeyRing } from "../src/Keyring";
import { Utils } from "../src/Utils";

const keyring = new KeyRing("./keys");

keyring.on("ready", () => {
  console.log("--------keys---------");
  console.log("PUBLIC KEY", Utils.toHexString(keyring.getPub()));
  // make sure you save your private key somewhere
  console.log("PRIVATE KEY", Utils.toHexString(keyring.getPriv()));
});

const vexClient = new Client(
  "localhost:8000",
  keyring,
  "7f2d097a0f301589970eed772fd142571b3e08c8ba9be50e3e5f07327dcc95cf",
  false
);

const testID = uuidv4();
console.log("TEST ID", testID);

vexClient.on("ready", async () => {
  const account = {
    banned: false,
    index: 170,
    powerLevel: 0,
    userID: "4f4f11c9-42b7-4690-a6c9-966e5a33c613",
    username: "Anonymous",
  };

  diagPrint("account", account);

  const serverPubkey = await vexClient.auth();
  console.log("SERVER PUBKEY", serverPubkey);

  // save the account info here, you need it to log in.

  // then log in with the account
  await vexClient.auth();

  const channels = await vexClient.channels.retrieve();
  console.log("--------channelList---------");

  for (const channel of channels) {
    diagPrint(channel.index.toString(), channel);
  }

  await vexClient.channels.join("be87726f-e79c-48a1-aa81-eadf948f2903");
  await vexClient.messages.send("be87726f-e79c-48a1-aa81-eadf948f2903", testID);
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
