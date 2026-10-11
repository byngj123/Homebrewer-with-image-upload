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
	input.style.display = 'none';
	// The input stays in the document until a choice is made, then is removed
	const settle = (file)=>{
		input.remove();
		resolve(file);
	};
	input.addEventListener('change', ()=>settle(input.files[0] ?? null));
	input.addEventListener('cancel', ()=>settle(null));
	document.body.appendChild(input);
	input.click();
});

const upload = async (file)=>{
	const body = new FormData();
	body.append('image', file);
	const res = await fetch('/api/upload/image', { method: 'POST', body });
	const data = await res.json().catch(()=>({}));
	if(!res.ok) throw new Error(data.error || `The server answered ${res.status}.`);
	if(typeof data.url !== 'string' || !data.url) throw new Error('The server did not return an image address.');
	return data.url;
};

export default async ()=>{
	const file = await pickFile();
	if(!file) return null;
	try {
		const url = await upload(file);
		return buildImageMarkdown(file.name, url);
	} catch (err) {
		alert(`Image upload failed: ${err.message}`);
		return null;
	}
};
