// The control ships the package's Fluent-token stylesheet as its css
// resource; copying at build time keeps one source of truth.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(
  here,
  "../../../packages/scheduler-ui/src/styles.css",
);
const target = join(here, "../SchedulerControl/css/SchedulerControl.css");
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log("copied scheduler-ui styles ->", target);
