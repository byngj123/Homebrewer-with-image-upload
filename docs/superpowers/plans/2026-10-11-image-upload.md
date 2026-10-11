# Homebrewery Fork With Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run The Homebrewery locally from a fork of upstream, with an "Upload Image" entry in the editor's Images menu that stores a file on disk and inserts it into the brew.

**Architecture:** Upstream is checked out unchanged and run through its own Docker Compose file. One new Express router (`server/upload.api.js`) receives a multipart upload, checks the file's leading bytes, writes it under a random name and serves it back from `/uploads`. On the client, one new async snippet opens a file picker and posts to that route, and the snippet bar learns to await a snippet's result.

**Tech Stack:** Node 26.4 (in Docker only), Express 5, `multer` (new), `nanoid` and `fs-extra` (already upstream), React 19, Vite 8, Jest 30 with `supertest`, MongoDB in Docker.

**Spec:** `docs/superpowers/specs/2026-10-11-image-upload-design.md`

## Global Constraints

- Upstream is `https://github.com/naturalcrit/homebrewery.git`, default branch `master`, studied at commit `e32be83`. Its `license` file is not touched.
- All work is on branch `image-upload`. Never commit to `master`. Run `git branch --show-current` immediately before every commit and expect `image-upload`.
- Stage explicit file paths only. Never `git add <directory>` or `git add -A`.
- Node on this Mac is 24.14 and upstream requires 26.4 or newer. Every `npm`, `npx` and `jest` command runs inside `node:26.4.0-alpine`. Never run them on the host.
- Accepted image types: PNG, JPEG, GIF, WebP, decided by leading bytes. SVG is refused.
- Size limit: 10 MB (`10 * 1024 * 1024` bytes).
- Upload field name: `image`. Route: `POST /api/upload/image`. Served under `/uploads`.
- Config key `hb_uploads`, default `uploads`.
- `multer` is the only new dependency.
- Match upstream code style: tabs, `()=>` with no spaces round the arrow, `if(` with no space, colons aligned in object literals. Run ESLint on every file you touch.
- Written text (comments, commit messages, docs) is plain UK English with no em dashes.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- A comment may state only what the code does and what has been checked. Do not write a guarantee you have not seen fail when broken.

## The container command

Every test and lint step uses this wrapper. It is written out once here and referred to as `NODE26` below. Run it from `/Users/james/sites/homebrewer`.

```bash
docker run --rm -v "$PWD":/app -w /app node:26.4.0-alpine
```

So "Run: `NODE26 npx jest server/imageType.spec.js`" means:

```bash
docker run --rm -v "$PWD":/app -w /app node:26.4.0-alpine npx jest server/imageType.spec.js
```

`node_modules` is installed by that container into the mounted directory, so it holds Linux builds. That is intended: nothing on the host uses it, and `.dockerignore` keeps it out of the app image.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `server/imageType.js` | create | Given a Buffer, say which of four image types it is, or `null`. Nothing else. |
| `server/imageType.spec.js` | create | Tests for the above. |
| `server/upload.api.js` | create | Router factory: the upload route, the cross-site guard, static serving of `/uploads`. |
| `server/upload.api.spec.js` | create | Tests for the router in isolation. |
| `tests/routes/uploads.test.js` | create | One test through the real `createApp()`, guarding where the router is mounted. |
| `server/app.js` | modify | Import and mount the router. |
| `config/default.json` | modify | Add `hb_uploads`. |
| `themes/V3/Blank/snippets/imageUpload.gen.js` | create | File picker, upload request, and the markdown builder. |
| `tests/snippets/imageUpload.test.js` | create | Tests for the markdown builder. |
| `themes/V3/Blank/snippets.js` | modify | Add the "Upload Image" entry to the Images group. |
| `client/homebrew/editor/snippetbar/snippetbar.jsx` | modify | Await a snippet's result before injecting. |
| `docker-compose.yml` | modify | Named volume for uploads. |
| `.dockerignore`, `.gitignore`, `vite.config.js` | modify | Keep the upload directory out of the image, out of git, and out of Vite's watcher. |
| `config/docker.json` | create, untracked | Required by upstream's `Dockerfile`; gitignored by upstream. |

## Review Focus

Inputs the spec implies and a person will meet. Each has a test in the task named.

1. **A browser fetching the uploaded image.** A browser sends `Accept: image/avif,image/webp,...` for an `<img>`. Upstream's content negotiation middleware answers `406` to that everywhere except `/staticImages`. Expected: `200`. Test in Task 4.
2. **A filename containing square brackets**, such as `map [final].png`. Expected: the inserted markdown is still one valid image link. Test in Task 5.
3. **A file exactly at the size limit.** Expected: accepted. One byte over: `413`. Tests in Task 3.
4. **A truncated or empty file.** Expected: `415`, not a crash on reading bytes that are not there. Tests in Task 2 and Task 3.
5. **Another web page posting to the upload route.** Expected: `403`. Test in Task 3.

---

### Task 1: Check out upstream and get a green baseline

**Files:**
- Create: `config/docker.json` (untracked)
- Modify: `.gitignore`
- Commit: `docs/superpowers/specs/2026-10-11-image-upload-design.md`, `docs/superpowers/plans/2026-10-11-image-upload.md`, `.gitignore`

**Interfaces:**
- Produces: a working tree at upstream `master` on branch `image-upload`, `node_modules` installed, and a recorded baseline test result that later tasks compare against.

- [ ] **Step 1: Note what is in the directory before git exists**

Run: `ls -A /Users/james/sites/homebrewer`
Expected: `.remember` and `docs` only. If anything else is there, stop and ask.

- [ ] **Step 2: Initialise and fetch upstream with full history**

```bash
cd /Users/james/sites/homebrewer
git init -q
git remote add upstream https://github.com/naturalcrit/homebrewery.git
git fetch upstream
```

