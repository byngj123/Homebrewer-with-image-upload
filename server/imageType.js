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
