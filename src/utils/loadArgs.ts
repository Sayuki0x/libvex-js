import chalk from "chalk";
import os from "os";

export function loadArgs() {
  const cliArgs = {
    http: false,
    idFolder: os.homedir() + "/.vex-chat",
  };
  for (const arg of process.argv) {
    switch (arg) {
      case "-u":
      case "--unsafe":
        console.warn(
          chalk.yellow.bold("WARNING: Insecure Connections Enabled")
        );
        console.warn(
          "Starting without ssl due to flag --unsafe. You should only do this for development.\n"
        );
        cliArgs.http = true;
        break;
      case "-i":
      case "--identity":
        const argIndex = process.argv.indexOf(arg) + 1;
        if (process.argv.length - 1 < argIndex) {
          throw new Error(
            "Must provide a pathname for identity folder after --identity / -i flag."
          );
        }
        cliArgs.idFolder = process.argv[argIndex];
      default:
        break;
    }
  }
  return cliArgs;
}