- [ ] **Step 3: Confirm upstream has nothing that collides with the existing files**

Run: `git ls-tree -r --name-only upstream/master | grep -c -e '^docs/' -e '^\.remember'`
Expected: `0`. If not, stop and ask.

- [ ] **Step 4: Create the work branch from upstream**

```bash
git checkout --no-track -b image-upload upstream/master
git branch --show-current
git log -1 --format='%h %cd %s'
```

Expected: `image-upload`, then upstream's latest commit. Record the hash; if it is not `e32be83`, upstream has moved since the spec was written, so re-read `server/app.js` lines 55 to 66 and `server/middleware/content-negotiation.js` before Task 4 and confirm they still match what the spec describes.

- [ ] **Step 5: Ignore local-only paths**

Append to `.gitignore`:

```
.remember
uploads
```

- [ ] **Step 6: Commit the spec, the plan and the ignore rules**

```bash
git status --short
git add .gitignore docs/superpowers/specs/2026-10-11-image-upload-design.md docs/superpowers/plans/2026-10-11-image-upload.md
git diff --cached --numstat
git branch --show-current
git commit -m "Add image upload design and plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected from `--numstat`: exactly three files.

- [ ] **Step 7: Install dependencies inside Node 26**

Upstream's `Dockerfile` installs `git` first and passes `--ignore-scripts`; do the same.

```bash
docker run --rm -v "$PWD":/app -w /app node:26.4.0-alpine sh -c "apk add --no-cache git >/dev/null && npm install --ignore-scripts"
git status --short
```

Expected: install completes, and `git status --short` prints nothing (`node_modules` is ignored and `package-lock.json` is unchanged). If the lockfile changed, run `git checkout -- package-lock.json` and say so in the report.

- [ ] **Step 8: Record the baseline test result**

Run: `NODE26 npm test 2>&1 | tail -25`

Write down the suite count, the test count, any failing files, and the exit code (`echo $?` straight after). This is the baseline. Later full runs are compared with this full run, and single-file runs are compared with single-file runs, never one with the other.

If any file fails at baseline, run that one file again on its own to see whether it fails consistently, record the result, and carry on. Do not fix upstream failures.

- [ ] **Step 9: Create the Docker config file upstream expects**

`Dockerfile` runs `COPY config/docker.json`, and upstream's `.gitignore` excludes `config/docker.*`, so the build fails without it. Create `config/docker.json`:

```json
{
	"host" : "localhost:8000",
	"naturalcrit_url" : "local.naturalcrit.com:8010",
	"secret" : "secret",
	"web_port" : 8000
}
```

`mongodb_uri` is left out on purpose: `docker-compose.yml` supplies it through the `MONGODB_URI` environment variable, and `server/config.js` reads environment variables in lower case ahead of this file.

Run: `git status --short`
Expected: nothing (the file is ignored).

- [ ] **Step 10: Build and start unmodified upstream**

```bash
docker compose up --build -d
docker compose ps
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/
```

Expected: both services running and `200`. If the app container exits, read `docker compose logs homebrewery | tail -40` and fix the cause before going on. This proves the base works before anything is added, so a later failure can be pinned on the change.

- [ ] **Step 11: Stop the containers**

Run: `docker compose down`

Do not pass `-v`. That flag deletes the database volume.

---

### Task 2: Detect an image type from its bytes

**Files:**
- Create: `server/imageType.js`
- Test: `server/imageType.spec.js`

**Interfaces:**
- Produces: `detectImageType(buffer: Buffer): { ext: 'png'|'jpg'|'gif'|'webp', mime: string } | null`, a named export.

- [ ] **Step 1: Write the failing test**

Create `server/imageType.spec.js`:

```js
import { detectImageType } from './imageType.js';

