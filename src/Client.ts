import { EventEmitter } from "events";
import WebSocket from "isomorphic-ws";
import { decodeUTF8 } from "tweetnacl-util";
import { v4 as uuidv4 } from "uuid";
import { KeyRing } from "./Keyring";
import { Utils } from "./Utils";

/**
 * @ignore
 */
interface ITrxSub {
  // tslint:disable-next-line: ban-types
  callback: Function;
  id: string;
}

/**
 * The IUser interface represents a user "account" on a server.
 */
export interface IUser {
  index: number;
  avatar: string;
  pubkey: string;
  username: string;
  powerLevel: number;
  userID: string;
  banned: boolean;
}

/**
 * The IUser interface represents a channel on the server.
 */
export interface IChannel {
  index: number;
  channelID: string;
  admin: string;
  public: boolean;
  name: string;
}

/**
 * The IFile interface represents file info returned from the server.
 */
export interface IFile {
  index: number;
  fileID: string;
  fileName: string;
  ownerID: string;
  url: string;
}

/**
 * The IChallenge interface represents a challenge message.
 */
export interface IChallenge {
  type: string;
  transmissionID: string;
  messageID?: string;
  challenge: string;
  pubkey: string;
}

/**
 * The IResponse interface represents a response message.
 */
export interface IResponse {
  type: string;
  transmissionID: string;
  messageID?: string;
  response: string;
  pubkey: string;
}

/**
 * The IApiSuccess interface represents a success message. The data
 * will be whatever you did the operation on, for example, with
 * a new channel operation it will return the channel.
 */
export interface IApiSuccess {
  type: "success";
  transmissionID: string;
  messageID: string;
  data: any;
}

/**
 * The IApiError interface represents an error from the API.
 */
export interface IApiError {
  type: "error";
  transmissionID: string;
  messageID: string;
  Code: string;
  Message: string;
  Error: Error | null;
}

/**
 * The IApiPong interface represents a pong message.
 */
export interface IApiPong {
  type: "pong";
  messageID: string;
  transmissionID: string;
}

/**
 * The IChatMessage interface represents a broadcasted chat message.
 */
export interface IChatMessage {
  type: "chat";
  createdAt: string;
  index: number;
  username: string;
  messageID: string;
  userID: string;
  transmissionID: string;
  method: string;
  message: string;
  channelID: string;
  author: IUser;
}

/**
 * The IPermission interface represents an access permission to a private channel.
 */
export interface IPermission {
  userID: string;
  channelID: string;
  powerLevel: number;
}

/**
 * The IClientInfo interface represents some basic info on the client.
 */
export interface IClientInfo {
  authed: boolean;
  client: IUser | null;
  host: string;
  secure: boolean;
  powerLevels: IPowerLevels;
}

/**
 * The IMessages interface contains the required power levels for
 * each action according to the server's configuration.
 */
export interface IPowerLevels {
  kick: number;
  ban: number;
  op: number;
  grant: number;
  revoke: number;
  talk: number;
  create: number;
  delete: number;
  files: number;
}

/**
 * The IMessages interface contains methods for dealing with messages.
 */
interface IMessages {
  /**
   * Retrieves history since a last known message. If no last message is supplied,
   * all history will be retrieved.
   * @param channelID - The channel's unique id.
   * @param lastKnownMessageID - The unique ID of the last known message.
   *
   * @returns - An array of the messages since the known message.
   */

  retrieve: (
    channelID: string,
    lastKnownMessageID?: string
  ) => Promise<IChatMessage[]>;
  /**
   * Sends a message to a channel.
   * @param channelID - The channel's unique id.
   * @param data - The message to send.
   */
  send: (channelID: string, data: string) => void;
}

/**
 * The IChannels interface contains methods for dealing with channels.
 */
