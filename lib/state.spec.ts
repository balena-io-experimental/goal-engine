import { expect } from '~/tests';

import { State } from './state';

describe('State', () => {
	describe('of', () => {
		it('combines a dictionary states into complex state', async () => {
			const hello = (x: string) => Promise.resolve(`Hello ${x}!!`);
			const goodbye = (x: string) => Promise.resolve(`Goodbye ${x}!!`);

			const greetings = State.of({ hello, goodbye });

			expect(await greetings('world')).to.deep.equal({
				hello: 'Hello world!!',
				goodbye: 'Goodbye world!!',
			});
		});

		it('combines a list of states into state returning a tuple', async () => {
			const hello = (x: string) => Promise.resolve(`Hello ${x}!!`);
			const length = (x: string) => Promise.resolve(x.length);

			const greetings = State.of([hello, length]);

			expect(await greetings('world')).to.deep.equal(['Hello world!!', 5]);
		});

		it('accepts a single state argument', async () => {
			const hello = State.of((x: string) => Promise.resolve(`Hello ${x}!!`));
			expect(await hello('world')).to.deep.equal('Hello world!!');
		});
	});

	describe('map', () => {
		it('create a new State by using a transformation function', async () => {
			const hello = (x: string) => Promise.resolve(`Hello ${x}!!`);

			const length = State.map(hello, (c: number) => String(c));

			expect(await length(123)).to.deep.equal('Hello 123!!');
		});
	});
});