const PNG  = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);
const GIF7 = Buffer.from('GIF87a....', 'latin1');
const GIF9 = Buffer.from('GIF89a....', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ', 'latin1')]);

describe('detectImageType', ()=>{
	it('recognises PNG', ()=>{
		expect(detectImageType(PNG)).toEqual({ ext: 'png', mime: 'image/png' });
	});

	it('recognises JPEG', ()=>{
		expect(detectImageType(JPEG)).toEqual({ ext: 'jpg', mime: 'image/jpeg' });
	});

	it('recognises both GIF versions', ()=>{
		expect(detectImageType(GIF7)).toEqual({ ext: 'gif', mime: 'image/gif' });
		expect(detectImageType(GIF9)).toEqual({ ext: 'gif', mime: 'image/gif' });
	});

	it('recognises WebP', ()=>{
		expect(detectImageType(WEBP)).toEqual({ ext: 'webp', mime: 'image/webp' });
	});

	it('rejects a RIFF file that is not WebP', ()=>{
		const wav = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WAVEfmt ', 'latin1')]);
		expect(detectImageType(wav)).toBeNull();
	});

	it('rejects SVG', ()=>{
		expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
	});

	it('rejects plain text', ()=>{
		expect(detectImageType(Buffer.from('hello world'))).toBeNull();
	});

	it('rejects an empty buffer', ()=>{
		expect(detectImageType(Buffer.alloc(0))).toBeNull();
	});

	it('rejects a buffer cut off partway through a signature', ()=>{
		expect(detectImageType(PNG.subarray(0, 4))).toBeNull();
		expect(detectImageType(WEBP.subarray(0, 8))).toBeNull();
	});

	it('rejects a value that is not a buffer', ()=>{
		expect(detectImageType(undefined)).toBeNull();
		expect(detectImageType('GIF89a')).toBeNull();
	});
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `NODE26 npx jest server/imageType.spec.js`
Expected: FAIL, cannot find module `./imageType.js`.

- [ ] **Step 3: Write the implementation**

Create `server/imageType.js`:

```js
const startsWith = (buffer, bytes, offset = 0)=>bytes.every((byte, i)=>buffer[offset + i] === byte);

const SIGNATURES = [
	{
		ext  : 'png',
		mime : 'image/png',
		test : (b)=>startsWith(b, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
	},
	{
		ext  : 'jpg',
		mime : 'image/jpeg',
		test : (b)=>startsWith(b, [0xFF, 0xD8, 0xFF])
	},
	{
		ext  : 'gif',
		mime : 'image/gif',
		// "GIF87a" or "GIF89a"
		test : (b)=>startsWith(b, [0x47, 0x49, 0x46, 0x38]) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61
	},
	{
		ext  : 'webp',
		mime : 'image/webp',
		// "RIFF", four bytes of length, then "WEBP"
		test : (b)=>startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)
	}
];

// Identifies a file by how it begins. It does not validate the rest of the file.
export const detectImageType = (buffer)=>{
	if(!Buffer.isBuffer(buffer)) return null;
	const match = SIGNATURES.find((signature)=>signature.test(buffer));
	return match ? { ext: match.ext, mime: match.mime } : null;
};
```

Reading past the end of a Buffer gives `undefined`, which never equals a byte value, so short input falls out as `null` without a length check.

- [ ] **Step 4: Run it and see it pass**

Run: `NODE26 npx jest server/imageType.spec.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Lint**

Run: `NODE26 npx eslint server/imageType.js server/imageType.spec.js`
Expected: no output. Fix what it reports, by hand or with `--fix`, and re-run the test.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add server/imageType.js server/imageType.spec.js
git diff --cached --numstat
git commit -m "Add image type detection by file signature

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The upload router

**Files:**
- Create: `server/upload.api.js`
- Test: `server/upload.api.spec.js`
- Modify: `package.json`, `package-lock.json` (by `npm install`)

**Interfaces:**
- Consumes: `detectImageType(buffer)` from `server/imageType.js` (Task 2).
- Produces: default export `createUploadApi({ uploadDir: string }): express.Router`, and named export `MAX_IMAGE_BYTES: number` (10485760). The router handles `POST /api/upload/image` and `GET /uploads/*`. Success body: `{ url: '/uploads/<id>.<ext>' }`. Failure body: `{ error: string }`.

- [ ] **Step 1: Add multer**

```bash
docker run --rm -v "$PWD":/app -w /app node:26.4.0-alpine sh -c "apk add --no-cache git >/dev/null && npm install --ignore-scripts multer"
git diff --numstat
```

Expected: only `package.json` and `package-lock.json` changed, and `package.json` by one line. If the lockfile churn runs to thousands of lines unrelated to `multer`, stop and report it rather than committing it.

Then confirm the installed version supports Express 5 by reading the installed package, not the docs:

Run: `grep -n '"version"' node_modules/multer/package.json && grep -n 'LIMIT_FILE_SIZE' node_modules/multer/lib/multer-error.js`
Expected: a 2.x version, and the `LIMIT_FILE_SIZE` code present. The implementation below depends on that exact code string.

- [ ] **Step 2: Write the failing test**

Create `server/upload.api.spec.js`:

```js
import supertest from 'supertest';
import express   from 'express';
import fs        from 'fs-extra';
import os        from 'os';
import path      from 'path';
import createUploadApi, { MAX_IMAGE_BYTES } from './upload.api.js';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const PNG  = Buffer.concat([PNG_HEADER, Buffer.from('png body')]);
const JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]);
const GIF  = Buffer.from('GIF89a gif body', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ', 'latin1')]);

const pngOfSize = (size)=>Buffer.concat([PNG_HEADER, Buffer.alloc(size - PNG_HEADER.length)]);

describe('upload api', ()=>{
	let uploadDir;
	let request;

	const upload = (buffer, filename = 'picture.png', contentType = 'image/png')=>request
		.post('/api/upload/image')
		.attach('image', buffer, { filename, contentType });

	beforeEach(async ()=>{
		uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-upload-'));
		const app = express();
		app.use(createUploadApi({ uploadDir }));
		request = supertest(app);
	});

	afterEach(async ()=>{
		await fs.remove(uploadDir);
	});

	it.each([
		['png',  PNG,  'image/png'],
		['jpg',  JPEG, 'image/jpeg'],
		['gif',  GIF,  'image/gif'],
		['webp', WEBP, 'image/webp'],
	])('stores a %s and serves the same bytes back', async (ext, buffer, mime)=>{
		const res = await upload(buffer, `picture.${ext}`, mime).expect(200);

		expect(res.body.url).toMatch(new RegExp(`^/uploads/[A-Za-z0-9_-]+\\.${ext}$`));

		const served = await request.get(res.body.url).buffer(true).parse((r, cb)=>{
			const chunks = [];
			r.on('data', (chunk)=>chunks.push(chunk));
			r.on('end', ()=>cb(null, Buffer.concat(chunks)));
		}).expect(200);

		expect(served.headers['content-type']).toBe(mime);
		expect(served.headers['x-content-type-options']).toBe('nosniff');
		expect(Buffer.compare(served.body, buffer)).toBe(0);
	});

	it('creates the upload directory when it does not exist', async ()=>{
		const nested = path.join(uploadDir, 'not', 'there', 'yet');
		const app = express();
		app.use(createUploadApi({ uploadDir: nested }));

		await supertest(app).post('/api/upload/image').attach('image', PNG, 'a.png').expect(200);

		expect(await fs.readdir(nested)).toHaveLength(1);
	});

	it('rejects a request with no file', async ()=>{
		const res = await request.post('/api/upload/image').expect(400);
		expect(res.body.error).toBe('No image was sent.');
	});

	it('rejects a file sent under the wrong field name', async ()=>{
		const res = await request.post('/api/upload/image').attach('file', PNG, 'a.png').expect(400);
		expect(res.body.error).toBeDefined();
	});

	it('accepts a file exactly at the size limit', async ()=>{
		await upload(pngOfSize(MAX_IMAGE_BYTES)).expect(200);
	});

	it('rejects a file one byte over the size limit and stores nothing', async ()=>{
		const res = await upload(pngOfSize(MAX_IMAGE_BYTES + 1)).expect(413);

		expect(res.body.error).toBe('Image is larger than 10 MB.');
		expect(await fs.readdir(uploadDir)).toHaveLength(0);
	});

	it('rejects a text file', async ()=>{
		const res = await upload(Buffer.from('just some text'), 'notes.txt', 'text/plain').expect(415);
		expect(res.body.error).toBe('Only PNG, JPEG, GIF and WebP images are accepted.');
	});

	it('rejects a text file that claims to be a PNG and stores nothing', async ()=>{
		await upload(Buffer.from('just some text'), 'picture.png', 'image/png').expect(415);
		expect(await fs.readdir(uploadDir)).toHaveLength(0);
	});

	it('rejects SVG', async ()=>{
		await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'x.svg', 'image/svg+xml').expect(415);
	});

	it('rejects an empty file', async ()=>{
		await upload(Buffer.alloc(0)).expect(415);
	});

	it('names the stored file itself, whatever the client called it', async ()=>{
		const res = await upload(PNG, '../../evil.html', 'image/png').expect(200);

		expect(res.body.url).toMatch(/^\/uploads\/[A-Za-z0-9_-]+\.png$/);
		const stored = await fs.readdir(uploadDir);
		expect(stored).toHaveLength(1);
		expect(stored[0]).toBe(res.body.url.replace('/uploads/', ''));
		expect(await fs.pathExists(path.join(uploadDir, '..', '..', 'evil.html'))).toBe(false);
	});

	it('gives two uploads of the same file different names', async ()=>{
		const first  = await upload(PNG).expect(200);
		const second = await upload(PNG).expect(200);
		expect(first.body.url).not.toBe(second.body.url);
	});

	it.each(['cross-site', 'same-site'])('refuses a %s browser request and stores nothing', async (site)=>{
		const res = await upload(PNG).set('Sec-Fetch-Site', site).expect(403);

		expect(res.body.error).toBeDefined();
		expect(await fs.readdir(uploadDir)).toHaveLength(0);
	});

	it('allows a same-origin browser request', async ()=>{
		await upload(PNG).set('Sec-Fetch-Site', 'same-origin').expect(200);
	});

	it('returns 404 for an upload path that does not exist', async ()=>{
		await request.get('/uploads/nothing-here.png').expect(404);
	});

	it('does not serve files outside the upload directory', async ()=>{
		await fs.writeFile(path.join(uploadDir, '..', 'hb-outside.txt'), 'secret');
		try {
			await request.get('/uploads/..%2Fhb-outside.txt').expect((res)=>{
				expect(res.status).not.toBe(200);
			});
		} finally {
			await fs.remove(path.join(uploadDir, '..', 'hb-outside.txt'));
		}
	});
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `NODE26 npx jest server/upload.api.spec.js`
Expected: FAIL, cannot find module `./upload.api.js`.

- [ ] **Step 4: Write the implementation**

Create `server/upload.api.js`:

```js
import express    from 'express';
import multer     from 'multer';
import fs         from 'fs-extra';
import path       from 'path';
import { nanoid } from 'nanoid';
import { detectImageType } from './imageType.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export default function createUploadApi({ uploadDir }) {
	const dir = path.resolve(uploadDir);
	fs.ensureDirSync(dir);

	const router = express.Router();

	const receive = multer({
		storage : multer.memoryStorage(),
		limits  : { fileSize: MAX_IMAGE_BYTES, files: 1 }
	}).single('image');

	// Browsers send Sec-Fetch-Site on every request. Tools such as curl send nothing and are let through.
	const sameOriginOnly = (req, res, next)=>{
		const site = req.get('Sec-Fetch-Site');
		if(site && site !== 'same-origin') {
			return res.status(403).json({ error: 'Uploads are only accepted from this site.' });
		}
		next();
	};

	router.post('/api/upload/image', sameOriginOnly, (req, res)=>{
		receive(req, res, async (err)=>{
			if(err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Image is larger than 10 MB.' });
			if(err) return res.status(400).json({ error: 'The upload could not be read.' });
			if(!req.file) return res.status(400).json({ error: 'No image was sent.' });

			const type = detectImageType(req.file.buffer);
			if(!type) return res.status(415).json({ error: 'Only PNG, JPEG, GIF and WebP images are accepted.' });

			// The client's filename is never used. The extension comes from the detected type.
			const name = `${nanoid()}.${type.ext}`;
			try {
				await fs.writeFile(path.join(dir, name), req.file.buffer);
			} catch (writeErr) {
				console.error(writeErr);
				return res.status(500).json({ error: 'The image could not be saved.' });
			}

			return res.json({ url: `/uploads/${name}` });
		});
	});

	router.use('/uploads', express.static(dir, {
		index      : false,
		setHeaders : (res)=>res.setHeader('X-Content-Type-Options', 'nosniff')
	}));
	router.use('/uploads', (req, res)=>res.status(404).end());

	return router;
}
```

- [ ] **Step 5: Run it and see it pass**

Run: `NODE26 npx jest server/upload.api.spec.js`
Expected: PASS, every test. If the `same-site` or wrong-field-name test fails on status code, read the failure before changing the test: the test states the spec, so the implementation is what moves.

One exception. Whether a file of exactly `MAX_IMAGE_BYTES` is accepted is decided inside `busboy`, which `multer` wraps, and this plan has not read that code. If "accepts a file exactly at the size limit" fails, read the comparison in `node_modules/busboy/lib/types/multipart.js` (search for `fileSizeLimit`), then make the test and the spec's wording state the boundary the library really enforces. Do not add code to move the boundary by one byte.

- [ ] **Step 6: Re-break each guard, one at a time**

For each row: make the edit, run `NODE26 npx jest server/upload.api.spec.js`, confirm the named test fails, undo the edit, and confirm the file is back with `git diff --stat server/upload.api.js` (it is uncommitted, so compare with a copy: `cp server/upload.api.js /tmp/upload.api.keep` before starting, `cp /tmp/upload.api.keep server/upload.api.js` to restore, `diff` to confirm).

| Guard | Edit | Test that must go red |
|---|---|---|
| Size limit | change `fileSize: MAX_IMAGE_BYTES` to `fileSize: MAX_IMAGE_BYTES * 2` | "rejects a file one byte over the size limit" |
| Type check | change `if(!type) return res.status(415)...` so it never returns (prefix the condition with `false &&`) and give `type` a fallback `?? { ext: 'png' }` | "rejects a text file that claims to be a PNG" |
| Generated filename | change `` `${nanoid()}.${type.ext}` `` to `req.file.originalname` | "names the stored file itself" |
| Cross-site guard | remove `sameOriginOnly,` from the route | "refuses a cross-site browser request" |
| nosniff | delete the `setHeaders` line | "stores a png and serves the same bytes back" |
| 404 | delete the second `router.use('/uploads', ...)` line | "returns 404 for an upload path that does not exist" |

If any guard can be disabled with the suite still green, that guard is untested: fix the test before going on, and say so in the report.

- [ ] **Step 7: Lint**

Run: `NODE26 npx eslint server/upload.api.js server/upload.api.spec.js`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add server/upload.api.js server/upload.api.spec.js package.json package-lock.json
git diff --cached --numstat
git commit -m "Add image upload route with type, size and origin checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Mount the router in the app

**Files:**
- Modify: `server/app.js` (imports near line 22; body just after `app.set('trust proxy', 1 ...)` near line 56)
- Modify: `config/default.json`
- Test: `tests/routes/uploads.test.js`

**Interfaces:**
- Consumes: `createUploadApi({ uploadDir })` from `server/upload.api.js` (Task 3).
- Produces: the running app answers `POST /api/upload/image` and `GET /uploads/*`. The upload directory comes from config key `hb_uploads`, which the environment variable `HB_UPLOADS` overrides.

Background the implementer needs: `server/middleware/content-negotiation.js` returns `406` for any request whose `Accept` header contains only image types, unless the path starts with `/staticImages`. A browser loading an `<img>` sends exactly such a header. `server/forcessl.mw.js` redirects to https outside the `local` and `docker` environments. The router must be mounted before both.

- [ ] **Step 1: Write the failing test**

Create `tests/routes/uploads.test.js`:

```js
import supertest from 'supertest';
import fs        from 'fs-extra';
import os        from 'os';
import path      from 'path';

const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4]);

// What Chrome sends when it loads an <img>
const BROWSER_IMAGE_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';

let uploadDir;
let request;

beforeAll(async ()=>{
	uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-app-upload-'));
	// server/config.js reads the environment when it is first imported, so the
	// variable is set here and the app is imported afterwards, not at the top of the file.
	process.env.HB_UPLOADS = uploadDir;
	const { default: createApp } = await import('../../server/app.js');
	request = supertest(await createApp());
});

afterAll(async ()=>{
	delete process.env.HB_UPLOADS;
	await fs.remove(uploadDir);
});

describe('uploads through the full app', ()=>{
	it('stores an upload in the configured directory', async ()=>{
		const res = await request.post('/api/upload/image').attach('image', PNG, 'a.png').expect(200);

		const stored = await fs.readdir(uploadDir);
		expect(stored).toContain(res.body.url.replace('/uploads/', ''));
	});

	it('serves an upload to a browser image request', async ()=>{
		const res = await request.post('/api/upload/image').attach('image', PNG, 'a.png').expect(200);

		const served = await request.get(res.body.url).set('Accept', BROWSER_IMAGE_ACCEPT).expect(200);

		expect(served.headers['content-type']).toBe('image/png');
		expect(served.headers['x-content-type-options']).toBe('nosniff');
	});

	it('still refuses image requests for ordinary pages', async ()=>{
		await request.get('/').set('X-Forwarded-Proto', 'https').set('Accept', BROWSER_IMAGE_ACCEPT).expect(406);
	});
});
```

The third test pins upstream's behaviour, so that mounting the router early is shown not to have switched the content negotiation off for everything else.

- [ ] **Step 2: Run it and see it fail**

Run: `NODE26 npx jest tests/routes/uploads.test.js`
Expected: the first two tests FAIL (the POST does not return 200; no such route). The third passes already.

- [ ] **Step 3: Add the config default**

In `config/default.json`, change one line by hand. Do not parse and re-serialise the file.

Old:

```json
	"hb_fonts" : null,
```

New:

```json
	"hb_fonts" : null,
	"hb_uploads" : "uploads",
```

Run: `git diff --numstat config/default.json`
Expected: `1	0	config/default.json`.

- [ ] **Step 4: Mount the router**

In `server/app.js`, add the import after the `vaultApi` import:

```js
import vaultApi                    from './vault.api.js';
import createUploadApi             from './upload.api.js';
```

and mount it straight after the `trust proxy` line:

```js
	app.set('trust proxy', 1 /* number of proxies between user and server */);

	// Mounted ahead of contentNegotiation, which answers 406 to the image-only
	// Accept header a browser sends for an <img>, and ahead of forceSSL.
	app.use(createUploadApi({ uploadDir: config.get('hb_uploads') || 'uploads' }));
```

The `|| 'uploads'` fallback matters: an empty value would resolve to the project root and serve the whole source tree.

- [ ] **Step 5: Run it and see it pass**

Run: `NODE26 npx jest tests/routes/uploads.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 6: Re-break the mount position**

The change is uncommitted, so keep a copy first: `cp server/app.js /tmp/app.keep`.

Move the `app.use(createUploadApi(...))` line to just after `app.use(forceSSL);`. Run `NODE26 npx jest tests/routes/uploads.test.js`.
Expected: "serves an upload to a browser image request" FAILS with 406.

Restore: `cp /tmp/app.keep server/app.js`, re-run, expect PASS. Confirm with `git diff --numstat server/app.js` that only the intended lines differ (5 added, 0 removed).

- [ ] **Step 7: Confirm nothing was left in the repository's own uploads folder**

Run: `ls uploads 2>/dev/null | wc -l`
Expected: `0`, or the directory absent. A non-zero count means the test wrote to the default directory and the `HB_UPLOADS` override did not take effect: fix that before going on, because it also means the first test passed for the wrong reason.

- [ ] **Step 8: Run the full suite and compare with the baseline**

Run: `NODE26 npm test 2>&1 | tail -25; echo "exit $?"`
Expected: the Task 1 baseline, plus the new suites, with the same exit code as baseline (or 0). A coverage threshold failure counts: `package.json` sets thresholds, and a non-zero exit with zero failing tests is still a failure. If a previously passing file now fails, run that file alone on this branch and alone on `upstream/master` before deciding it is a regression.

- [ ] **Step 9: Lint**

Run: `NODE26 npx eslint server/app.js tests/routes/uploads.test.js`
Expected: no new problems in the lines changed. `server/app.js` may carry upstream warnings; compare with `git stash; NODE26 npx eslint server/app.js; git stash pop` if unsure.

- [ ] **Step 10: Commit**

```bash
git branch --show-current
git add server/app.js config/default.json tests/routes/uploads.test.js
git diff --cached --numstat
git commit -m "Mount image upload route ahead of content negotiation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The upload snippet and the menu entry

**Files:**
- Create: `themes/V3/Blank/snippets/imageUpload.gen.js`
- Test: `tests/snippets/imageUpload.test.js`
- Modify: `themes/V3/Blank/snippets.js` (imports at top; Images group near line 640)
- Modify: `client/homebrew/editor/snippetbar/snippetbar.jsx` (`handleSnippetClick` in `SnippetGroup`, near line 265)

**Interfaces:**
- Consumes: `POST /api/upload/image` with multipart field `image`; `200 { url }` or an error status with `{ error }` (Tasks 3 and 4).
- Produces: default export `uploadImageSnippet(): Promise<string>` (resolves to markdown, or `''` when cancelled or failed), and named export `buildImageMarkdown(fileName: string, url: string): string`.

Background: a snippet is an object with `name`, `icon` and `gen`. `gen` is a string or a function. `SnippetGroup.handleSnippetClick` calls `execute(snippet.gen, props)`, which calls a function or returns a string, and passes the result to the editor to insert at the cursor. Nothing awaits today.

- [ ] **Step 1: Write the failing test**

Create `tests/snippets/imageUpload.test.js`:

```js
import { buildImageMarkdown } from '../../themes/V3/Blank/snippets/imageUpload.gen.js';

describe('buildImageMarkdown', ()=>{
	it('uses the filename without its extension as alt text', ()=>{
		expect(buildImageMarkdown('dragon.png', '/uploads/abc.png')).toBe('![dragon](/uploads/abc.png) {width:325px}');
	});

	it('removes only the last extension', ()=>{
		expect(buildImageMarkdown('map.v2.final.webp', '/uploads/abc.webp')).toBe('![map.v2.final](/uploads/abc.webp) {width:325px}');
	});

	it('strips square brackets so the alt text cannot close the link early', ()=>{
		expect(buildImageMarkdown('map [final].png', '/uploads/abc.png')).toBe('![map final](/uploads/abc.png) {width:325px}');
		expect(buildImageMarkdown('a](http://example.com) ![b.png', '/uploads/abc.png')).toBe('![a(http://example.com) !b](/uploads/abc.png) {width:325px}');
	});

	it('strips line breaks and backslashes', ()=>{
		expect(buildImageMarkdown('one\ntwo\\three.png', '/uploads/abc.png')).toBe('![one twothree](/uploads/abc.png) {width:325px}');
	});

	it('falls back to "image" when nothing usable is left', ()=>{
		expect(buildImageMarkdown('[].png', '/uploads/abc.png')).toBe('![image](/uploads/abc.png) {width:325px}');
		expect(buildImageMarkdown('.png', '/uploads/abc.png')).toBe('![image](/uploads/abc.png) {width:325px}');
		expect(buildImageMarkdown('', '/uploads/abc.png')).toBe('![image](/uploads/abc.png) {width:325px}');
	});

	it('keeps a filename that has no extension', ()=>{
		expect(buildImageMarkdown('portrait', '/uploads/abc.jpg')).toBe('![portrait](/uploads/abc.jpg) {width:325px}');
	});
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `NODE26 npx jest tests/snippets/imageUpload.test.js`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the snippet module**

Create `themes/V3/Blank/snippets/imageUpload.gen.js`:

```js
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

export const buildImageMarkdown = (fileName, url)=>{
	const alt = String(fileName ?? '')
		.replace(/\.[^.]*$/, '')
		.replace(/[\r\n]+/g, ' ')
		.replace(/[\[\]\\]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return `![${alt || 'image'}](${url}) {width:325px}`;
};

// Resolves to the chosen File, or null if the picker is dismissed
const pickFile = ()=>new Promise((resolve)=>{
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = ACCEPT;
	input.addEventListener('change', ()=>resolve(input.files[0] ?? null));
	input.addEventListener('cancel', ()=>resolve(null));
	input.click();
});

const upload = async (file)=>{
	const body = new FormData();
	body.append('image', file);
	const res = await fetch('/api/upload/image', { method: 'POST', body });
	const data = await res.json().catch(()=>({}));
	if(!res.ok) throw new Error(data.error || `The server answered ${res.status}.`);
	return data.url;
};

export default async ()=>{
	const file = await pickFile();
	if(!file) return '';
	try {
		const url = await upload(file);
		return buildImageMarkdown(file.name, url);
	} catch (err) {
		alert(`Image upload failed: ${err.message}`);
		return '';
	}
};
```

The module touches `document`, `fetch` and `alert` only inside functions, so Jest can import it in its default Node environment to test `buildImageMarkdown`.

`pickFile` calls `input.click()` synchronously when the snippet runs. That must stay true: browsers open a file picker only during the click that asked for it, so nothing may be awaited before it.

- [ ] **Step 4: Run it and see it pass**

Run: `NODE26 npx jest tests/snippets/imageUpload.test.js`
Expected: PASS, 6 tests. If the bracket-injection expectation differs by a character, work out by hand what the three replacements produce and correct whichever of test or code is wrong against this rule: no `[`, `]`, backslash or line break may survive in the alt text.

- [ ] **Step 5: Confirm the icon exists**

Run: `grep -rl 'fa-upload' client themes shared | head -3`
Expected: at least one file. If none, use `fas fa-image` (already used by the neighbouring "Image" snippet) in the next step instead.

- [ ] **Step 6: Add the menu entry**

In `themes/V3/Blank/snippets.js`, add the import after the `ImageMaskGen` import:

```js
import ImageMaskGen              from './snippets/imageMask.gen.js';
import ImageUploadGen            from './snippets/imageUpload.gen.js';
```

and add the entry as the first item of the Images group:

```js
	/*********************** IMAGES *******************/
	{
		groupName : 'Images',
		icon      : 'fas fa-images',
		view      : 'text',
		snippets  : [
			{
				name : 'Upload Image',
				icon : 'fas fa-upload',
				gen  : ImageUploadGen
			},
			{
				name : 'Image',
```

- [ ] **Step 7: Make the snippet bar await the result**

In `client/homebrew/editor/snippetbar/snippetbar.jsx`, inside `SnippetGroup`:

Old:

```js
	const handleSnippetClick = (e, snippet)=>{
		onSnippetClick(execute(snippet.gen, props));
	};
```

New:

```js
	const handleSnippetClick = async (e, snippet)=>{
		// A snippet's gen may return its text directly or as a promise
		const text = await execute(snippet.gen, props);
		if(text) onSnippetClick(text);
	};
```

`execute(...)` still runs synchronously inside the click, before the first `await` yields, which is what keeps the file picker allowed. Existing snippets return strings and pass through `await` unchanged.

- [ ] **Step 8: Check what else calls into the changed path**

Run: `grep -n "handleSnippetClick\|onSnippetClick\|execute(" client/homebrew/editor/snippetbar/snippetbar.jsx`

Read every hit. Expected: the outer `SnippetBar.handleSnippetClick` (a different function, taking text) and the one `execute` call just changed. If anything else calls `execute` and relies on a string coming back at once, it must be given the same treatment or left on a separate path: say which in the report.

- [ ] **Step 9: Lint and run the tests**

Run: `NODE26 npx eslint themes/V3/Blank/snippets/imageUpload.gen.js themes/V3/Blank/snippets.js client/homebrew/editor/snippetbar/snippetbar.jsx tests/snippets/imageUpload.test.js`
Expected: no new problems in changed lines.

Run: `NODE26 npm test 2>&1 | tail -25; echo "exit $?"`
Expected: baseline plus the new suites.

- [ ] **Step 10: Commit**

```bash
git branch --show-current
git add themes/V3/Blank/snippets/imageUpload.gen.js themes/V3/Blank/snippets.js client/homebrew/editor/snippetbar/snippetbar.jsx tests/snippets/imageUpload.test.js
git diff --cached --numstat
git commit -m "Add Upload Image entry to the Images snippet menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Docker persistence, then prove it in a browser

**Files:**
- Modify: `docker-compose.yml`, `.dockerignore`, `vite.config.js`

**Interfaces:**
- Consumes: everything above.
- Produces: the finished, running app, and a written record of what was and was not verified.

- [ ] **Step 1: Add the volume**

Replace `docker-compose.yml` with:

```yaml
services:
  mongodb:
    image: mongo:latest
    volumes:
      - mongodata:/data/db
  homebrewery:
    build:
      context: .
      dockerfile: Dockerfile
    image: homebrewery
    environment:
      MONGODB_URI: mongodb://mongodb/homebrewery
    ports:
      - "8000:8000"
    volumes:
      - uploads:/usr/src/app/uploads
volumes:
  mongodata:
  uploads:
```

Run: `git diff --numstat docker-compose.yml`
Expected: `3	0	docker-compose.yml`.

`/usr/src/app` is the `WORKDIR` in upstream's `Dockerfile`, and `server/app.js` changes directory to the project root at start-up, so the default `uploads` resolves to that path.

- [ ] **Step 2: Keep the upload directory out of the image and out of Vite's watcher**

Append one line to `.dockerignore`:

```
uploads
```

In `vite.config.js`, change the `server` block:

Old:

```js
	server : {
		port : 8000,
		fs   : {
			allow : ['.'],
		},
	},
```

New:

```js
	server : {
		port : 8000,
		fs   : {
			allow : ['.'],
		},
		watch : {
			ignored : ['**/uploads/**'],
		},
	},
```

- [ ] **Step 3: Build and start**

```bash
docker compose up --build -d
docker compose ps
docker compose logs homebrewery | tail -20
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/
```

Expected: both services up, `200`.

- [ ] **Step 4: Prove the running container has the new code**

A `200` from `/` says nothing about whether this build contains the change.

Run: `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8000/api/upload/image`
Expected: `400` with a JSON body. Compare with what Task 1 Step 10's unmodified build would give: upstream has no such route, so its catch-all in `server/app.js` (`if(!req.route) return res.redirect('/')`) answers instead. The difference is what makes this a check. If it is not `400`, the image was not rebuilt: run `docker compose build --no-cache homebrewery` and start again.

- [ ] **Step 5: Upload from the command line and fetch it as a browser would**

```bash
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\x00' > /tmp/hb-probe.png
URL=$(curl -s -F image=@/tmp/hb-probe.png http://localhost:8000/api/upload/image | sed 's/.*"url":"\([^"]*\)".*/\1/')
echo "$URL"
curl -s -D - -o /tmp/hb-probe.back -H 'Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8' "http://localhost:8000$URL" | head -12
cmp /tmp/hb-probe.png /tmp/hb-probe.back && echo SAME
```

Expected: a URL of the form `/uploads/<id>.png`; status `200`; `Content-Type: image/png`; `X-Content-Type-Options: nosniff`; `SAME`.

Then the rejections:

```bash
echo 'not an image' > /tmp/hb-probe.txt
curl -s -w ' %{http_code}\n' -F 'image=@/tmp/hb-probe.txt;filename=x.png;type=image/png' http://localhost:8000/api/upload/image
curl -s -w ' %{http_code}\n' -H 'Sec-Fetch-Site: cross-site' -F image=@/tmp/hb-probe.png http://localhost:8000/api/upload/image
```

Expected: `415` with the type message, then `403`.

- [ ] **Step 6: Prove the image survives a rebuild**

```bash
docker compose down
docker compose up --build -d
curl -s -o /dev/null -w '%{http_code}\n' -H 'Accept: image/*' "http://localhost:8000$URL"
```

Expected: `200`. Do not pass `-v` to `down`.

- [ ] **Step 7: Drive the real menu in a browser**

Use the Playwright browser tools (load them with one ToolSearch call). Prepare a real picture first, since the probe file is only a header and will not render: any small PNG on the machine will do, for example `sips -s format png /System/Library/CoreServices/DefaultDesktop.heic --out /tmp/hb-real.png -Z 400` or a screenshot.

1. Open `http://localhost:8000/new`.
2. Click in the editor where the image should go, then open the Images menu in the snippet bar and confirm "Upload Image" is listed. Note its position: the spec asks for first, and the theme merge in `snippetbar.jsx` (`mergeCustomizer`) may order it differently. Report the position seen.
3. Click "Upload Image", supply `/tmp/hb-real.png` to the file chooser.
4. Confirm a line of the form `![hb-real](/uploads/<id>.png) {width:325px}` appears in the editor at the cursor.
5. Confirm the picture is drawn in the preview pane: take a screenshot, and also evaluate `[...document.querySelectorAll('img')].map(i=>[i.src, i.naturalWidth])` in the preview's document (it may be inside an iframe) and expect a non-zero `naturalWidth` for the `/uploads/` image. A broken image has `naturalWidth` 0, which a screenshot alone can hide.
6. Confirm the page did not reload when the file arrived (the text typed in step 2 is still there).
7. Click "Upload Image" again and dismiss the chooser. Expect nothing inserted and no error.
8. Click "Upload Image" and supply `/tmp/hb-probe.txt` renamed to `/tmp/hb-fake.png`. Expect a dialog reading "Image upload failed: Only PNG, JPEG, GIF and WebP images are accepted." and nothing inserted. Accept the dialog through the tool's dialog handler straight away, since an open dialog blocks every other browser command.
9. Click two existing snippets (Images, "Image"; Text Editor, "Column Break") and confirm each still inserts its text.
10. Save the brew, open its share link, and confirm the uploaded picture is drawn there too (`naturalWidth` again). This is the check on the relative URL that the spec left open. If it fails here or in step 5, change `buildImageMarkdown`'s caller to pass `` `${window.location.origin}${url}` ``, update the spec's "What gets inserted" section, and repeat steps 3 to 5 and this step.

If the browser tools cannot reach a step (the file chooser cannot be driven, the preview frame cannot be read), do not substitute a code-reading argument. Record that step as not verified and say why.

- [ ] **Step 8: Run the control**

Check out upstream's snippet bar only, rebuild, and confirm the feature stops working, so the pass in Step 7 is known to come from the change:

```bash
git checkout upstream/master -- client/homebrew/editor/snippetbar/snippetbar.jsx
docker compose up --build -d
```

In the browser, click "Upload Image" and choose `/tmp/hb-real.png`. Expected: no image markdown is inserted (the un-awaited promise is passed to the editor instead). Record what actually appears.

Restore (the fix is committed, so this is safe):

```bash
git checkout HEAD -- client/homebrew/editor/snippetbar/snippetbar.jsx
git status --short
docker compose up --build -d
```

Expected: `git status --short` shows only the three files from Steps 1 and 2. Repeat browser steps 3 to 5 once to confirm the feature is back.

- [ ] **Step 9: Final full test run**

Run: `NODE26 npm test 2>&1 | tail -25; echo "exit $?"`
Expected: baseline plus the new suites, same exit code as the previous full run.

- [ ] **Step 10: Commit**

```bash
git branch --show-current
git add docker-compose.yml .dockerignore vite.config.js
git diff --cached --numstat
git commit -m "Persist uploaded images in a Docker volume

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 11: Report**

Leave the app running. Report, in this order:

1. The address to open and the two commands to stop and start it (`docker compose down`, `docker compose up -d`), with the warning that `down -v` deletes brews and images.
2. What was verified, step by step, with the observed result for each browser step.
3. What was not verified and why. At minimum this always includes: print to PDF if it was not exercised, and any browser step that could not be driven.
4. The limits the spec accepted: no login on upload, images tied to this instance, no clean-up when a brew is deleted, Legacy renderer menu unchanged, and the menu click path covered by hand and by the Step 8 control but by no automated test.
5. The baseline test result from Task 1 next to the final one.
6. Anything that differed from this plan, including the position of the menu entry and whether the URL stayed relative.

Nothing is pushed anywhere. The branch exists only on this machine.