interface IChannels {
  /**
   * Retrieves the channels in the server that you have permission to.
   *
   * @returns - An array of IChannel objects.
   */
  active: (channelID: string) => Promise<IUser[]>;
  /**
   * Retrieves the channels in the server that you have permission to.
   *
   * @returns - An array of IChannel objects.
   */
  retrieve: () => Promise<IChannel[]>;
  /**
   * Creates a new channel on the server.
   * @param name - The name of the channel.
   * @param privateChannel - Whether or not the channel is private.
   *
   * @returns - The created IChannel object.
   */
  create: (name: string, privateChannel: boolean) => Promise<IChannel>;
  /**
   * Joins a channel on the server.
   * @param channelID - The channel unique id.
   *
   * @returns - The joined IChannel object.
   */
  join: (channelID: string) => Promise<IChannel>;
  /**
   * Leaves a channel on the server you have previously joined.
   * @param channelID - The channel unique id.
   *
   * @returns - The left IChannel object.
   */
  leave: (channelID: string) => Promise<IChannel>;
  /**
   * Deletes a channel on the server.
   * @param channelID - The channel unique id.
   *
   * @returns - The deleted IChannel object.
   */
  delete: (channelID: string) => Promise<IChannel>;
}

/**
 * The IFiles interface contains methods for dealing with files.
 */
interface IFiles {
  /**
   * Uploads a file to a channel.
   * @param file - The file as a buffer or hex string.
   * @param fileName - The name of the file.
   * @param channelID - The channel to upload the file to.
   *
   * @returns - The created IFile object.
   */
  create: (
    file: Buffer | string,
    fileName: string,
    channelID: string
  ) => Promise<IFile>;
  /**
   * Retrieves files from a channel.
   * @param channelID - The channel to search for files.
   *
   * @returns - An array of IFile objects.
   */
  retrieve: (channelID: string) => Promise<IFile[]>;
  /**
   * Deletes a file from a channel.
   * @param fileID - The channel to search for files.
   *
   * @returns - The deleted IFile object.
   */
  delete: (fileID: string) => Promise<IFile>;
}

/**
 * The IUsers interface contains methods for dealing with users.
 */
interface IUsers {
  /**
   * Gets the IUser object from the user ID.
   * @param userID - The user's unique id.
   *
   * @returns - The kicked IUser object.
   */
  retrieve: (userID: string) => Promise<IUser>;
  /**
   * Updates a user's power level.
   * @param userID - The user's unique id.
   * @param powerLevel - The power level to set. Can be null to leave alone.
   * @param avatar - The avatar file ID to set. Can be null to leave alone.
   *
   * @returns - The modified IUser object.
   */
  update: (user: Partial<IUser>) => Promise<IUser>;
  /**
   * Disconnects a user temporarily from the server.
   * @param userID - The user's unique id.
   *
   * @returns - The kicked IUser object.
   */
  kick: (userID: string) => Promise<IUser>;
  /**
   * Bans a user's public key permanently from the server.
   * @param userID - The user's unique id.
   *
   * @returns - The banned IUser object.
   */
  ban: (userID: string) => Promise<IUser>;
  /**
   * Changes the nick of the currently logged in user.
   * @param nick - The nick to change to.
   *
   * @returns - The changed IUser object.
   */
  nick: (nick: string) => Promise<IUser>;
}

/**
 * The IPermissions interface contains methods for dealing with permissions.
 */
interface IPermissions {
  /**
   * Creates a new permission for a user for a private channel.
   * @param userID - The user's unique id.
   * @param channelID - The channel's unique id.
   *
   * @returns - The created IPermission object.
   */
  create: (userID: string, channelID: string) => Promise<IPermission>;
  /**
   * Retrieves a list of permissions for a given channel ID.
   * @param channelID - The channel's unique id.
   *
   * @returns - An array of IPermission objects.
   */
  retrieve: (channelID: string) => Promise<IPermission[]>;
  /**
   * Revokes a permission for a user for a private channel.
   * @param userID - The user's unique id.
   * @param channelID - The channel's unique id.
   *
   * @returns - The deleted IPermission object.
   */
  delete: (userID: string, channelID: string) => Promise<IPermission>;
}

