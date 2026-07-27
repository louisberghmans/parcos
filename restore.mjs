import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { restoreBackup } from "./backup.mjs";

function usage() {
  return "Usage: node restore.mjs <backup.tar.gz> --target <stopped-data-directory> [--force] [--staging-dir <directory>]";
}

function parseArguments(argv) {
  const values = { archivePath: null, targetDir: null, force: false, stagingDir: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force") values.force = true;
    else if (argument === "--target") values.targetDir = argv[++index];
    else if (argument === "--staging-dir") values.stagingDir = argv[++index];
    else if (!argument.startsWith("-") && !values.archivePath) values.archivePath = argument;
    else throw new Error(usage());
  }
  if (!values.archivePath || !values.targetDir || values.targetDir.startsWith("-") || values.stagingDir?.startsWith("-")) {
    throw new Error(usage());
  }
  return values;
}

export async function runRestoreCommand(argv = process.argv.slice(2)) {
  const report = await restoreBackup(parseArguments(argv));
  process.stdout.write([
    `Restored ${report.format} (${report.applicationVersion}) into ${report.target}.`,
    `SQLite integrity: ${report.integrity}; ${report.files} files; ${report.uploads} uploads (${report.uploadSize} bytes).`,
    `Verified ${report.referencedUploads} database-referenced uploads.`,
    "",
  ].join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runRestoreCommand().catch((error) => {
    process.stderr.write(`Restore failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
