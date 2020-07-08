import { EventEmitter } from "events";
import WebSocket from "isomorphic-ws";
import { decodeUTF8 } from "tweetnacl-util";
import { v4 as uuidv4 } from "uuid";
import { KeyRing } from "./Keyring";
import { Utils } from "./Utils";

interface ITrxSub {
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
  index: number;
  pubkey: string;
  username: string;
  powerLevel: number;
  userID: string;
  banned: boolean;
}

interface IChannel {
  index: number;
  channelID: string;
  admin: string;
  public: boolean;
  name: string;
}

export interface IMessage {
  index?: number;
  channelID?: string;
  method?: string;
  type: string;
  message?: string;
  messageID?: string;
  transmissionID: string;
  uuid?: string;
  response?: string;
  status?: string;
  challenge?: string;
}

interface IMessages {
  retrieve: (
    channelID: string,
    lastKnownMessageID?: string
  ) => Promise<IMessage[]>;
  send: (channelID: string, data: string) => void;
}

interface IChannels {
  retrieve: () => IChannel[];
  join: (channelID: string) => void;
  leave: (channelID: string) => void;
}

export class Client extends EventEmitter {
  public channels: IChannels;
  public messages: IMessages;
  private authed: boolean;
  private channelList: IChannel[];
  private clientInfo: IClient | null;
  private account: IAccount | null;
  private ws: WebSocket | null;
  private host: string;
  private trxSubs: ITrxSub[];
  private serverAlive: boolean;
  private keyring: KeyRing;
  private pingInterval: NodeJS.Timeout | null;
  private secure: boolean;
  private wsPrefix: string;
  private httpPrefix: string;
  private challengeID: string;
  private connectedChannelList: string[];
  private history: IMessage[];
  private requestingHistory: boolean;

  constructor(host: string, keyring: KeyRing, secure: boolean = true) {
    super();
    this.secure = secure;
    this.keyring = keyring;
    this.clientInfo = null;
    this.ws = null;
    this.host = host;
    this.account = null;
    this.challengeID = uuidv4();
    this.trxSubs = [];
    this.requestingHistory = false;
    this.serverAlive = true;
    this.authed = false;
    this.history = [];
    this.channelList = [];
    this.connectedChannelList = [];
    this.pingInterval = null;

    this.channels = {
      join: this.joinChannel.bind(this),
      leave: this.leaveChannel.bind(this),
      retrieve: this.getChannelList.bind(this),
    };

    this.messages = {
      retrieve: this.getHistory.bind(this),
      send: this.sendMessage.bind(this),
    };

    if (!this.secure) {
      console.warn(
        "Warning! Insecure connections are dangerous. You should only use them for development."
      );
      this.wsPrefix = "ws://";
      this.httpPrefix = "http://";
    } else {
      this.wsPrefix = "wss://";
      this.httpPrefix = "https://";
    }

    this.init();
  }

