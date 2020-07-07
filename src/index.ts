import { Client } from "./Client";
import { KeyRing } from "./Keyring";
import { Utils } from "./Utils";

const keyring = new KeyRing(":memory:");

keyring.on("ready", () => {
  console.log("PUBLIC KEY:");
  console.log(Utils.toHexString(keyring.getPub()));
  console.log("PRIVATE KEY:");
  console.log(Utils.toHexString(keyring.getPriv()));
});

keyring.init();

const vexClient = new Client("localhost:8000", null, keyring, false);

vexClient.on("ready", async () => {
  const account = await vexClient.register();
  await vexClient.auth(account);
});