// tslint:disable-next-line: interface-name
export declare interface Client {
  /**
   * This is emitted whenever a change happens in a peer's user info.
   * You need to update your UI with the new information.
   *
   * Example:
   *
   * ```ts
   *
   *   client.on("peerChange", (user) => {
   *     await client.register()
   *   });
   * ```
   *
   * @event
   */
  on(event: "peerChange", callback: (user: IUser) => void): this;
  /**
   * This is emitted whenever the authorization process is complete.
   *
   * Example:
   *
   * ```ts
   *
   *   client.on("authed", (user) => {
   *     // do something
   *   });
   * ```
   *
   * @event
   */
  // tslint:disable-next-line: unified-signatures
  on(event: "authed", callback: (user: IUser) => void): this;
  /**
   * This is emitted whenever the connection is re-established after a dead ping
   * or disconnect event.
   *
   * @param reconnectCount - The amount of times the client has reconnected.
   *
   * Example:
   *
   * ```ts
   *
   *   client.on("reconnect", (reconnectCount) => {
   *     // do something
   *   });
   * ```
   * @event
   */
  on(event: "reconnect", callback: (reconnectCount: number) => void): this;

  /**
   * This is emitted whenever the connection is closed. Note that the client class will
   * attempt to reconnect when this occurs.
   *
   * @param closeCode - The numerical close code for the websocket connection.
   *
   * Example:
   *
   * ```ts
   *
   *   client.on("disconnect", (reconnectCount) => {
   *     // do something
   *   });
   * ```
   * @event
   */
  // tslint:disable-next-line: unified-signatures

  on(event: "disconnect", callback: (closeCode: number) => void): this;

  /**
   * This is emitted whenever the server stops responding to the ping message. Note that the client will
   * attempt to reconnect when this occurs.
   *
   * Example:
   *
   * ```ts
   *
   *   client.on("dead_ping", (closeCode) => {
   *     // do something
   *   });
   * ```
   *
   * @event
   */
  // tslint:disable-next-line: unified-signatures

  on(event: "dead_ping", callback: () => void): this;

  /**
   * This is emitted whenever the keyring is done initializing. You must wait
   * to perform any operaitons until this event.
   *
   * Example:
   *
   * ```ts
   *
   *   client.on("ready", () => {
   *     await client.register()
   *   });
   * ```
   *
   * @event
   */
  // tslint:disable-next-line: unified-signatures
  on(event: "ready", callback: () => void): this;
  /**
   * This is emitted whenever the client experiences an error initializing.
   *
   * Example:
   *
   * ```ts
   *
   *   client.on("error", (error) => {
   *     // do something with the error
   *   });
   * ```
   *
   * @event
   */
  on(event: "error", callback: (error: Error) => void): this;

  /**
   * Messages are emitted through this event. You must join a channel
   * to get messages.
   *
   * ```ts
   *
   *   client.on("message", (message) => {
   *     console.log(message)
   *   });
   * ```
   *
   * @event
   */
  on(event: "message", callback: (message: IChatMessage) => void): this;

  /**
   * This is emitted whenever the server sends you an updated copy of your
   * user information.
   *
   * Example:
   *
   * ```ts
   *
   *   client.on("clientInfo", (userInfo) => {
   *     // update your UI with the new client info
   *   });
   * ```
   *
   * @event
   */
  on(event: "userInfo", callback: (userInfo: IUser) => void): this;

  /**
   * This is emitted whenever the server sends you an updated channel
   * list. It does this when changes are made to your available channels.
   *
   * Example:
   *
   * ```ts
   *
   *   client.on("channelList", (channelList) => {
   *     // update your UI with the new channels
   *   });
   * ```
   *
   * @event
   */
  on(event: "channelList", callback: (channelList: IChannel[]) => void): this;

  /**
   * This is emitted whenever the server sends you an updated online
   * user list for a channel.
   *
   * Example:
   *
   * ```ts
   *
   *   client.on("channelList", (channelList) => {
   *     // update your UI with the new channels
   *   });
   * ```
   *
   * @event
   */
  on(
    event: "onlineList",
    callback: (onlineList: IUser[], channelID: string) => void
  ): this;
}

