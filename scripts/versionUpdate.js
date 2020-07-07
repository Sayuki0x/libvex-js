const fs = require("fs");

const packageJSON = JSON.parse(fs.readFileSync("./package.json").toString());
fs.writeFileSync(
  "./src/constants/version.ts",
  `export const version = "${packageJSON.version}";\n`
);
console.log("Version updated in constant file.");
