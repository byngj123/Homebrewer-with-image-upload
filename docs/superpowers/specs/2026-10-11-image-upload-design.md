# Homebrewery fork with image upload: design

Date: 2026-10-11
Status: awaiting review

## Goal

Run a local copy of The Homebrewery (https://homebrewery.naturalcrit.com/) that behaves like the original, with one addition: the Images menu in the editor lets the user upload an image from their machine and inserts it into the brew.

## What was asked, and what is assumed

Stated by James:

- Clone Homebrewery. The only addition is that the Images option allows uploading images.
- Build it by forking the upstream open source repository.
- It runs locally only, on his own Mac.

Assumed (correct these if wrong):

- Single user. No login is required to upload.
- It runs through Docker. Nothing is deployed.
- Only the V3 renderer needs the upload entry.

## Success criteria

1. The app starts locally and serves the normal Homebrewery editor on port 8000.
2. The Images menu has an "Upload Image" entry. Choosing a file uploads it and inserts image markdown at the cursor, and the image appears in the preview.
3. The image still renders after the containers are stopped, rebuilt and started again.
4. A file that is not a supported image, or is over the size limit, is rejected with a visible message and nothing is inserted.
5. Every other upstream feature works as it does upstream.

## Base

- Upstream: `naturalcrit/homebrewery`, MIT licensed. Studied at commit `e32be83` (10 October 2026). The licence file stays in place.
- The target directory `/Users/james/sites/homebrewer` already holds `.remember/` and this `docs/` tree, so a plain `git clone` into it will refuse. Use `git init`, add the remote as `upstream`, fetch with full history, and check out upstream's default branch. Confirm first that upstream has no `docs/` or `.remember` path that would collide (it had neither at `e32be83`).
- All work happens on a branch named `image-upload`. This spec is committed there as the first commit, since no repository exists yet at the time of writing.
- `.remember/` and `uploads/` are added to `.gitignore`.

## Running it

- Use upstream's `docker-compose.yml`: one `mongo` container and one app container, port 8000.
- Upstream's `Dockerfile` runs `COPY config/docker.json`, but `config/docker.*` is gitignored and the file is not in the repository, so the build fails until it is created. Follow `README.DOCKER.md` for its contents. It stays untracked, as upstream intends.
- Upstream requires Node 26.4 or newer (`engines` in `package.json`). This Mac has Node 24.14. Docker covers running the app. Tests are run inside a `node:26.4.0-alpine` container with the repository mounted, so no local Node upgrade is needed. Note that `.dockerignore` excludes `tests/`, so the built app image cannot be used to run the full suite.

## Server

New file `server/upload.api.js`, exporting a factory `createUploadApi({ uploadDir })` that returns an Express router holding both the upload route and the static serving of `/uploads`. It is mounted once in `server/app.js`, directly after `app.set('trust proxy', 1)` and before every other middleware. The position matters: `server/middleware/content-negotiation.js` answers `406` to any request whose `Accept` header lists only image types, which is exactly what a browser sends for an `<img>`, and it exempts only `/staticImages`. Mounted any later, uploads would save correctly and then fail to display.

### `POST /api/upload/image`

- Body: `multipart/form-data` with a single file field named `image`.
- Parsed with `multer` using memory storage. This is a new dependency: upstream only parses JSON bodies (`bodyParser.json`, 25mb).
- Size limit: 10 MB, enforced by `multer`'s `limits.fileSize`, so an oversize upload is cut off rather than read in full.
- Type check: by the file's leading bytes, not by its extension or the `Content-Type` the client sent. Accepted: PNG, JPEG, GIF, WebP. The check is a small hand-written signature match in its own module (`server/imageType.js`), which avoids a second new dependency for four formats.
- SVG is not accepted. An SVG can carry script, and uploads are served from the app's own origin.
- Stored name: `<random id>.<ext>`, where the id comes from `nanoid` (already an upstream dependency) and the extension comes from the detected type. The original filename is never used on disk, which rules out path traversal and overwrites by construction.
- Storage directory: config key `hb_uploads`, defaulting to `./uploads`, created at start-up if missing. This follows the existing `hb_images` and `hb_fonts` keys in `config/default.json`.
- Success: `200` with `{ "url": "/uploads/<id>.<ext>" }`.
- Failures: `400` when no file is sent, `403` for a cross-site request (see below), `413` when over the limit, `415` when the type is not accepted. Each returns `{ "error": "<message>" }`.
- Cross-site guard: a request carrying a `Sec-Fetch-Site` header with any value other than `same-origin` is refused with `403`. Without this, any web page open in the same browser could post files blind to `localhost:8000` and fill the disk, since a multipart POST needs no CORS preflight. Requests with no such header (curl, tests) are allowed.
- The signature check proves only how a file begins. A file with a PNG header and other content after it is stored as `.png`; the `nosniff` header below is what stops a browser treating it as anything but an image.

### Serving

- `express.static(<upload directory>)` on `/uploads`, inside the same router. A path under `/uploads` that matches no file returns `404` rather than falling through to the app's catch-all redirect to `/`.
- Responses carry `X-Content-Type-Options: nosniff`, so a browser cannot reinterpret a stored file as something other than the image type it was saved as.

### Docker

- `docker-compose.yml` gains a named volume mounted on the upload directory, so images survive a rebuild.
- `uploads` is added to `.dockerignore` so images from local test runs are not baked into the image.
- `vite.config.js` gains `server.watch.ignored` for the upload directory. The Docker environment runs Vite's dev middleware, and a new file appearing under the project root must not be able to trigger a page reload that discards unsaved edits.

## Client

### The menu entry

- The Images group is defined in `themes/V3/Blank/snippets.js`. Blank is the parent of the other V3 themes, so one entry there reaches all of them.
- A new first entry, "Upload Image", with the `fas fa-upload` icon.

### Making a snippet asynchronous

Snippets are synchronous today: `gen` is a string or a function returning a string, and `SnippetGroup.handleSnippetClick` in `client/homebrew/editor/snippetbar/snippetbar.jsx` passes the result straight to `onSnippetClick`.

- `handleSnippetClick` changes to await the result of `execute(snippet.gen, props)` before injecting. A string passes through unchanged, so every existing snippet behaves as before. A result of `null` or `undefined` injects nothing; an empty string is still passed on, as upstream does.
- The upload entry's `gen` is an async function in a new file, `themes/V3/Blank/snippets/imageUpload.gen.js`. It opens a file picker (a transient `<input type="file" accept="image/png,image/jpeg,image/gif,image/webp">`), posts the chosen file to `/api/upload/image`, and resolves to the markdown.
- If the user cancels the picker, or the upload fails, it resolves to `null`.

### What gets inserted

`![<original filename without extension>](/uploads/<id>.<ext>) {width:325px}`

This matches the shape of the existing "Image" snippet, including its default width. The alt text is taken from the original filename with square brackets stripped, so it cannot break out of the markdown link syntax.

One deliberate difference from upstream: the existing snippets build absolute URLs from `window.location.origin`. Uploaded images use a path-relative URL instead, so a brew keeps working if the port or hostname changes. Whether the renderer and the print and share views resolve a relative URL correctly is checked during implementation; if any of them does not, fall back to the absolute form.

### Errors

A failed upload shows the server's message in a browser `alert` and inserts nothing. Upstream already reports a rejected file this way (`client/homebrew/navbar/newbrew.navitem.jsx`), and the snippet bar has no notification component within reach.

## Testing

### Automated

`server/upload.api.spec.js` and `server/imageType.spec.js`, written with Jest and `supertest` in the style of the existing `server/*.spec.js` files:

- accepts a valid PNG, JPEG, GIF and WebP, and the returned URL serves the same bytes back
- rejects a request with no file (400)
- rejects a file over 10 MB (413)
- rejects a text file (415)
- rejects a text file named `x.png` and sent as `image/png` (415), which is the test that proves the check reads content
- rejects SVG (415)
- rejects a request with `Sec-Fetch-Site: cross-site` (403)
- an unknown path under `/uploads` returns 404
- a filename such as `../../evil.png` has no effect on the stored name

Tests use a temporary upload directory, removed afterwards.

`tests/routes/uploads.test.js` goes through the real `createApp()`: it uploads, then fetches the image with a browser-style `Accept: image/*` header and expects `200`. This is the test that guards the mount position.

`tests/snippets/imageUpload.test.js` covers the pure function that builds the inserted markdown.

After the tests pass, each guard is disabled on its own in turn (the size limit, the type check, the generated filename, the cross-site guard, the mount position) to confirm that a specific test goes red for it, then restored.

### Manual, in a browser

- Upload through the menu and see the image render in the preview.
- Stop, rebuild and start the containers, reload the brew, and see the image still render.
- Check the image appears in the share view and in print preview.
- Try an oversize file and a non-image file and see the message.
- Use two or three existing snippets to confirm the async change did not affect them.

## Limits knowingly accepted

- **No authentication on upload.** Anyone who can reach port 8000 can upload. This is acceptable on localhost and must be revisited before the app is ever exposed to a network.
- **Images are tied to this instance.** Copying a brew's text to the public Homebrewery, or to another machine, loses its uploaded images.
- **No clean-up.** Deleting a brew leaves its images on disk. Nothing tracks which brew uses which image.
- **The Legacy renderer's menu is unchanged.** Only V3 themes get the entry.
- **The menu wiring is not covered by automated tests.** The Jest suites cover the endpoint and the type check. The click path through the snippet bar is verified by hand only.

## Out of scope

Drag and drop into the editor, pasting from the clipboard, an image gallery or manager, resizing or re-encoding images, per-user quotas, and any deployment.
