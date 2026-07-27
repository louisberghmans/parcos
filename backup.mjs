import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  closeSync,
  copyFileSync,
  cpSync,
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix, relative, resolve, sep } from "node:path";
import { finished, pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { backup, DatabaseSync } from "node:sqlite";

export const BACKUP_FORMAT = "parcos-backup-v1";
export const BACKUP_FORMAT_VERSION = 1;
export const RUNNING_MARKER = ".parcos-running.json";

function checksumFile(path) {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

function archiveTimestamp(date) {
  return date.toISOString().replace(/:/g, "").replace(/\.\d{3}Z$/, "Z");
}

function collectUploads(root) {
  const files = [];
  const walk = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const diskPath = join(directory, entry.name);
      const archivePath = posix.join("uploads", prefix, entry.name);
      if (entry.isSymbolicLink() || lstatSync(diskPath).isSymbolicLink()) {
        throw new Error("Backup cannot include symbolic links from the upload directory.");
      }
      if (entry.isDirectory()) walk(diskPath, posix.join(prefix, entry.name));
      else if (entry.isFile()) files.push({ diskPath, archivePath });
      else throw new Error("Backup encountered an unsupported upload entry.");
    }
  };
  walk(root);
  return files.sort((left, right) => left.archivePath.localeCompare(right.archivePath));
}

function tarString(buffer, value, offset, length) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > length) throw new Error(`Archive path is too long: ${value}`);
  bytes.copy(buffer, offset);
}

function tarOctal(buffer, value, offset, length) {
  const text = Math.trunc(value).toString(8).padStart(length - 1, "0");
  if (text.length >= length) throw new Error("Archive entry is too large.");
  buffer.write(`${text}\0`, offset, length, "ascii");
}

function splitTarPath(path) {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: "" };
  const parts = path.split("/");
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const prefix = parts.slice(0, index).join("/");
    const name = parts.slice(index).join("/");
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  throw new Error(`Archive path is too long: ${path}`);
}

function tarHeader(path, size, type, mtime) {
  const header = Buffer.alloc(512);
  const { name, prefix } = splitTarPath(path);
  tarString(header, name, 0, 100);
  tarOctal(header, type === "5" ? 0o755 : 0o600, 100, 8);
  tarOctal(header, 0, 108, 8);
  tarOctal(header, 0, 116, 8);
  tarOctal(header, size, 124, 12);
  tarOctal(header, Math.floor(mtime.getTime() / 1000), 136, 12);
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, "ascii");
  tarString(header, "ustar", 257, 6);
  tarString(header, "00", 263, 2);
  tarString(header, "parcos", 265, 32);
  tarString(header, "parcos", 297, 32);
  if (prefix) tarString(header, prefix, 345, 155);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return header;
}

async function writeChunk(stream, chunk) {
  if (!stream.write(chunk)) await once(stream, "drain");
}

async function createTarGzip(entries, outputPath, mtime) {
  const tarPath = `${outputPath}.tar`;
  const output = createWriteStream(tarPath, { flags: "wx", mode: 0o600 });
  try {
    for (const entry of entries) {
      const size = entry.type === "5" ? 0 : statSync(entry.source).size;
      await writeChunk(output, tarHeader(entry.path, size, entry.type, mtime));
      if (entry.type !== "5") {
        for await (const chunk of createReadStream(entry.source)) await writeChunk(output, chunk);
        const padding = (512 - (size % 512)) % 512;
        if (padding) await writeChunk(output, Buffer.alloc(padding));
      }
    }
    await writeChunk(output, Buffer.alloc(1024));
    output.end();
    await finished(output);
    await pipeline(createReadStream(tarPath), createGzip({ level: 9 }), createWriteStream(outputPath, { flags: "wx", mode: 0o600 }));
  } finally {
    output.destroy();
    rmSync(tarPath, { force: true });
  }
}

