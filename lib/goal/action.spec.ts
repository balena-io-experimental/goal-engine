import { expect } from '~/tests';

import { Action } from './action';

describe('Action', () => {
	describe('map', () => {
		it('create a new Test by using a transformation function', async () => {
			const num = (x: number) =>
				x > 5 ? Promise.resolve(x) : Promise.reject(x);
			const str = Action.map(num, (s: string) => s.length);

			await expect(num(5)).to.be.rejected;
			await expect(str('hello', 0)).to.be.rejected;
			await expect(str('goodbye', 0)).to.be.fulfilled;
		});
	});
});