  public logout() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.ws?.close();
  }

  public async register(): Promise<IAccount> {
    const res: any = await this.newUUID();
    const { type, uuid, transmissionID, serverPubkey } = res;

    if (type === "error") {
      console.log(res);
    } else {
      const res2: IMessage = await this.registerUUID(uuid, transmissionID);
      if (res2.status === "SUCCESS") {
        this.account = {
          hostname: this.host,
          pubkey: Utils.toHexString(this.keyring.getPub()),
          serverPubkey,
          uuid: res2.uuid!,
        };
        return this.account;
      }
    }
    throw new Error("Register error!");
  }

  public info() {
    return {
      account: this.account,
      authed: this.authed,
      clientInfo: this.clientInfo,
      host: this.getHost(true),
      secure: this.secure,
    };
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
            Utils.fromHexString(msg.response!),
            Utils.fromHexString(account.serverPubkey)
          )
        ) {
          // do nothing
        } else {
          this.getWs()!.close();
          this.emit(
            "error",
            new Error("Server sent back bad signature! Disconnected.")
          );
        }
      } catch (err) {
        this.emit("error", err);
      }
    });

    this.getWs()!.send(
      JSON.stringify({
        challenge: this.challengeID,
        pubkey: Utils.toHexString(this.keyring.getPub()),
        transmissionID,
        type: "challenge",
      })
    );

    let timeout = 1;
    while (!this.authed) {
      await Utils.sleep(timeout);
      timeout *= 2;

      if (timeout > 5000) {
        this.emit("error", new Error("Handshake never completed."));
        break;
      }
    }
  }

  private sendMessage(channelID: string, data: string) {
    const chatMessage = {
      channelID,
      message: data,
      method: "CREATE",
      transmissionID: uuidv4(),
      type: "chat",
    };
    this.getWs()?.send(JSON.stringify(chatMessage));
  }

  private async getHistory(
    channelID: string,
    topMessage: string = "00000000-0000-0000-0000-000000000000"
  ) {
    this.requestingHistory = true;

    const transID = uuidv4();
    const historyReqMessage = {
      channelID,
      method: "RETRIEVE",
      topMessage,
      transmissionID: transID,
      type: "historyReq_v2",
    };

    this.ws?.send(JSON.stringify(historyReqMessage));

    let timeout = 1;
    while (this.requestingHistory) {
      await Utils.sleep(timeout);
      timeout *= 2;
    }
    return this.history;
  }

  private joinChannel(channelID: string) {
    if (this.connectedChannelList.includes(channelID)) {
      return;
    }

    const joinChannelMsgId = uuidv4();
    const joinMsg = {
      channelID,
      method: "JOIN",
      transmissionID: joinChannelMsgId,
      type: "channel",
    };
    this.getWs()?.send(JSON.stringify(joinMsg));
  }

  private getHost(websocket: boolean): string {
    if (websocket) {
      return this.wsPrefix + this.host;
    } else {
      return this.httpPrefix + this.host;
    }
  }

  private init() {
    this.keyring.init();
    const endpoint = "/socket";
    this.ws = new WebSocket(this.getHost(true) + endpoint);

    this.getWs()!.onopen = () => {
      this.emit("ready");
    };
  }

  private getWs() {
    return this.ws;
  }

  // tslint:disable-next-line: ban-types
  private subscribe(id: string, callback: Function) {
    this.trxSubs.push({
      callback,
      id,
    });
  }

  private leaveChannel(channelID: string) {
    const leaveMsg = {
      channelID,
      method: "LEAVE",
      transmissionID: uuidv4(),
      type: "channel",
    };
    this.getWs()?.send(JSON.stringify(leaveMsg));
  }

  private registerUUID(
    uuid: string,
    transmissionID: string
  ): Promise<IMessage> {
    return new Promise((resolve, reject) => {
      const message = {
        method: "REGISTER",
        pubkey: Utils.toHexString(this.keyring.getPub()),
        signed: Utils.toHexString(this.keyring.sign(decodeUTF8(uuid))),
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

  private getChannelList() {
    return this.channelList;
  }

  private async respondToChallenge(jsonMessage: IMessage) {
    const challengeResponse = {
      pubkey: Utils.toHexString(this.keyring.getPub()),
      response: Utils.toHexString(
        this.keyring.sign(decodeUTF8(jsonMessage.challenge!))
      ),
      transmissionID: uuidv4(),
      type: "challengeRes",
    };
    this.getWs()?.send(JSON.stringify(challengeResponse));
  }

  private async handleMessage(msg: WebSocket.MessageEvent) {
    try {
      const jsonMessage = JSON.parse(msg.data.toString());

      for (const message of this.trxSubs) {
        if (message.id === jsonMessage.transmissionID) {
          if (jsonMessage.type === "error") {
            this.emit("error", jsonMessage);
            break;
          }

          await message.callback(jsonMessage);
          this.trxSubs.splice(this.trxSubs.indexOf(message), 1);
          return;
        }
      }

      switch (jsonMessage.type) {
        case "historyReqRes":
          this.requestingHistory = false;
          break;
        case "history":
          this.history.push(jsonMessage);
          break;
        case "channelLeaveMsgRes":
          if (this.connectedChannelList.includes(jsonMessage.channelID)) {
            this.connectedChannelList.splice(
              this.connectedChannelList.indexOf(jsonMessage.channelID),
              1
            );
          }
          break;
        case "channelJoinRes":
          if (jsonMessage.status === "SUCCESS") {
            this.connectedChannelList.push(jsonMessage.channelID);
          }
          break;
        case "authResult":
          if (jsonMessage.status === "SUCCESS") {
            this.authed = true;
            if (!this.pingInterval) {
              this.startPing();
            }
          }
          break;
        case "clientInfo":
          this.clientInfo = jsonMessage.client;
          break;
        case "welcomeMessage":
          break;
        case "channelListResponse":
          this.channelList = jsonMessage.channels;
          break;
        case "challenge":
          this.respondToChallenge(jsonMessage);
          break;
        case "chat":
          this.emit("message", jsonMessage);
          break;
        default:
          console.log(jsonMessage);
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
        this.logout();
        this.auth(this.account!);
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
