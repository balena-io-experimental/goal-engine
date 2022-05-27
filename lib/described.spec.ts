import { expect } from '~/tests';

import { Described } from './described';

describe('Described', () => {
	describe('of', () => {
		it('creates a described of an object', () => {
			const d = Described.of({ a: 1 }, () => `this is a description`);
			expect(d.description(0)).to.equal('this is a description');
			expect(d.a).to.equal(1);
		});

		it('creates a described of a function', () => {
			const d = Described.of(
				() => 1,
				() => `this is a description`,
			);
			expect(d.description(0)).to.equal('this is a description');
			expect(d()).to.equal(1);
		});

		it('creates a described of a function, keeping any existing enumerable properties', () => {
			const f = Object.assign(() => 1, { myprop: 'hello' });
			const d = Described.of(f, () => 'this is a description');
			expect(d.description(0)).to.equal('this is a description');
			expect(d()).to.equal(1);
			expect(f).to.not.have.property('description');
			expect(d.myprop).to.equal('hello');
		});
	});
});
