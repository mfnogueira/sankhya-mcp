#!/usr/bin/env node
const { spawn } = require("child_process");
const path = require("path");

const packageDir = path.join(__dirname, "..");
const serverScript = path.join(packageDir, "src", "server.py");

const proc = spawn("uv", ["run", "python", serverScript], {
  cwd: packageDir,
  stdio: "inherit",
});

proc.on("error", (err) => {
  if (err.code === "ENOENT") {
    process.stderr.write(
      "Error: 'uv' is required but not installed.\n" +
      "Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh\n"
    );
  } else {
    process.stderr.write(`Error: ${err.message}\n`);
  }
  process.exit(1);
});

proc.on("exit", (code) => process.exit(code ?? 0));
