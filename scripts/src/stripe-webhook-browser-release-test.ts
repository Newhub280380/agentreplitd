import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceDirectory = resolve(scriptsDirectory, "../..");
const testFile = resolve(workspaceDirectory, "artifacts/api-server/src/security-regression.test.ts");
const runDirectory = await mkdtemp(resolve(tmpdir(), "agent360-stripe-browser-"));
const sessionFile = process.env.STRIPE_CHECKOUT_BROWSER_SESSION_FILE ?? resolve(runDirectory, "sessions.json");
const completionFile = process.env.STRIPE_CHECKOUT_BROWSER_COMPLETION_FILE ?? resolve(runDirectory, "completed");
const failureFile = process.env.STRIPE_CHECKOUT_BROWSER_FAILURE_FILE ?? resolve(runDirectory, "failed");
const holdSeconds = process.env.STRIPE_CHECKOUT_BROWSER_HOLD_SECONDS ?? "600";

type ChildCommand = {
  command: string;
  args: string[];
};

function getChildCommand(): ChildCommand {
  const configuredCommand = process.env.STRIPE_CHECKOUT_BROWSER_RELEASE_CHILD_COMMAND;
  if (!configuredCommand) {
    return {
      command: process.execPath,
      args: ["--import", "tsx/esm", "--test", testFile],
    };
  }

  let parsedCommand: unknown;
  try {
    parsedCommand = JSON.parse(configuredCommand);
  } catch (error) {
    throw new Error(
      `STRIPE_CHECKOUT_BROWSER_RELEASE_CHILD_COMMAND must be valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (
    !parsedCommand ||
    typeof parsedCommand !== "object" ||
    typeof (parsedCommand as { command?: unknown }).command !== "string" ||
    !(parsedCommand as { command: string }).command ||
    !Array.isArray((parsedCommand as { args?: unknown }).args) ||
    !(parsedCommand as { args: unknown[] }).args.every((argument) => typeof argument === "string")
  ) {
    throw new Error(
      "STRIPE_CHECKOUT_BROWSER_RELEASE_CHILD_COMMAND must be a JSON object with a non-empty command and string args.",
    );
  }

  return parsedCommand as ChildCommand;
}

const childCommand = getChildCommand();
const child = spawn(
  childCommand.command,
  childCommand.args,
  {
    cwd: workspaceDirectory,
    env: {
      ...process.env,
      NODE_ENV: "test",
      RUN_STRIPE_WEBHOOK_REGRESSION: "true",
      STRIPE_CHECKOUT_BROWSER_HOLD_SECONDS: holdSeconds,
      STRIPE_CHECKOUT_BROWSER_SESSION_FILE: sessionFile,
      STRIPE_CHECKOUT_BROWSER_COMPLETION_FILE: completionFile,
      STRIPE_CHECKOUT_BROWSER_FAILURE_FILE: failureFile,
    },
    stdio: ["inherit", "pipe", "pipe"],
  },
);

console.log(`Stripe browser session manifest: ${sessionFile}`);
console.log(`Stripe browser completion marker: ${completionFile}`);
console.log(`Stripe browser failure marker: ${failureFile}`);
console.log(`Release gate is holding the test process for ${holdSeconds}s.`);

child.stdout.on("data", (chunk: Buffer) => process.stdout.write(chunk));
child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));

let cancellationSignal: NodeJS.Signals | undefined;
const reportCancellation = async (signal: NodeJS.Signals) => {
  if (cancellationSignal) return;
  cancellationSignal = signal;
  await mkdir(dirname(failureFile), { recursive: true });
  await writeFile(failureFile, `Release gate cancelled with ${signal}; waiting for Stripe test cleanup.`, "utf8");
  console.error(`Release gate received ${signal}; waiting for the Stripe test cleanup to finish.`);
};
process.on("SIGINT", () => void reportCancellation("SIGINT"));
process.on("SIGTERM", () => void reportCancellation("SIGTERM"));

const exitCode = await new Promise<number>((resolveExit) => {
  child.once("error", (error) => {
    console.error(`Unable to start Stripe browser regression: ${error.message}`);
    resolveExit(1);
  });
  child.once("exit", (code, signal) => {
    if (signal) {
      console.error(`Stripe browser regression exited after signal ${signal}.`);
      resolveExit(1);
    } else {
      resolveExit(code ?? 1);
    }
  });
});

const finalExitCode = cancellationSignal ? 1 : exitCode;
if (finalExitCode === 0) {
  console.log("Stripe browser release gate passed; lifecycle delivery and cleanup were verified.");
} else {
  console.error(
    cancellationSignal
      ? `Stripe browser release gate was cancelled with ${cancellationSignal}.`
      : "Stripe browser release gate failed.",
  );
}

if (!process.env.STRIPE_CHECKOUT_BROWSER_SESSION_FILE) {
  await rm(runDirectory, { recursive: true, force: true });
}

process.exitCode = finalExitCode;