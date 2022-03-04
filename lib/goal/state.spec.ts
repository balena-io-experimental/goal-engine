import { expect } from '~/tests';

import { state, map } from './state';

describe('State', () => {
	describe('state', () => {
		it('combines simple states into complex state', async () => {
			const hello = (x: string) => Promise.resolve(`Hello ${x}!!`);
			const goodbye = (x: string) => Promise.resolve(`Goodbye ${x}!!`);

			const greetings = state({ hello, goodbye });

			expect(await greetings('world')).to.deep.equal({
				hello: 'Hello world!!',
				goodbye: 'Goodbye world!!',
			});
		});
	});

	describe('map', () => {
		it('create a new State by using a transformation function', async () => {
			const hello = (x: string) => Promise.resolve(`Hello ${x}!!`);

			const length = map(hello, (c: number) => String(c));

			expect(await length(123)).to.deep.equal('Hello 123!!');
		});
	});
});
