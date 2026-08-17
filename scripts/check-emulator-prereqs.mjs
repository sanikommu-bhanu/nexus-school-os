// ============================================================
// Preflight for the Firestore-emulator test suites.
//
// The emulator is a Java program. Without a JDK on PATH, the failure
// surfaces from deep inside firebase-tools as an opaque spawn error
// that looks like the test suite itself is broken. This turns that
// into one clear message that says what is missing, how to get it,
// and where these tests DO run automatically.
// ============================================================
import { spawnSync } from "node:child_process";

const probe = spawnSync("java", ["-version"], { stdio: "ignore", shell: true });
const hasJava = probe.status === 0;

if (hasJava) process.exit(0);

console.error(
  `
\x1b[1m\x1b[33mFirestore emulator prerequisite missing: Java\x1b[0m

The Firestore emulator runs on the JVM, and no \`java\` was found on PATH,
so the security-rules suite cannot start on this machine.

\x1b[1mThese tests are not being skipped.\x1b[0m They run on every push and pull
request in GitHub Actions, where the runner provides a JDK:

    .github/workflows/ci.yml  ->  job "Firestore security rules"

\x1b[1mTo run them here as well, install a JDK and re-run:\x1b[0m

    Windows    winget install Microsoft.OpenJDK.17
    macOS      brew install --cask temurin
    Linux      sudo apt-get install -y default-jre

Then:

    npm run test:rules:ci

The pure-logic suite needs no JVM and runs anywhere:

    npm run test:timetable
`.trim() + "\n"
);

process.exit(1);