export async function createCompleteBackup({
  db,
  dataDir,
  uploadsDir,
  appVersion,
  onStaged = () => {},
  createdAt = new Date(),
}) {
  const workDir = mkdtempSync(join(dataDir, ".parcos-backup-"));
  const stageDir = join(workDir, "stage");
  const stagedUploads = join(stageDir, "uploads");
  mkdirSync(stagedUploads, { recursive: true, mode: 0o700 });
  try {
    const databasePath = join(stageDir, "parcos.db");
    await backup(db, databasePath);
    const uploads = collectUploads(uploadsDir);
    const fileRecords = [];
    const databaseStat = statSync(databasePath);
    fileRecords.push({ path: "parcos.db", size: databaseStat.size, sha256: checksumFile(databasePath) });
    let uploadSize = 0;
    for (const upload of uploads) {
      const relativeUpload = upload.archivePath.slice("uploads/".length);
      const stagedPath = join(stagedUploads, ...relativeUpload.split("/"));
      mkdirSync(dirname(stagedPath), { recursive: true, mode: 0o700 });
      copyFileSync(upload.diskPath, stagedPath);
      const size = statSync(stagedPath).size;
      uploadSize += size;
      fileRecords.push({ path: upload.archivePath, size, sha256: checksumFile(stagedPath) });
    }
    const manifest = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      application: { name: "ParcOS", version: appVersion },
      createdAt: createdAt.toISOString(),
      database: "parcos.db",
      uploads: { fileCount: uploads.length, totalSize: uploadSize },
      files: fileRecords,
    };
    const manifestPath = join(stageDir, "manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    onStaged(manifest);

    const filename = `parcos-backup-${archiveTimestamp(createdAt)}.tar.gz`;
    const archivePath = join(workDir, filename);
    const entries = [
      { path: "manifest.json", source: manifestPath, type: "0" },
      { path: "parcos.db", source: databasePath, type: "0" },
      { path: "uploads/", source: stagedUploads, type: "5" },
      ...uploads.map((upload) => ({
        path: upload.archivePath,
        source: join(stagedUploads, ...upload.archivePath.slice("uploads/".length).split("/")),
        type: "0",
      })),
    ];
    await createTarGzip(entries, archivePath, createdAt);
    return { archivePath, filename, manifest, workDir };
  } catch (error) {
    rmSync(workDir, { recursive: true, force: true });
    throw error;
  }
}

function tarText(buffer, offset, length) {
  const nul = buffer.indexOf(0, offset);
  return buffer.subarray(offset, nul >= offset && nul < offset + length ? nul : offset + length).toString("utf8");
}

function tarNumber(buffer, offset, length) {
  const value = tarText(buffer, offset, length).trim();
  if (!/^[0-7]*$/.test(value)) throw new Error("Archive contains an invalid numeric field.");
  const parsed = value ? Number.parseInt(value, 8) : 0;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Archive entry size is unsupported.");
  return parsed;
}

function validateHeaderChecksum(header) {
  const declared = tarNumber(header, 148, 8);
  const copy = Buffer.from(header);
  copy.fill(0x20, 148, 156);
  const actual = copy.reduce((sum, byte) => sum + byte, 0);
  if (declared !== actual) throw new Error("Archive header checksum is invalid.");
}

function safeArchivePath(value, directory = false) {
  const path = directory ? value.replace(/\/$/, "") : value;
  if (!path || path.includes("\\") || path.includes("\0") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) {
    throw new Error("Archive contains an unsafe path.");
  }
  const normalized = posix.normalize(path);
  if (normalized !== path || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Archive contains a path-traversal entry.");
  }
  return path;
}

function readExactly(fd, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const read = readSync(fd, buffer, offset, buffer.length - offset, position + offset);
    if (!read) throw new Error("Archive is truncated.");
    offset += read;
  }
}

