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
