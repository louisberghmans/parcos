# Complete backup and offline restore

ParcOS uses the versioned `parcos-backup-v1` format for complete
administrator exports. A backup is a gzip-compressed tar archive containing:

- `manifest.json`
- `parcos.db`, created with the official `node:sqlite` `backup()` API
- `uploads/` and every regular uploaded file below it

The manifest records the format and application versions, UTC creation time,
database name, upload count and size, and the size and SHA-256 checksum of every
database or upload file. Symbolic links, SQLite WAL/SHM files, deployment
configuration/environment files, temporary files, and older backups are not
included. Secrets stored inside SQLite, including the VAPID private key,
password hashes and session/token hashes, are included: protect the archive.

## Download a backup

Sign in as an administrator, open **Profile > Complete backup**, re-enter the
current administrator password, and select **Download complete backup**. The
browser downloads a name such as
`parcos-backup-2026-07-27T210000Z.tar.gz`.

The archive is highly sensitive. It contains private member details, password
hashes, garden records, and private uploaded media. Store it encrypted where
only recovery administrators can read it. Do not send it through an ordinary
chat or email attachment.

## Test a restore with local Node

Stop any ParcOS process that uses the target. Use Node 24.22.3 or newer and a new
directory that is not the production data directory.

Linux or macOS:

```sh
mkdir -p ./restore-test
node restore.mjs ./parcos-backup-2026-07-27T210000Z.tar.gz \
  --target ./restore-test/data
PARCOS_DATA_DIR="$PWD/restore-test/data" \
PARCOS_ADMIN_PASSWORD='use-the-existing-admin-password' \
PORT=18080 node server.mjs
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force .\restore-test | Out-Null
node .\restore.mjs .\parcos-backup-2026-07-27T210000Z.tar.gz `
  --target .\restore-test\data
$env:PARCOS_DATA_DIR = (Resolve-Path .\restore-test\data).Path
$env:PARCOS_ADMIN_PASSWORD = 'use-the-existing-admin-password'
$env:PORT = '18080'
node .\server.mjs
```

Open `http://127.0.0.1:18080`. Do not use the production hostname, port,
directory, volume, TLS files, or reverse-proxy configuration.

## Test a restore with Docker volumes

The one-off Compose command below runs the same offline restore utility from the
ParcOS image. It uses new named volumes and does not connect to the production
volume. A valid `.env` is still needed because Compose validates its configured
administrator password before starting a one-off command.

Linux:

```sh
docker volume create parcos-restore-test
docker volume create parcos-restore-staging
docker compose run --rm --no-deps \
  -v "$PWD/parcos-backup-2026-07-27T210000Z.tar.gz:/backup/archive.tar.gz:ro" \
  -v parcos-restore-test:/restore-target \
  -v parcos-restore-staging:/restore-staging \
  --entrypoint node parcos \
  restore.mjs /backup/archive.tar.gz --target /restore-target \
  --staging-dir /restore-staging
```

PowerShell:

```powershell
$backup = (Resolve-Path .\parcos-backup-2026-07-27T210000Z.tar.gz).Path
docker volume create parcos-restore-test
docker volume create parcos-restore-staging
docker compose run --rm --no-deps `
  -v "${backup}:/backup/archive.tar.gz:ro" `
  -v "parcos-restore-test:/restore-target" `
  -v "parcos-restore-staging:/restore-staging" `
  --entrypoint node parcos `
  restore.mjs /backup/archive.tar.gz --target /restore-target `
  --staging-dir /restore-staging
```

Build the reviewed source locally with `docker build -t parcos:restore-test .`.
Use a version compatible with the backup schema; never start an older image
against restored data from a newer schema. Start a separate hardened test
container on loopback port `18080`:

```sh
docker run --rm --name parcos-restore-test-app \
  -p 127.0.0.1:18080:3000 \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL --security-opt no-new-privileges:true \
  -e PARCOS_ADMIN_PASSWORD='use-the-existing-admin-password' \
  -v parcos-restore-test:/data \
  parcos:restore-test
```

PowerShell:

```powershell
docker run --rm --name parcos-restore-test-app `
  -p "127.0.0.1:18080:3000" `
  --read-only --tmpfs "/tmp:rw,noexec,nosuid,size=16m" `
  --cap-drop ALL --security-opt "no-new-privileges:true" `
  -e "PARCOS_ADMIN_PASSWORD=use-the-existing-admin-password" `
  -v "parcos-restore-test:/data" `
  "parcos:restore-test"
```

## Verify and remove the local copy

The restore command validates every declared size and checksum, rejects unsafe
archive entries, runs `PRAGMA integrity_check`, and verifies every upload
referenced by the database before installing data. After the local app starts:

1. Confirm `/health` returns only `{"status":"ok"}`.
2. Sign in with an existing administrator account.
3. Check the park configuration, members, areas, beds, events, translations,
   notes, activities, harvests, profile photos, bed photos, harvest photos, and
   configured application images.
4. Open representative private media and confirm its content.

Stop the local process before deletion. For the Docker test:

```sh
docker stop parcos-restore-test-app
docker volume rm parcos-restore-test parcos-restore-staging
```

For a local directory, first verify the resolved path is the disposable
`restore-test` directory, then remove only that directory:

```sh
rm -rf -- ./restore-test
```

PowerShell:

```powershell
$restorePath = (Resolve-Path .\restore-test).Path
Remove-Item -LiteralPath $restorePath -Recurse -Force
```

## Refusals, replacement, and real disaster recovery

Restore stops before writing more than 10 GiB of decompressed archive data.
Extraction checks entry lengths against the archive and caps the manifest at
16 MiB before reading it into memory, with at most 100,000 archive entries.
A rejected archive leaves the target
untouched and removes its staging files. Allow space for both the decompressed
archive and extracted files (approximately twice the expanded size), plus any
existing target data. These limits do not replace checking available disk.
For a trusted larger backup, explicitly set `--max-expanded-bytes <bytes>`;
choose a smaller limit on constrained systems. The minimum is 1024 bytes.

The restore command refuses a non-empty target by default. `--force` explicitly
authorizes replacement, but should be used only after checking the resolved
target and keeping a separate safety copy. It also refuses a target containing
the ParcOS running marker. If an unclean crash leaves that marker behind,
verify that no ParcOS process or container uses the directory before removing
the marker and retrying.

A real disaster recovery is an operator-controlled replacement, not a live
import: stop production, preserve the damaged volume, validate the backup in an
isolated location, restore into a new stopped volume, start it without the
production proxy, verify it, and only then deliberately switch the production
deployment to that replacement. ParcOS never invokes the restore command
automatically.

High availability, horizontal scaling,
distributed locking/rate limiting, media quotas and retention, live UI
restoration, and production auto-deployment remain deferred. The backup process
is single-instance and relies on the current one-container Node/SQLite
architecture.
