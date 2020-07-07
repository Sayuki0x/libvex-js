import { EventEmitter } from "events";
import WebSocket from "isomorphic-ws";
import { decodeUTF8 } from "tweetnacl-util";
import { v4 as uuidv4 } from "uuid";
import { KeyRing } from "./Keyring";
import { sleep } from "./utils/sleep";
import { fromHexString, toHexString } from "./utils/typeHelpers";

interface ISubscription {
  // tslint:disable-next-line: ban-types
  callback: Function;
  id: string;
}

interface IAccount {
  pubkey: string;
  serverPubkey: string;
  hostname: string;
  uuid: string;
}

interface IClient {
  pubkey: string;
  username: string;
  powerLevel: number;
  userID: string;
}

interface IChannel {
  index: number;
  channelID: string;
  admin: string;
  public: boolean;
  name: string;
}

interface IMessage {
  method: string;
  type: string;
  messageID: string;
  transmissionID: string;
  uuid: string;
  response: string;
  status: string;
  challenge: string;
}

export class Client extends EventEmitter {
  public handshakeStatus: boolean;
  public connectedChannelId: string | null;
  public authed: boolean;
  public channelList: IChannel[];
  public user: IClient | null;
  public historyRetrieved: boolean;
  private ws: WebSocket | null;
  private host: string;
  private subscriptions: ISubscription[];
  private registered: boolean;
  private serverAlive: boolean;
  private keyring: KeyRing;
  private pingInterval: NodeJS.Timeout | null;
  private secure: boolean;
  private wsPrefix: string;
  private httpPrefix: string;
  private uuid: string | null;
  private serverPubkey: string | null;
  private challengeID: string;

  constructor(
    host: string,
    serverPubkey: string | null,
    keyring: KeyRing,
    secure: boolean = true
  ) {
    super();
    this.secure = secure;
    this.keyring = keyring;
    this.user = null;
    this.ws = null;
    this.handshakeStatus = false;
    this.registered = false;
    this.host = host;
    this.challengeID = uuidv4();
    this.connectedChannelId = null;
    this.subscriptions = [];
    this.historyRetrieved = false;
    this.serverAlive = true;
    this.authed = false;
    this.channelList = [];
    this.pingInterval = null;
    this.uuid = null;
    this.serverPubkey = serverPubkey;

    if (!this.secure) {
      console.warn(
        "Warning! Insecure connections are dangeorus. You should only use them for development."
      );
      this.wsPrefix = "ws://";
      this.httpPrefix = "http://";
    } else {
      this.wsPrefix = "wss://";
      this.httpPrefix = "https://";
    }

    this.init();
  }

  public getHost(websocket: boolean): string {
    if (websocket) {
      return this.wsPrefix + this.host;
    } else {
      return this.httpPrefix + this.host;
    }
  }

  public init() {
    const endpoint = "/socket";
    this.ws = new WebSocket(this.getHost(true) + endpoint);

    this.getWs()!.onopen = () => {
      this.emit("ready");
    };
  }

  public getWs() {
    return this.ws;
  }

