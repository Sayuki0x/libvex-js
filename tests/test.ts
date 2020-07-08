import { v4 as uuidv4 } from "uuid";
import { Client, IMessage } from "../src/Client";
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

const vexClient = new Client("us.vex.chat", keyring, true);

const testID = uuidv4();
console.log("TEST ID", testID);

vexClient.on("ready", async () => {
  // if you already have an account on the server
  // const account = {
  //   hostname: "localhost:8000",
  //   pubkey: "2a85171428cdd53cca062e5d75150bded69e6dd2dcbdbdb48013302c5c2fd2ed",
  //   serverPubkey: "7f2d097a0f301589970eed772fd142571b3e08c8ba9be50e3e5f07327dcc95cf",
  //   uuid: "afca0409-2cf3-4fc9-a5f9-a978c98d18d7",
  // };

  // if you don't have an account, register.
  const account = await vexClient.register();

  // tslint:disable-next-line: forin
  for (const key in account) {
    console.log(key.toUpperCase(), (account as any)[key]);
  }

  // save the account info here, you need it to log in.
  // then log in with the account
  await vexClient.auth(account);

  // next we'll join a channel
  const channelList = vexClient.channels.retrieve();
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

vexClient.on("message", async (message: IMessage) => {
  if (message.message === testID) {
    console.log("All tests successful!");
    process.exit(0);
  }
});

vexClient.on("error", (error: any) => {
  console.log(error);
});
