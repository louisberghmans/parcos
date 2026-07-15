# Multilingual content workflow

ParcOS supports French (`fr`), Dutch (`nl`), and English (`en`) for both the
interface and user-authored content. The language badge shows the language that
is currently active. Clicking it cycles FR → NL → EN and reloads content in the
selected language.

## How content languages work

Each translatable field records:

- the language in which the source text was created;
- a monotonically increasing source revision;
- zero or more translations tied to that exact revision.

The original value stays in its existing application table. Translations are
stored separately in `content_translations`, while `localized_content` stores
source language and revision metadata. This keeps existing data and backups
compatible and prevents translated values from overwriting their source.

When no current translation exists, the API returns the source text as a safe
fallback. When a source field changes, older translations remain in the
database but are considered stale and are no longer displayed.

The current workflow covers areas, beds, events, timestamped bed notes,
activity log entries, harvests, how-to videos, and photo captions.

## Manual ChatGPT round trip

1. Sign in as an administrator.
2. Open **Profile → Content translations**.
3. Select **Download timestamped file**. The JSON contains only missing or
   stale translations.
4. Give that file to ChatGPT with this prompt:

   ```text
   Translate every item in this parcOS translation file from sourceLocale to
   targetLocale. Put only the translated text in each item's "translation"
   field. Preserve meaning, names, formatting, IDs, field names, locale codes,
   sourceRevision, sourceText, status, exportedAt, exportId, and format exactly.
   Return valid JSON only and do not add or remove items.
   ```

5. Save ChatGPT's JSON response as a `.json` file.
6. Under **Translated JSON file**, select it and choose **Import translations**.

Empty translations are skipped. Items whose source language or revision no
longer matches are rejected as stale, so an older export cannot overwrite work
based on newer source content. Export again to receive the current source text.

## HTTP endpoints

- `GET /api/translations/export` downloads `parcos-translations-v1` JSON.
- `POST /api/translations/import` imports the same format after its
  `translation` fields have been filled.

Both endpoints require coordinator access; importing also requires the normal
CSRF token. The administrative UI exposes them only to administrators.