function extractTar(tarPath, outputDir) {
  const fd = openSync(tarPath, "r");
  const entries = new Map();
  let position = 0;
  let zeroBlocks = 0;
  try {
    for (;;) {
      const header = Buffer.alloc(512);
      const bytesRead = readSync(fd, header, 0, 512, position);
      if (!bytesRead) break;
      if (bytesRead !== 512) throw new Error("Archive is truncated.");
      position += 512;
      if (header.every((byte) => byte === 0)) {
        zeroBlocks += 1;
        if (zeroBlocks === 2) {
          const buffer = Buffer.allocUnsafe(1024 * 1024);
          const archiveSize = statSync(tarPath).size;
          while (position < archiveSize) {
            const chunkSize = Math.min(buffer.length, archiveSize - position);
            const chunk = buffer.subarray(0, chunkSize);
            readExactly(fd, chunk, position);
            if (chunk.some((byte) => byte !== 0)) throw new Error("Archive contains data after its end marker.");
            position += chunkSize;
          }
          break;
        }
        continue;
      }
      if (zeroBlocks) throw new Error("Archive contains data after its end marker.");
      validateHeaderChecksum(header);
      const name = tarText(header, 0, 100);
      const prefix = tarText(header, 345, 155);
      const rawPath = prefix ? `${prefix}/${name}` : name;
      const type = tarText(header, 156, 1) || "0";
      if (!["0", "5"].includes(type)) throw new Error("Archive links and special entries are not supported.");
      const archivePath = safeArchivePath(rawPath, type === "5");
      if (entries.has(archivePath)) throw new Error("Archive contains duplicate entries.");
      if (!(archivePath === "manifest.json" || archivePath === "parcos.db" || archivePath === "uploads" || archivePath.startsWith("uploads/"))) {
        throw new Error("Archive contains an unexpected entry.");
      }
      if (type === "5" && archivePath !== "uploads") throw new Error("Archive contains an unexpected directory.");
      if (type === "0" && archivePath === "uploads") throw new Error("Archive uploads entry has the wrong type.");
      const size = tarNumber(header, 124, 12);
      if (type === "5" && size !== 0) throw new Error("Archive directory has an invalid size.");
      const target = resolve(outputDir, ...archivePath.split("/"));
      const safeRoot = resolve(outputDir);
      if (target !== safeRoot && !target.startsWith(`${safeRoot}${sep}`)) throw new Error("Archive contains an unsafe path.");
      if (type === "5") {
        mkdirSync(target, { recursive: true, mode: 0o700 });
      } else {
        mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
        const output = openSync(target, "wx", 0o600);
        try {
          const buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, Math.max(size, 1)));
          let remaining = size;
          let sourcePosition = position;
          while (remaining) {
            const chunkSize = Math.min(buffer.length, remaining);
            const chunk = buffer.subarray(0, chunkSize);
            readExactly(fd, chunk, sourcePosition);
            writeSync(output, chunk);
            sourcePosition += chunkSize;
            remaining -= chunkSize;
          }
        } finally {
          closeSync(output);
        }
      }
      entries.set(archivePath, { type, size });
      position += size + ((512 - (size % 512)) % 512);
    }
  } finally {
    closeSync(fd);
  }
  if (zeroBlocks < 2) throw new Error("Archive end marker is missing.");
  return entries;
}

function validatedManifest(stageDir, entries) {
  if (entries.get("manifest.json")?.type !== "0" || entries.get("parcos.db")?.type !== "0" || entries.get("uploads")?.type !== "5") {
    throw new Error("Archive is missing a required entry.");
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(stageDir, "manifest.json"), "utf8"));
  } catch {
    throw new Error("Backup manifest is invalid.");
  }
  if (manifest?.format !== BACKUP_FORMAT || manifest?.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error("Backup format is unsupported.");
  }
  const applicationVersion = String(manifest.application?.version ?? "");
  const createdAt = String(manifest.createdAt ?? "");
  if (manifest.application?.name !== "ParcOS" || !/^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/.test(applicationVersion)
    || Number.isNaN(Date.parse(createdAt)) || new Date(createdAt).toISOString() !== createdAt
    || manifest.database !== "parcos.db" || !Array.isArray(manifest.files) || !manifest.uploads) {
    throw new Error("Backup manifest is incomplete.");
  }
  const declared = new Map();
  for (const file of manifest.files) {
    const path = safeArchivePath(String(file?.path ?? ""));
    if (!(path === "parcos.db" || path.startsWith("uploads/")) || declared.has(path)) {
      throw new Error("Backup manifest declares an invalid file.");
    }
    if (!Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(String(file.sha256))) {
      throw new Error("Backup manifest contains invalid file metadata.");
    }
    declared.set(path, file);
  }
  const archiveFiles = [...entries].filter(([path, entry]) => entry.type === "0" && path !== "manifest.json");
  if (archiveFiles.length !== declared.size || archiveFiles.some(([path]) => !declared.has(path))) {
    throw new Error("Archive files do not match the manifest.");
  }
  for (const [path, file] of declared) {
    const diskPath = join(stageDir, ...path.split("/"));
    const size = statSync(diskPath).size;
    if (size !== file.size || checksumFile(diskPath) !== file.sha256) {
      throw new Error("Backup file validation failed.");
    }
  }
  const uploadFiles = [...declared.values()].filter((file) => file.path.startsWith("uploads/"));
  const uploadSize = uploadFiles.reduce((sum, file) => sum + file.size, 0);
  if (manifest.uploads.fileCount !== uploadFiles.length || manifest.uploads.totalSize !== uploadSize) {
    throw new Error("Backup upload totals do not match the manifest.");
  }
  return manifest;
}

