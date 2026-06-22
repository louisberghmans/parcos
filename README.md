# ParcOS

ParcOS is a private, mobile-first operating app for community parks and gardens.
It packages member access, invitations, account recovery, managed areas, garden
beds and photos, events, attendance, and coordinator workflows into one small
self-hosted container.

## Quick start

Create a `.env` file:

```dotenv
PARCOS_ADMIN_USERNAME=admin
PARCOS_ADMIN_PASSWORD=replace-with-a-unique-password-of-12-or-more-characters
PARCOS_PORT=8080
```

Then start the published image:

```sh
docker compose pull
docker compose up -d
```

Open `http://YOUR-SERVER:8080`, sign in as the administrator, and complete the
one-time setup wizard. It asks for the park name and the areas you want to
manage. The image is available as `ghcr.io/louisberghmans/parcos:1.0.0` and
`ghcr.io/louisberghmans/parcos:latest` for amd64 and arm64.

To build locally instead:

```sh
docker compose build
docker compose up -d
```

## Production deployment

Put ParcOS behind an HTTPS reverse proxy and set:

```dotenv
PARCOS_BASE_URL=https://parcos.example.org
PARCOS_COOKIE_SECURE=true
PARCOS_TRUST_PROXY=true
```

Only enable proxy trust when the app port is reachable exclusively through that
proxy. The Compose service runs read-only, without Linux capabilities or new
privileges; only `/data` is writable.

## Data and backups

The `parcos-data` volume stores `parcos.db` and private uploaded photos. Stop the
service before taking a filesystem-level backup:

```sh
docker compose stop
docker run --rm -v parcos_parcos-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/parcos-backup.tgz -C /data .
docker compose start
```

Restore only into the same or a newer ParcOS version. Protect backups as
sensitive member data.

## Development

ParcOS has no third-party runtime dependencies and uses Node's built-in SQLite:

```sh
PARCOS_ADMIN_PASSWORD=a-long-local-password npm start
npm test
```

Node 24.17 or newer is required. Set `PARCOS_SEED_DEMO=true` only when you
explicitly want the historical demo dataset.

## Security

Sessions and one-time tokens are stored as hashes, passwords use scrypt,
authenticated writes require CSRF tokens, private areas and photos are enforced
server-side, and browser responses use a restrictive content security policy.
See [SECURITY.md](SECURITY.md) for deployment guidance and private reporting.

## License

Copyright (C) 2026 Louis Berghmans. ParcOS is free software licensed under the
GNU General Public License v3.0 or later. See [LICENSE](LICENSE).