  public close() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.ws?.close();
  }

  // tslint:disable-next-line: ban-types
  public subscribe(id: string, callback: Function) {
    this.subscriptions.push({
      callback,
      id,
    });
  }

  public registerUUID(uuid: string, transmissionID: string): Promise<IMessage> {
    return new Promise((resolve, reject) => {
      const message = {
        method: "REGISTER",
        pubkey: toHexString(this.keyring.getPub()),
        signed: toHexString(this.keyring.sign(decodeUTF8(uuid))),
        transmissionID,
        type: "identity",
        uuid,
      };

      this.getWs()!.onmessage = (msg: WebSocket.MessageEvent) => {
        try {
          const jsonMessage = JSON.parse(msg.data.toString());
          resolve(jsonMessage);
        } catch (err) {
          reject(err);
        }
      };

      this.getWs()!.send(JSON.stringify(message));
    });
  }

  public async register(): Promise<IAccount> {
    const res: any = await this.newUUID();
    const { type, uuid, transmissionID, serverPubkey } = res;

    if (type === "error") {
      console.log(res);
    } else {
      const res2: IMessage = await this.registerUUID(uuid, transmissionID);
      if (res2.status === "SUCCESS") {
        return {
          hostname: this.host,
          pubkey: toHexString(this.keyring.getPub()),
          serverPubkey,
          uuid: res2.uuid,
        };
      }
    }
    throw new Error("Register error!");
  }

  public getChannelList() {
    const listChannelMsgId = uuidv4();
    const msg = {
      method: "RETRIEVE",
      transmissionID: listChannelMsgId,

      type: "channel",
    };

    this.getWs()?.send(JSON.stringify(msg));
  }

  public async getHistory(
    channelID: string,
    topMessage: string = "00000000-0000-0000-0000-000000000000"
  ) {
    let t = 1;
    while (!this.authed) {
      await sleep(t);
      t *= 2;
    }

    const transID = uuidv4();
    const historyReqMessage = {
      channelID: this.connectedChannelId,
      method: "RETRIEVE",
      topMessage,
      transmissionID: transID,
      type: "historyReq",
    };

    this.ws?.send(JSON.stringify(historyReqMessage));
  }

  public async auth(account: IAccount) {
    this.getWs()!.onmessage = this.handleMessage.bind(this);


    this.challengeID = uuidv4();
    const transmissionID = uuidv4();

    this.subscribe(transmissionID, async (msg: IMessage) => {
      try {
        if (
          this.keyring.verify(
            decodeUTF8(this.challengeID),
            fromHexString(msg.response),
            fromHexString(account.serverPubkey)
          )
        ) {
          console.log("Bazinga")
          this.handshakeStatus = true;
        } else {
          console.log(
            "Server sent back bad signature! Disconnecting."
          );
          this.getWs()!.close();
        }
      } catch (err) {
        this.emit("error", err);
      }
    });

    this.getWs()!.send(
      JSON.stringify({
        challenge: this.challengeID,
        pubkey: toHexString(this.keyring.getPub()),
        transmissionID,
        type: "challenge",
      })
    );
  }

  private async handleMessage(msg: WebSocket.MessageEvent) {
    try {
      const jsonMessage = JSON.parse(msg.data.toString());

      for (const message of this.subscriptions) {
        if (message.id === jsonMessage.transmissionID) {
          if (jsonMessage.type === "error") {
            this.emit("error", jsonMessage);
            break;
          }

          await message.callback(jsonMessage);
          this.subscriptions.splice(this.subscriptions.indexOf(message), 1);
          return;
        }
      }

      switch (jsonMessage.type) {
        case "challenge":
          const challengeResponse = {
            pubkey: toHexString(this.keyring.getPub()),
            response: toHexString(
              this.keyring.sign(decodeUTF8(jsonMessage.challenge))
            ),
            transmissionID: uuidv4(),
            type: "challengeRes",
          };
          this.getWs()?.send(JSON.stringify(challengeResponse));
          break;
        default:
          console.log(jsonMessage)
          break;
      }

    } catch (err) {
      this.emit("error", err);
    }
  }

  private async newUUID(): Promise<IMessage> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();

      const registerMessage = {
        method: "CREATE",
        transmissionID,
        type: "identity",
      };

      this.getWs()!.onmessage = (msg: WebSocket.MessageEvent) => {
        try {
          const jsonMessage = JSON.parse(msg.data.toString());
          resolve(jsonMessage);
        } catch (err) {
          reject(err);
        }
      };

      this.getWs()!.send(JSON.stringify(registerMessage));
    });
  }

  private async startPing() {
    let failedCount = 0;
    this.pingInterval = setInterval(async () => {
      if (this.serverAlive !== true) {
        failedCount++;
      } else {
        failedCount = 0;
      }
      if (failedCount > 6) {
        failedCount = 0;
        this.close();
        this.emit("unresponsive", this.connectedChannelId);
        return;
      }
      this.serverAlive = false;
      const pongID = uuidv4();
      this.subscribe(pongID, () => {
        this.serverAlive = true;
      });
      this.ws?.send(JSON.stringify({ type: "ping", transmissionID: pongID }));
    }, 10000);
  }
}
