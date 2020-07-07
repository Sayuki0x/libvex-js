export function getEmoji(str: string) {
  switch (str) {
    case ":maple_leaf":
    case ":leaf:":
      return "🍁";
    case ":honey_pot:":
      return "🍯";
    case ":fire:":
      return "🔥";
    case ":wind_blowing:":
    case ":wind:":
      return "🌬️;";
    case ":grinning:":
      return "😀";
    case ":grin:":
      return "😁";
    case ":happy:":
      return "😃";
    case ":smile:":
      return "😄";
    case ":weary:":
      return "😩";
    case ":laughing:":
      return "😆";
    case ":crown:":
      return "👑";
    case ":middle_finger:":
      return "🖕";
    case ":muscle:":
      return "💪";
    case ":triumph:":
      return "😤";
    case ":thumbsdown:":
    case "thumbdown:":
    case ":-1:":
      return "👎";
    case ":thumbsup:":
    case ":thumbup:":
    case ":+1:":
      return "👍";
    case ":ok:":
      return "👌";
    case ":rage:":
      return "😡";
    case ":drool:":
      return "🤤";
    case ":clown:":
      return "🤡";
    case ":honk:":
      return "📯";
    case ":clap:":
      return "👏";
    case ":alien:":
      return "👽";
    case ":scream:":
      return "😱";
    case ":ghost:":
      return "👻";
    case ":sweat_drops:":
      return "💦";
    case ":poop:":
      return "💩";
    case ":tada:":
      return "🎉";
    case ":kiss:":
      return "😘";
    case ":monocle:":
      return "🧐";
    case ":wave:":
      return "👋";
    case ":sunglasses:":
      return "😎";
    case ":neutral:":
      return "😐";
    case ":rolling_eyes:":
      return "🙄";
    case ":100:":
      return "💯";
    case ":yawn:":
      return "🥱";
    case ":smirk:":
      return "😏";
    case ":frown:":
      return "☹️";
    case ":cry:":
      return "😢";
    case ":sob:":
      return "😭";
    case ":grimacing:":
      return "😬";
    case ":sweat:":
      return "😅";
    case ":slight_smile:":
      return "🙂";
    case ":heart_eyes":
      return "😍";
    case ":joy:":
      return "😂";
    case ":rofl:":
      return "🤣";
    case ":relaxed:":
      return "☺️";
    case ":upside_down:":
      return "🙃";
    case ":innocent:":
      return "😇";
    case ":blush:":
      return "😊";
    case ":wink":
      return "😉";
    default:
      return str;
  }
}
