import { DEFAULT_BREW, DEFAULT_BREW_LOAD, DEFAULT_NEW_BREW } from './brewDefaults.js';

describe('brew defaults', ()=>{
	it('gives a blank new brew an A4 page size style', ()=>{
		expect(DEFAULT_NEW_BREW.style).toMatch(/\.page\s*\{[^}]*width\s*:\s*210mm;[^}]*height\s*:\s*296\.8mm;[^}]*\}/);
	});

	it('keeps every other new brew default as it is for any brew', ()=>{
		expect({ ...DEFAULT_NEW_BREW, style: undefined }).toEqual(DEFAULT_BREW);
	});

	it('leaves the defaults applied to saved and loaded brews without a style', ()=>{
		expect(DEFAULT_BREW.style).toBeUndefined();
		expect(DEFAULT_BREW_LOAD.style).toBeUndefined();
	});
});
