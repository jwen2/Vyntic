#!/bin/sh
set -eu

DIST_DIR="${NEXT_DIST_DIR:-.next}"
TSCONFIG_PATH="${NEXT_TSCONFIG_PATH:-.tsconfig-docker.json}"

NEXT_TSCONFIG_PATH="$TSCONFIG_PATH" node <<'NODE'
const fs = require("fs");

const tsconfigPath = process.env.NEXT_TSCONFIG_PATH || ".tsconfig-docker.json";
const config = JSON.parse(fs.readFileSync("tsconfig.json", "utf8"));

config.include = (config.include || []).filter(
  (entry) => typeof entry !== "string" || !entry.startsWith(".next")
);

fs.writeFileSync(tsconfigPath, `${JSON.stringify(config, null, 2)}\n`);
NODE

mkdir -p "$DIST_DIR"
find "$DIST_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
NEXT_TSCONFIG_PATH="$TSCONFIG_PATH" npm run build
NEXT_TSCONFIG_PATH="$TSCONFIG_PATH" npm run start -- -H 0.0.0.0
