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

export interface IAccount {
  pubkey: string;
  serverPubkey: string;
  hostname: string;
  uuid: string;
}

export interface IClient {
  index: number;
  pubkey: string;
  username: string;
  powerLevel: number;
  userID: string;
  banned: boolean;
}

export interface IChannel {
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
  create: (name: string, privateChannel: boolean) => void;
  join: (channelID: string) => void;
  leave: (channelID: string) => void;
  delete: (channelID: string) => void;
}

interface IUserOptions {
  powerLevel?: number;
  username?: string;
}

interface IUsers {
  update: (userID: string, options: IUserOptions) => void;
  kick: (userID: string) => void;
  ban: (userID: string) => void;
}

interface IPermissions {
  create: (userID: string, channelID: string) => void;
  delete: (userID: string, channelID: string) => void;
}

export class Client extends EventEmitter {
  public channels: IChannels;
  public permissions: IPermissions;
  public messages: IMessages;
  public users: IUsers;
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
  private reconnecting: boolean;
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
    this.reconnecting = false;
    this.history = [];
    this.channelList = [];
    this.connectedChannelList = [];
    this.pingInterval = null;

    this.channels = {
      create: this.createChannel.bind(this),
      delete: this.deleteChannel.bind(this),
      join: this.joinChannel.bind(this),
      leave: this.leaveChannel.bind(this),
      retrieve: this.getChannelList.bind(this),
    };

    this.permissions = {
      create: this.grantChannel.bind(this),
      delete: this.revokeChannel.bind(this),
    };

    this.messages = {
      retrieve: this.getHistory.bind(this),
      send: this.sendMessage.bind(this),
    };

    this.users = {
      ban: this.banUser.bind(this),
      kick: this.kickUser.bind(this),
      update: this.updateUser.bind(this),
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

  private async sendMessage(channelID: string, data: string) {
    while (this.reconnecting) {
      await Utils.sleep(500);
    }

    const chatMessage = {
      channelID,
      message: data,
      method: "CREATE",
      transmissionID: uuidv4(),
      type: "chat",
    };
    this.getWs()?.send(JSON.stringify(chatMessage));
  }

  private async opUser(userID: string, powerLevel: number) {
    const opMessage = {
      method: "UPDATE",
      powerLevel,
      transmissionID: uuidv4(),
      type: "user",
      userID,
    };
    this.getWs()?.send(JSON.stringify(opMessage));
  }

  private updateUser(userID: string, values: IUserOptions) {
    const { username, powerLevel } = values;

    if (username) {
      const userMessage = {
        method: "NICK",
        transmissionID: uuidv4(),
        type: "user",
        username,
      };
      this.getWs()?.send(JSON.stringify(userMessage));
    }

    if (powerLevel) {
      this.opUser(userID, powerLevel);
    }
  }

  private createChannel(name: string, privateChannel: boolean) {
    const transmissionID = uuidv4();
    const message = {
      method: "CREATE",
      name,
      privateChannel,
      transmissionID,
      type: "channel",
    };

    this.getWs()?.send(JSON.stringify(message));
  }

  private deleteChannel(channelID: string) {
    const transmissionID = uuidv4();
    const message = {
      channelID,
      method: "DELETE",
      transmissionID,
      type: "channel",
    };
    this.getWs()?.send(JSON.stringify(message));
  }

  private grantChannel(userID: string, channelID: string) {
    const msg = {
      method: "CREATE",
      permission: {
        channelID,
        userID,
      },
      transmissionID: uuidv4(),
      type: "channelPerm",
    };
    this.getWs()?.send(JSON.stringify(msg));
  }

  private revokeChannel(userID: string, channelID: string) {
    const msg = {
      method: "DELETE",
      permission: {
        channelID,
        userID,
      },
      transmissionID: uuidv4(),
      type: "channelPerm",
    };
    this.getWs()?.send(JSON.stringify(msg));
  }

  private banUser(userID: string) {
    const kickMessage = {
      method: "BAN",
      transmissionID: uuidv4(),
      type: "user",
      userID,
    };
    this.getWs()?.send(JSON.stringify(kickMessage));
  }

  private kickUser(userID: string) {
    const kickMessage = {
      method: "KICK",
      transmissionID: uuidv4(),
      type: "user",
      userID,
    };
    this.getWs()?.send(JSON.stringify(kickMessage));
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

  private async reconnect() {
    this.reconnecting = true;
    this.authed = false;
    await Utils.sleep(5000);
    await this.init();
    if (this.account) {
      await this.auth(this.account);

      if (this.connectedChannelList.length > 0) {
        for (const id of this.connectedChannelList) {
          // i need to remove it as well
          this.connectedChannelList.splice(
            this.connectedChannelList.indexOf(id),
            1
          );
          console.log("joining channel " + id);
          this.joinChannel(id);
        }
      }
    }
    this.reconnecting = false;
  }

  private async init() {
    this.keyring.init();
    const endpoint = "/socket";
    this.ws = new WebSocket(this.getHost(true) + endpoint);

    this.getWs()!.onopen = (event: WebSocket.OpenEvent) => {
      if (!this.reconnecting) {
        this.emit("ready");
      }
    };

    this.getWs()!.onclose = async (event: WebSocket.CloseEvent) => {
      console.log("close code " + event.code);
      this.getWs()!.close();
      switch (event.code) {
        case 1006:
          console.log("reconnecting...");
          this.reconnect();
          break;
        default:
          console.log("reconnecting...");
          this.reconnect();
          break;
      }
    };

    this.getWs()!.onerror = async (event: WebSocket.ErrorEvent) => {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }
      console.warn(event.error);

      await Utils.sleep(5000);
      this.reconnect();
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
    if (this.connectedChannelList.includes(channelID)) {
      this.connectedChannelList.splice(
        this.connectedChannelList.indexOf(channelID),
        1
      );
    }
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
        case "history":
          this.history.push(jsonMessage);
          break;
        case "clientInfo":
          if (!this.authed) {
            this.authed = true;
            if (!this.pingInterval) {
              this.startPing();
            }
            this.clientInfo = jsonMessage.Client;
          }
          break;
        case "channelList":
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
      if (failedCount > 2) {
        failedCount = 0;
        this.logout();
        this.reconnect();
        return;
      }
      this.serverAlive = false;
      const pongID = uuidv4();
      this.subscribe(pongID, () => {
        this.serverAlive = true;
      });
      this.getWs()?.send(
        JSON.stringify({ type: "ping", transmissionID: pongID })
      );
    }, 10000);
  }
}
