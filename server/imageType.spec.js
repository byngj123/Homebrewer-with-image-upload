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
