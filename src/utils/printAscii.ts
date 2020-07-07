import chalk from "chalk";

export function printAscii() {
  console.log(
    chalk.green.bold(
      "\nvvvvvvv           vvvvvvv    eeeeeeeeeeee    xxxxxxx      xxxxxxx\n" +
        " v:::::v         v:::::v   ee::::::::::::ee   x:::::x    x:::::x \n" +
        "  v:::::v       v:::::v   e::::::eeeee:::::ee  x:::::x  x:::::x  \n" +
        "   v:::::v     v:::::v   e::::::e     e:::::e   x:::::xx:::::x   \n" +
        "    v:::::v   v:::::v    e:::::::eeeee::::::e    x::::::::::x    \n" +
        "     v:::::v v:::::v     e:::::::::::::::::e      x::::::::x     \n" +
        "      v:::::v:::::v      e::::::eeeeeeeeeee       x::::::::x     \n" +
        "       v:::::::::v       e:::::::e               x::::::::::x    \n" +
        "        v:::::::v        e::::::::e             x:::::xx:::::x   \n" +
        "         v:::::v          e::::::::eeeeeeee    x:::::x  x:::::x  \n" +
        "          v:::v            ee:::::::::::::e   x:::::x    x:::::x \n" +
        "           vvv               eeeeeeeeeeeeee  xxxxxxx      xxxxxxx\n"
    )
  );
}