/**
 * The Client provides an interface that allows you to interface with
 * a vex chat server.
 *
 * Example Usage:
 *
 * ```ts
 *   import { v4 as uuidv4 } from "uuid";
 *   import { Client, IChatMessage } from "../src/Client";
 *   import { KeyRing } from "../src/Keyring";
 *   import { Utils } from "../src/Utils";
 *
 *   const keyring = new KeyRing("./keys");
 *
 *   keyring.on("ready", () => {
 *    console.log("PUBLIC KEY", Utils.toHexString(keyring.getPub()));
 *    // make sure you save your private key somewhere
 *    console.log("PRIVATE KEY", Utils.toHexString(keyring.getPriv()));
 *   });
 *
 *   const vexClient = new Client(
 *     "localhost:8000",
 *     keyring,
 *     null,
 *     false
 *   );
 *
 *   const testID = uuidv4();
 *   console.log("TEST ID", testID);
 *
 *   vexClient.on("ready", async () => {
 *     const account = await vexClient.register()
 *
 *     // save the account info here, you need it to log in.
 *     console.log(account);
 *
 *     const serverPubkey = await vexClient.auth();
 *     console.log("SERVER PUBKEY", serverPubkey);
 *
 *
 *     // then log in with the account
 *     await vexClient.auth();
 *   });
 *
 *   vexClient.on("message", async (message: IChatMessage) => {
 *     console.log(message);
 *   });
 *
 *   vexClient.on("error", (error: any) => {
 *     console.log(error);
 *   });
 *
 * ```
 *
 * Note that the sign() and verify() functions take uint8 arrays.
 * If you need to convert hex strings into Uint8 arrays, use the
 * helper functions in the Utils class.
 *
 * @noInheritDoc
 */
export class Client extends EventEmitter {
  public channels: IChannels;
  public permissions: IPermissions;
  public messages: IMessages;
  public users: IUsers;
  public files: IFiles;
  private powerLevels: IPowerLevels;
  private onlineLists: Record<string, IUser[]>;
  private authed: boolean;
  private channelList: IChannel[];
  private userInfo: IUser | null;
  private ws: WebSocket | null;
  private host: string;
  private trxSubs: ITrxSub[];
  private serverAlive: boolean;
  private keyring: KeyRing;
  private pingInterval: NodeJS.Timeout | null;
  private secure: boolean;
  private wsPrefix: string;
  private httpPrefix: string;
  private connectedChannelList: string[];
  private history: IChatMessage[];
  private serverPubkey: string | null;
  private connectCount: number;
  private authCount: number;

