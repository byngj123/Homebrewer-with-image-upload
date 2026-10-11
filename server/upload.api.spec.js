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

	it('answers a missing upload itself instead of passing it to later routes', async ()=>{
		const app = express();
		app.use(createUploadApi({ uploadDir }));
		app.use((req, res)=>res.status(200).send('catch-all page'));

		await supertest(app).get('/uploads/nothing-here.png').expect(404);
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
