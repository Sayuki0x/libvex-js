import { v4 as uuidv4 } from "uuid";
import { Client, IChatMessage } from "../src/Client";
import { KeyRing } from "../src/Keyring";
import { Utils } from "../src/Utils";

setTimeout(() => {
  console.log("Never received message. Test failed.");
  process.exit(1);
}, 10000);

const keyring = new KeyRing(":memory:");

keyring.on("ready", () => {
  console.log("PUBLIC KEY", Utils.toHexString(keyring.getPub()));
  // make sure you save your private key somewhere
  console.log("PRIVATE KEY", Utils.toHexString(keyring.getPriv()));
});

const vexClient = new Client(
  "us.vex.chat",
  keyring,
  "4a94fea243270f1d89de7dfaf5d165840798d963c056eac08fdc76b293b63411",
  true
);

const testID = uuidv4();
console.log("TEST ID", testID);

vexClient.on("ready", async () => {
  const account = await vexClient.register();

  // tslint:disable-next-line: forin
  for (const key in account) {
    console.log(key.toUpperCase(), (account as any)[key]);
  }
  // save the account info here, you need it to log in.

  // then log in with the account
  const serverPubkey = await vexClient.auth();
  console.log("SERVER PUBKEY", serverPubkey);

  // next we'll join a channel
  const channelList = await vexClient.channels.retrieve();
  if (channelList.length === 0) {
    console.log("Didn't find any channels on the server!");
  } else {
    // we'll join the first channel on the list

    for (const channel of channelList) {
      const { channelID } = channel;
      // we're connecting to the bot channel here
      if (channelID === "fba2fb45-c8a3-42dd-89d2-0a5cc1588185") {
        // joining the channel. you can join as many as you want.
        vexClient.channels.join(channelID);
        vexClient.messages.send(channelID, testID);
      }
    }
  }
});

vexClient.on("message", async (message: IChatMessage) => {
  if (message.message === testID) {
    console.log("All tests successful!");
    process.exit(0);
  }
});

vexClient.on("error", (error: any) => {
  console.log(error);
});
