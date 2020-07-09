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

export interface IChallenge {
  type: string;
  transmissionID: string;
  messageID?: string;
  challenge: string;
  pubkey: string;
}

export interface IResponse {
  type: string;
  transmissionID: string;
  messageID?: string;
  response: string;
  pubkey: string;
}

export interface IApiSuccess {
  type: "success";
  transmissionID: string;
  messageID: string;
  data: any;
}

export interface IApiError {
  type: "error";
  transmissionID: string;
  messageID: string;
  Code: string;
  Message: string;
  Error: Error | null;
}

export interface IApiPong {
  type: "pong";
  messageID: string;
  transmissionID: string;
}

export interface IMessage {
  index?: number;
  channelID?: string;
  method?: string;
  pubkey: string;
  type: string;
  data: any;
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
  retrieve: () => Promise<IChannel[]>;
  create: (name: string, privateChannel: boolean) => Promise<IChannel>;
  join: (channelID: string) => Promise<IChannel>;
  leave: (channelID: string) => Promise<IChannel>;
  delete: (channelID: string) => Promise<IChannel>;
}

interface IUserOptions {
  powerLevel?: number;
}

interface IUsers {
  update: (userID: string, powerLevel: number) => Promise<IClient>;
  kick: (userID: string) => Promise<IClient>;
  ban: (userID: string) => Promise<IClient>;
}

interface IPermission {
  userID: string;
  channelID: string;
  powerLevel: number;
}

interface IPermissions {
  create: (userID: string, channelID: string) => Promise<IPermission>;
  delete: (userID: string, channelID: string) => Promise<IPermission>;
}

export class Client extends EventEmitter {
  public channels: IChannels;
  public permissions: IPermissions;
  public messages: IMessages;
  public users: IUsers;
  private authed: boolean;
  private channelList: IChannel[];
  private clientInfo: IClient | null;
  private ws: WebSocket | null;
  private host: string;
  private trxSubs: ITrxSub[];
  private serverAlive: boolean;
  private keyring: KeyRing;
  private pingInterval: NodeJS.Timeout | null;
  private secure: boolean;
  private wsPrefix: string;
  private httpPrefix: string;
  private reconnecting: boolean;
  private connectedChannelList: string[];
  private history: IMessage[];
  private serverPubkey: string | null;
  private requestingHistory: boolean;

