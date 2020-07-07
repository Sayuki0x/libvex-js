import chalk from "chalk";
import { normalizeStrLen } from "./normalizeStrLen";

interface IHelpItem {
  command: string;
  description: string;
  powerLevel: number;
}

const helpItems: IHelpItem[] = [
  {
    command: "/ban <user>",
    description: "Bans the user from the server.",
    powerLevel: 50,
  },
  {
    command: "/channel ls",
    description: "List channels on the server.",
    powerLevel: 0,
  },
  {
    command: "/channel new <channel>",
    description:
      "Creates a new channel. Use " +
      chalk.bold("--private") +
      " for a private channel.",
    powerLevel: 50,
  },
  {
    command: "/close",
    description: "Close the server connection.",
    powerLevel: 0,
  },
  {
    command: "/connect <hostname>",
    description: "Connect to a server.",
    powerLevel: 0,
  },
  {
    command: "/grant <user> <channel>",
    description: "Grants user permission to channel.",
    powerLevel: 50,
  },
  {
    command: "/exit",
    description: "Exit the client.",
    powerLevel: 0,
  },
  {
    command: "/help",
    description: "Show this menu.",
    powerLevel: 0,
  },
  {
    command: "/join <#>",
    description: "Join the channel <#>.",
    powerLevel: 0,
  },
  {
    command: "/kick <user>",
    description: "Kicks the user from the server.",
    powerLevel: 50,
  },
  {
    command: "/leave",
    description: "Leaves the channel.",
    powerLevel: 0,
  },
  {
    command: "/lookup <user>",
    description: "Displays basic info on the user.",
    powerLevel: 0,
  },
  {
    command: "/license",
    description: "Prints the license.",
    powerLevel: 0,
  },
  {
    command: "/revoke <user> <channel>",
    description: "Revokes user permission to channel.",
    powerLevel: 50,
  },
  {
    command: "/upgrade",
    description: "Upgrades vex-chat.",
    powerLevel: 0,
  },
  {
    command: "/nick <nickname>",
    description: "Changes your nickname.",
    powerLevel: 0,
  },
  {
    command: "/version",
    description: "Displays current version information.",
    powerLevel: 0,
  },
];

export function printHelpItem(item: IHelpItem, powerLevel: number = 0) {
  if (item.powerLevel > powerLevel) {
    return;
  }
  console.log(normalizeStrLen(chalk.bold(item.command), 40), item.description);
}

export function printHelp(powerLevel: number = 0) {
  for (const item of helpItems) {
    printHelpItem(item, powerLevel);
  }
  console.log();
}
