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
