// Runs pcf-scripts for the PCF package in the current folder and fails when its build fails.
// pcf-scripts prints "[build] Failed" on an ESLint or TypeScript error but exits 0, so a lint
// error passed `pnpm run lint`, pre-commit and verify. This wrapper streams the output and
// exits 1 when the run exits non-zero or reports a failed build.
//
//   node ../../scripts/run-pcf.mjs build
import { spawn } from "node:child_process";
import { join } from "node:path";

const bin = join(process.cwd(), "node_modules", "pcf-scripts", "bin", "pcf-scripts.js");
const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], { stdio: ["inherit", "pipe", "pipe"] });

let failed = false;
const watch = (stream, sink) => {
  let tail = "";
  stream.on("data", (chunk) => {
    sink.write(chunk);
    // Keep the end of the previous chunk so a marker split across two chunks is still seen.
    const text = tail + chunk.toString();
    if (text.includes("[build] Failed")) {
      failed = true;
    }
    tail = text.slice(-64);
  });
};
watch(child.stdout, process.stdout);
watch(child.stderr, process.stderr);

child.on("close", (code) => {
  if (failed || code !== 0) {
    console.error(`run-pcf: pcf-scripts ${process.argv.slice(2).join(" ")} failed${code ? ` (exit ${code})` : ""}`);
    process.exit(1);
  }
});