  constructor(
    host: string,
    keyring: KeyRing,
    serverPubkey: string | null,
    secure: boolean = true
  ) {
    super();
    this.secure = secure;
    this.keyring = keyring;
    this.clientInfo = null;
    this.ws = null;
    this.host = host;
    this.trxSubs = [];
    this.requestingHistory = false;
    this.serverAlive = true;
    this.authed = false;
    this.reconnecting = false;
    this.history = [];
    this.channelList = [];
    this.serverPubkey = serverPubkey;
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
      update: this.opUser.bind(this),
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

  public async register(): Promise<IClient> {
    const userAccount: IClient = await this.newUser();
    await this.registerUser(userAccount);
    return userAccount;
  }

  public info() {
    return {
      authed: this.authed,
      client: this.clientInfo,
      clientInfo: this.clientInfo,
      host: this.getHost(true),
      secure: this.secure,
    };
  }

  public async auth() {
    return this.sendChallenge();
  }

  private async sendChallenge(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(reject, 10000);

      const transmissionID = uuidv4();
      const challenge = uuidv4();
      const challengeMessage = {
        challenge,
        pubkey: Utils.toHexString(this.keyring.getPub()),
        transmissionID,
        type: "challenge",
      };

      this.subscribe(transmissionID, (msg: IMessage) => {
        if (
          this.keyring.verify(
            decodeUTF8(challenge),
            Utils.fromHexString(msg.response!),
            Utils.fromHexString(this.serverPubkey || msg.pubkey)
          )
        ) {
          if (!this.serverPubkey) {
            this.serverPubkey = msg.pubkey;
          }
          resolve(this.serverPubkey);
        } else {
          reject(new Error("Server signature did not verify!"));
        }
      });

      this.getWs()!.send(JSON.stringify(challengeMessage));
    });
  }

  private async sendMessage(channelID: string, data: string) {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const chatMessage = {
        channelID,
        message: data,
        method: "CREATE",
        transmissionID,
        type: "chat",
      };
      this.subscribe(transmissionID, (msg: IMessage) => {
        if (msg.type === "success") {
          resolve();
        } else {
          reject(msg);
        }
      });
      this.getWs()?.send(JSON.stringify(chatMessage));
    });
  }

  private async opUser(userID: string, powerLevel: number): Promise<IClient> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "UPDATE",
        powerLevel,
        transmissionID: uuidv4(),
        type: "user",
        userID,
      };

      this.subscribe(transmissionID, (msg: IMessage) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private createChannel(
    name: string,
    privateChannel: boolean
  ): Promise<IChannel> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "CREATE",
        name,
        privateChannel,
        transmissionID,
        type: "channel",
      };

      this.subscribe(transmissionID, (msg: IMessage) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private deleteChannel(channelID: string): Promise<IChannel> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        channelID,
        method: "DELETE",
        transmissionID,
        type: "channel",
      };

      this.subscribe(transmissionID, (msg: IMessage) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private grantChannel(
    userID: string,
    channelID: string
  ): Promise<IPermission> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "CREATE",
        permission: {
          channelID,
          userID,
        },
        transmissionID: uuidv4(),
        type: "channelPerm",
      };

      this.subscribe(transmissionID, (msg: IMessage) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private revokeChannel(
    userID: string,
    channelID: string
  ): Promise<IPermission> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "DELETE",
        permission: {
          channelID,
          userID,
        },
        transmissionID: uuidv4(),
        type: "channelPerm",
      };

      this.subscribe(transmissionID, (msg: IMessage) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private banUser(userID: string): Promise<IClient> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "BAN",
        transmissionID: uuidv4(),
        type: "user",
        userID,
      };

      this.subscribe(transmissionID, (msg: IMessage) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private kickUser(userID: string): Promise<IClient> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "KICK",
        transmissionID: uuidv4(),
        type: "user",
        userID,
      };

      this.subscribe(transmissionID, (msg: IMessage) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private async getHistory(
    channelID: string,
    topMessage: string = "00000000-0000-0000-0000-000000000000"
  ): Promise<IMessage[]> {
    return new Promise((resolve, reject) => {
      this.requestingHistory = true;

      const transID = uuidv4();
      const historyReqMessage = {
        channelID,
        method: "RETRIEVE",
        topMessage,
        transmissionID: transID,
        type: "historyReq_v2",
      };

      this.subscribe(transID, (msg: IMessage) => {
        if (msg.type === "success") {
          resolve(msg.data);
        } else {
          reject(msg);
        }
      });
      this.ws?.send(JSON.stringify(historyReqMessage));
    });
  }

  private joinChannel(channelID: string): Promise<IChannel> {
    return new Promise((resolve, reject) => {
      if (this.connectedChannelList.includes(channelID)) {
        resolve();
      }

      const transmissionID = uuidv4();
      const joinMsg = {
        channelID,
        method: "JOIN",
        transmissionID,
        type: "channel",
      };

      this.subscribe(transmissionID, (msg: IMessage) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(joinMsg));
    });
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
    if (this.clientInfo) {
      await this.auth();

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

    this.getWs()!.onmessage = this.handleMessage.bind(this);
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

  private leaveChannel(channelID: string): Promise<IChannel> {
    return new Promise((resolve, reject) => {
      if (this.connectedChannelList.includes(channelID)) {
        resolve();
      }

      const transmissionID = uuidv4();
      const joinMsg = {
        channelID,
        method: "LEAVE",
        transmissionID,
        type: "channel",
      };

      this.subscribe(transmissionID, (msg: IMessage) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(joinMsg));
    });
  }

  private async registerUser(user: IClient): Promise<IClient> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();

      const message = {
        method: "REGISTER",
        pubkey: Utils.toHexString(this.keyring.getPub()),
        signed: Utils.toHexString(this.keyring.sign(decodeUTF8(user.userID))),
        transmissionID,
        type: "identity",
        uuid: user.userID,
      };

      this.subscribe(transmissionID, (msg: IMessage) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          this.clientInfo = msg.data;
          resolve(msg.data);
        }
      });

      this.getWs()!.send(JSON.stringify(message));
    });
  }

  private getChannelList(): Promise<IChannel[]> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "RETRIEVE",
        transmissionID,
        type: "channel",
      };

      this.subscribe(transmissionID, (msg: IMessage) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()!.send(JSON.stringify(message));
    });
  }

  private async respondToChallenge(jsonMessage: IMessage) {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const challengeResponse = {
        pubkey: Utils.toHexString(this.keyring.getPub()),
        response: Utils.toHexString(
          this.keyring.sign(decodeUTF8(jsonMessage.challenge!))
        ),
        transmissionID,
        type: "response",
      };

      this.subscribe(transmissionID, (jMsg: IMessage) => {
        if (jMsg.type === "success") {
          this.authed = true;
          resolve();
        } else {
          reject(jMsg);
        }
      });

      this.getWs()?.send(JSON.stringify(challengeResponse));
    });
  }

  private async handleMessage(msg: WebSocket.MessageEvent) {
    try {
      const jsonMessage = JSON.parse(msg.data.toString());

      for (const sub of this.trxSubs) {
        if (sub.id === jsonMessage.transmissionID) {
          await sub.callback(jsonMessage);
          this.trxSubs.splice(this.trxSubs.indexOf(sub), 1);
          return;
        }
      }

      switch (jsonMessage.type) {
        case "history":
          this.history.push(jsonMessage);
          break;
        case "clientInfo":
          this.clientInfo = jsonMessage.Client;
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

  private async newUser(): Promise<IClient> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();

      const registerMessage = {
        method: "CREATE",
        transmissionID,
        type: "identity",
      };

      this.subscribe(transmissionID, (msg: IMessage) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

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