  /**
   * @param host - The hostname:port of the server.
   * @param keyring - The keyring object to use to login.
   * @param serverPubKey - The server pubkey, if already known. If not, use null and save it after first login.
   * @param secure - Whether or not to use SSL. You should only disable SSL for development.
   */
  constructor(
    host: string,
    keyring: KeyRing,
    serverPubkey: string | null,
    secure: boolean = true
  ) {
    super();
    this.secure = secure;
    this.keyring = keyring;
    this.userInfo = null;
    this.connectCount = 0;
    this.ws = null;
    this.host = host;
    this.powerLevels = {
      ban: 50,
      create: 50,
      delete: 50,
      files: 25,
      grant: 50,
      kick: 25,
      op: 100,
      revoke: 50,
      talk: 0,
    };
    this.authCount = 0;
    this.trxSubs = [];
    this.serverAlive = true;
    this.authed = false;
    this.history = [];
    this.channelList = [];
    this.serverPubkey = serverPubkey;
    this.connectedChannelList = [];
    this.pingInterval = null;
    this.onlineLists = {};

    this.channels = {
      active: this.getOnlineList.bind(this),
      create: this.createChannel.bind(this),
      delete: this.deleteChannel.bind(this),
      join: this.joinChannel.bind(this),
      leave: this.leaveChannel.bind(this),
      retrieve: this.getChannelList.bind(this),
    };

    this.permissions = {
      create: this.grantChannel.bind(this),
      delete: this.revokeChannel.bind(this),
      retrieve: this.retrieveChannelPerms.bind(this),
    };

    this.messages = {
      retrieve: this.getHistory.bind(this),
      send: this.sendMessage.bind(this),
    };

    this.users = {
      ban: this.banUser.bind(this),
      kick: this.kickUser.bind(this),
      nick: this.changeNick.bind(this),
      retrieve: this.retrieveUser.bind(this),
      update: this.updateUser.bind(this),
    };

    this.files = {
      create: this.uploadFile.bind(this),
      delete: this.deleteFile.bind(this),
      retrieve: this.retrieveFiles.bind(this),
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

  /**
   * Logs out of the server.
   */
  public logout() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.ws?.close();
  }

  /**
   * Registers a new account on the server.
   *
   * @returns The new account object.
   */
  public async register(): Promise<IUser> {
    const userAccount: IUser = await this.newUser();
    await this.registerUser(userAccount);
    return userAccount;
  }

  /**
   * Returns the current host name.
   *
   * @param websocket - Whether or not you want the websocket prefix ws:// (true) or http:// (false).
   *
   * @returns The host string.
   */
  public getHost(websocket: boolean): string {
    if (websocket) {
      return this.wsPrefix + this.host;
    } else {
      return this.httpPrefix + this.host;
    }
  }

  /**
   * Returns info about the current connection.
   *
   * @returns The IClientInfo object.
   */
  public info(): IClientInfo {
    return {
      authed: this.authed,
      client: this.userInfo,
      host: this.getHost(true),
      powerLevels: this.powerLevels,
      secure: this.secure,
    };
  }

  /**
   * Performs the login handshake with the server. You must do this
   * before you can do any other operations.
   *
   * @returns The authorized account.
   */
  public async auth(): Promise<string> {
    const serverPubkey = await this.sendChallenge();
    let timeout = 1;
    while (!this.authed) {
      await Utils.sleep(timeout);
      timeout *= 2;
    }
    return serverPubkey;
  }

  private getOnlineList(channelID: string): Promise<IUser[]> {
    return new Promise((resolve, reject) => {
      if (this.onlineLists[channelID]) {
        resolve(this.onlineLists[channelID]);
      } else {
        const transmissionID = uuidv4();
        const message = {
          channelID,
          method: "ACTIVE",
          transmissionID,
          type: "channel",
        };
        this.subscribe(transmissionID, (msg: IApiError | IApiSuccess) => {
          if (msg.type === "error") {
            reject(msg);
          } else {
            resolve(msg.data);
          }
        });
        this.getWs()!.send(JSON.stringify(message));
      }
    });
  }

  private changeNick(nick: string): Promise<IUser> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "NICK",
        transmissionID,
        type: "user",
        username: nick,
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private retrieveUser(userID: string): Promise<IUser> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "RETRIEVE",
        transmissionID,
        type: "user",
        userID,
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private deleteFile(fileID: string): Promise<IFile> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        fileID,
        method: "DELETE",
        transmissionID,
        type: "file",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private retrieveFiles(channelID: string): Promise<IFile[]> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        channelID,
        method: "RETRIEVE",
        transmissionID,
        type: "file",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          const fileList: IFile[] = msg.data;
          for (const file of fileList) {
            file.url = this.getHost(false) + "/file/" + file.fileID;
          }
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private uploadFile(
    file: Buffer | string,
    fileName: string,
    channelID: string
  ): Promise<IFile> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        channelID,
        file: typeof file === "string" ? file : file.toString("hex"),
        fileName,
        method: "CREATE",
        transmissionID,
        type: "file",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          const fileDetails: IFile = msg.data;
          fileDetails.url = this.getHost(false) + "/file/" + fileDetails.fileID;
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
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

      this.subscribe(transmissionID, (msg: IResponse) => {
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
          clearTimeout(timeout);
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
      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve();
        }
      });
      this.getWs()?.send(JSON.stringify(chatMessage));
    });
  }

  private async updateUser(user: Partial<IUser>): Promise<IUser> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        avatar: user.avatar || "00000000-0000-0000-0000-000000000000",
        color: (user as any).color || (this.info().client! as any).color,
        method: "UPDATE",
        powerLevel: user.powerLevel || 0,
        transmissionID,
        type: "user",
        userID: user.userID,
        username: user.username || this.info().client!.username,
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  /**
   * Creates a new channel.
   *
   * @returns The created channel object.
   */
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

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
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

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
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
        transmissionID,
        type: "channelPerm",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private retrieveChannelPerms(channelID: string): Promise<IPermission[]> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "RETRIEVE",
        permission: {
          channelID,
        },
        transmissionID,
        type: "channelPerm",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
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
        transmissionID,
        type: "channelPerm",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private banUser(userID: string): Promise<IUser> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "BAN",
        transmissionID,
        type: "user",
        userID,
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private kickUser(userID: string): Promise<IUser> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "KICK",
        transmissionID,
        type: "user",
        userID,
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
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
  ): Promise<IChatMessage[]> {
    return new Promise((resolve, reject) => {
      const transID = uuidv4();
      const historyReqMessage = {
        channelID,
        method: "RETRIEVE",
        topMessage,
        transmissionID: transID,
        type: "historyReq",
      };

      this.subscribe(transID, (msg: IApiSuccess | IApiError) => {
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

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          this.connectedChannelList.push(msg.data.channelID);
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(joinMsg));
    });
  }
  private resetState() {
    this.trxSubs = [];
    this.serverAlive = true;
    this.authed = false;
    this.history = [];
  }

  private async init() {
    this.resetState();
    this.keyring.init();
    const endpoint = "/socket";
    this.ws = new WebSocket(this.getHost(true) + endpoint);

    this.getWs()!.onopen = async (event: WebSocket.OpenEvent) => {
      this.initPing();
      if (this.connectCount === 0) {
        this.emit("ready");
      } else {
        this.emit("reconnect", this.connectCount);
        await this.auth();
        const oldSubscriptions = this.connectedChannelList.slice();
        this.connectedChannelList = [];
        for (const id of oldSubscriptions) {
          await this.joinChannel(id);
        }
      }
      this.connectCount++;
    };

    this.getWs()!.onclose = async (event: WebSocket.CloseEvent) => {
      this.emit("disconnect", event.code);
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }
      this.getWs()!.close();
      await Utils.sleep(5000);
      this.init();
    };

    this.getWs()!.onerror = async (event: WebSocket.ErrorEvent) => {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }
      console.warn(event.error);
      this.emit("error", event.error);
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

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(joinMsg));
    });
  }

  private async registerUser(user: IUser): Promise<IUser> {
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

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          this.userInfo = msg.data;
          resolve(msg.data);
        }
      });

      this.getWs()!.send(JSON.stringify(message));
    });
  }

  private getChannelList(): Promise<IChannel[]> {
    return new Promise((resolve, reject) => {
      if (this.channelList.length > 0) {
        resolve(this.channelList);
      } else {
        const transmissionID = uuidv4();
        const message = {
          method: "RETRIEVE",
          transmissionID,
          type: "channel",
        };

        this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
          if (msg.type === "error") {
            reject(msg);
          } else {
            resolve(msg.data);
          }
        });

        this.getWs()!.send(JSON.stringify(message));
      }
    });
  }

  private async initPing() {
    let timeout = 1;
    while (!this.authed) {
      await Utils.sleep(timeout);
      timeout *= 2;
    }
    this.startPing();
  }

  private async respondToChallenge(jsonMessage: IChallenge): Promise<IUser> {
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

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          this.authed = true;
          if (this.authCount === 0) {
            this.emit("authed", msg.data);
          }
          this.authCount++;
          resolve(msg.data);
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
        case "powerLevels":
          this.powerLevels = jsonMessage.powerLevels;
          break;
        case "history":
          this.history.push(jsonMessage);
          break;
        case "clientInfo":
          this.userInfo = jsonMessage.client;
          this.emit("userInfo", this.userInfo);
          break;
        case "peerChange":
          this.emit("peerChange", jsonMessage.client);
          break;
        case "channelList":
          this.channelList = jsonMessage.data;
          this.emit("channelList", this.channelList);
          break;
        case "onlineList":
          this.onlineLists[jsonMessage.channelID] = jsonMessage.data;
          this.emit(
            "onlineList",
            this.onlineLists[jsonMessage.channelID],
            jsonMessage.channelID
          );
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

  private async newUser(): Promise<IUser> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();

      const registerMessage = {
        method: "CREATE",
        transmissionID,
        type: "identity",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
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
        console.log(
          "The server failed to respond, failedCount is now " +
            failedCount.toString()
        );
      } else {
        failedCount = 0;
        console.log(
          "The server responded, setting failedCount is now " +
            failedCount.toString()
        );
      }
      if (failedCount > 1) {
        this.emit("dead_ping");
      }
      this.serverAlive = false;
      const pongID = uuidv4();
      this.subscribe(pongID, (message: IApiPong) => {
        console.log("Received pong message" + pongID);
        this.serverAlive = true;
      });
      console.log("Sending ping message " + pongID);
      this.getWs()?.send(
        JSON.stringify({ type: "ping", transmissionID: pongID })
      );
    }, 10000);
  }
}
