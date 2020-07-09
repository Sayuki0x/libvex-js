# libvex-js

[![npm version](https://badge.fury.io/js/libvex.svg)](https://badge.fury.io/js/libvex)

a library for interacting with a vex server in javascript.

This library provides three exported classes.

- KeyRing class, which contains a pair of ed25519 keys and sign / verify methods
- Client class, which you can use to interact with the chat server
- Utils class, which contains a couple useful type conversion functions

## Install

```
yarn add libvex
```

## Documentation

You can find a link to the documentation [here](https://vex-chat.github.io/libvex-js/)

## Quickstart

```ts
import { v4 as uuidv4 } from "uuid";
import { Client, IChatMessage } from "../src/Client";
import { KeyRing } from "../src/Keyring";
import { Utils } from "../src/Utils";

const keyring = new KeyRing(":memory:");

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

  const botChannel = "c27ce1af-4b68-4d9b-aef0-8c7cb7503d5e";

  await vexClient.channels.join(botChannel);
  await vexClient.messages.send(botChannel, testID);
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
```
