import { expect } from '~/tests';

import { Test } from './test';

describe('Test', () => {
	describe('all', () => {
		it('combines a dictionary of tests into a tests that takes a dictionary state', async () => {
			const lenGtFive = (_: string, s: string) => s.length > 5;
			const numGtSix = (_: string, x: number) => x > 6;

			const tester = Test.all({ lenGtFive, numGtSix });

			// Succeeds when all of the tests succeed
			expect(tester('', { lenGtFive: 'goodbye', numGtSix: 7 })).to.be.true;
			expect(tester('', { lenGtFive: 'goodbye', numGtSix: 5 })).to.be.false;
			expect(tester('', { lenGtFive: 'hello', numGtSix: 7 })).to.be.false;
			expect(tester('', { lenGtFive: 'hello', numGtSix: 5 })).to.be.false;
		});

		it('combines a list of test into a test that takes a list as state', async () => {
			const lenGtFive = (_: string, s: string) => s.length > 5;
			const numGtSix = (_: string, x: number) => x > 6;

			const tester = Test.all([lenGtFive, numGtSix]);
			// Succeeds when all of the tests succeed
			expect(tester('', ['goodbye', 7])).to.be.true;
			expect(tester('', ['goodbye', 5])).to.be.false;
			expect(tester('', ['hello', 7])).to.be.false;
			expect(tester('', ['hello', 5])).to.be.false;
		});
	});

	describe('map', () => {
		it('create a new Test by using a transformation function', async () => {
			const numGtFive = (x: number, _: number) => x > 5;
			const lenGtFive = Test.map(numGtFive, (s: string) => s.length);

			expect(lenGtFive('hello', 0)).to.be.false;
			expect(lenGtFive('goodbye', 0)).to.be.true;
		});
	});

	describe('any', () => {
		it('combines a dictionary of tests into a tests that takes a dictionary state', async () => {
			const lenGtFive = (_: string, s: string) => s.length > 5;
			const numGtSix = (_: string, x: number) => x > 6;

			const tester = Test.any({ lenGtFive, numGtSix });

			// Succeeds when any of the tests succeed
			expect(tester('', { lenGtFive: 'goodbye', numGtSix: 7 })).to.be.true;
			expect(tester('', { lenGtFive: 'goodbye', numGtSix: 5 })).to.be.true;
			expect(tester('', { lenGtFive: 'hello', numGtSix: 7 })).to.be.true;
			expect(tester('', { lenGtFive: 'hello', numGtSix: 4 })).to.be.false;
		});

		it('combines a list of test into a test that takes a list as state', async () => {
			const lenGtFive = (_: string, s: string) => s.length > 5;
			const numGtSix = (_: string, x: number) => x > 6;

			const tester = Test.any([lenGtFive, numGtSix]);
			// Succeeds when any of the tests succeed
			expect(tester('', ['goodbye', 7])).to.be.true;
			expect(tester('', ['goodbye', 5])).to.be.true;
			expect(tester('', ['hello', 7])).to.be.true;
			expect(tester('', ['hello', 4])).to.be.false;
		});
	});
});
