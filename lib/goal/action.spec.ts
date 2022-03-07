import { expect } from '~/tests';

import { Action } from './action';

describe('Action', () => {
	describe('of', () => {
		it('succeeds if all elements of the dictionary succeed', async () => {
			const hello = (_: number, x: string) => Promise.resolve(`Hello ${x}!!`);
			const goodbye = (_: number, x: string) =>
				Promise.resolve(`Goodbye ${x}!!`);

			const greetings = Action.of({ hello, goodbye });

			await expect(greetings(0, { hello: 'world', goodbye: 'world' })).to.be
				.fulfilled;
		});

		it('fails if any action in the dictionary fail', async () => {
			const hello = (_: number, x: string) => Promise.resolve(`Hello ${x}!!`);
			const goodbye = (_: number, x: string) =>
				Promise.reject(`Goodbye ${x}!!`);

			const greetings = Action.of({ hello, goodbye });

			await expect(
				greetings(0, { hello: 'world', goodbye: 'world' }),
			).to.be.rejectedWith(`Goodbye world!!`);
		});

		it('succeeds if all elements of the list succeed', async () => {
			const hello = (_: number, x: string) => Promise.resolve(`Hello ${x}!!`);
			const goodbye = (_: number, x: string) =>
				Promise.resolve(`Goodbye ${x}!!`);

			const greetings = Action.of([hello, goodbye]);

			await expect(greetings(0, ['johnny', 'world'])).to.be.fulfilled;
		});

		it('fails if any action in the list fail', async () => {
			const hello = (_: number, x: string) => Promise.resolve(`Hello ${x}!!`);
			const goodbye = (_: number, x: string) =>
				Promise.reject(`Goodbye ${x}!!`);

			const greetings = Action.of([hello, goodbye]);

			await expect(greetings(0, ['johnny', 'world'])).to.be.rejectedWith(
				`Goodbye world!!`,
			);
		});
	});

	describe('map', () => {
		it('create a new Test by using a transformation function', async () => {
			const num = (x: number, _: number) =>
				x > 5 ? Promise.resolve(x) : Promise.reject(x);
			const str = Action.map(num, (s: string) => s.length);

			await expect(num(5, 0)).to.be.rejected;
			await expect(str('hello', 0)).to.be.rejected;
			await expect(str('goodbye', 0)).to.be.fulfilled;
		});
	});
});
