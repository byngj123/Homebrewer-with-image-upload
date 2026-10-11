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