function validateDatabase(stageDir) {
  const databasePath = join(stageDir, "parcos.db");
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const integrity = db.prepare("pragma integrity_check").all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") throw new Error("Restored SQLite integrity check failed.");
    const references = [
      ...db.prepare("select avatar_path as path from members where avatar_path is not null").all(),
      ...db.prepare("select path from bed_photos").all(),
      ...db.prepare("select path from harvest_photos").all(),
      ...db.prepare("select value as path from app_meta where key like 'branding_%'").all(),
    ];
    for (const reference of references) {
      const path = safeArchivePath(`uploads/${String(reference.path ?? "")}`).slice("uploads/".length);
      const filePath = resolve(join(stageDir, "uploads"), ...path.split("/"));
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        throw new Error("Backup is missing an uploaded file referenced by the database.");
      }
    }
    return { integrity: "ok", referencedUploads: references.length };
  } finally {
    db.close();
  }
}

function directoryEntries(path) {
  return existsSync(path) ? readdirSync(path) : [];
}

function clearDirectory(path) {
  for (const name of readdirSync(path)) rmSync(join(path, name), { recursive: true, force: true });
}

function installRestore(stageDir, targetDir, force) {
  const targetExists = existsSync(targetDir);
  const nonEmpty = targetExists && directoryEntries(targetDir).length > 0;
  if (nonEmpty && !force) throw new Error("Restore target is not empty; use --force to replace it.");
  if (!targetExists) {
    mkdirSync(dirname(targetDir), { recursive: true });
    try {
      renameSync(stageDir, targetDir);
      return;
    } catch (error) {
      if (!["EXDEV", "EBUSY", "EPERM", "EACCES"].includes(error.code)) throw error;
      mkdirSync(targetDir, { recursive: true, mode: 0o700 });
    }
  }
  if (nonEmpty) clearDirectory(targetDir);
  for (const name of ["manifest.json"]) rmSync(join(stageDir, name), { force: true });
  for (const name of readdirSync(stageDir)) cpSync(join(stageDir, name), join(targetDir, name), { recursive: true, errorOnExist: true });
}

export async function restoreBackup({
  archivePath,
  targetDir,
  force = false,
  stagingDir = null,
}) {
  const source = resolve(archivePath);
  const target = resolve(targetDir);
  if (!existsSync(source) || !statSync(source).isFile()) throw new Error("Backup archive was not found.");
  if (existsSync(join(target, RUNNING_MARKER))) throw new Error("Restore target appears to contain a running ParcOS instance.");
  if (existsSync(target) && directoryEntries(target).length > 0 && !force) {
    throw new Error("Restore target is not empty; use --force to replace it.");
  }
  const tempRoot = resolve(stagingDir ?? dirname(target) ?? tmpdir());
  mkdirSync(tempRoot, { recursive: true });
  const workDir = mkdtempSync(join(tempRoot, ".parcos-restore-"));
  const stageDir = join(workDir, "validated");
  const tarPath = join(workDir, "backup.tar");
  mkdirSync(stageDir, { mode: 0o700 });
  try {
    await pipeline(createReadStream(source), createGunzip(), createWriteStream(tarPath, { flags: "wx", mode: 0o600 }));
    const entries = extractTar(tarPath, stageDir);
    const manifest = validatedManifest(stageDir, entries);
    const database = validateDatabase(stageDir);
    rmSync(join(stageDir, "manifest.json"), { force: true });
    installRestore(stageDir, target, force);
    rmSync(join(target, "parcos.db-wal"), { force: true });
    rmSync(join(target, "parcos.db-shm"), { force: true });
    return {
      format: manifest.format,
      createdAt: manifest.createdAt,
      applicationVersion: manifest.application?.version ?? "unknown",
      files: manifest.files.length,
      uploads: manifest.uploads.fileCount,
      uploadSize: manifest.uploads.totalSize,
      integrity: database.integrity,
      referencedUploads: database.referencedUploads,
      target: basename(target),
    };
  } catch (error) {
    if (error?.code === "Z_DATA_ERROR" || error?.code === "Z_BUF_ERROR") throw new Error("Backup archive is not a valid gzip file.");
    throw error;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
