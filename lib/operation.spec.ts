import { expect } from '~/tests';

import { Operation } from './operation';

describe('Operation', () => {
	describe('all', () => {
		it('combines a dictionary of testable objects into an operation that takes a dictionary state', async () => {
			const lenGtFive = {
				state: (s: string) => Promise.resolve(s),
				test: (_: string, s: string) => s.length > 5,
			};
			const numGtSix = {
				state: (s: string) => Promise.resolve(s.length),
				test: (_: string, x: number) => x > 6,
			};

			const op = Operation.all({ lenGtFive, numGtSix });

			expect(await op.state('hello')).to.deep.equal({
				lenGtFive: 'hello',
				numGtSix: 5,
			});
			expect(op.test('', { lenGtFive: 'goodbye', numGtSix: 7 })).to.be.true;
			expect(op.test('', { lenGtFive: 'goodbye', numGtSix: 5 })).to.be.false;
			expect(op.test('', { lenGtFive: 'hello', numGtSix: 7 })).to.be.false;
			expect(op.test('', { lenGtFive: 'hello', numGtSix: 5 })).to.be.false;
		});

		it('combines a list of testable objects into an operation that takes a list state', async () => {
			const lenGtFive = {
				state: (s: string) => Promise.resolve(s),
				test: (_: string, s: string) => s.length > 5,
			};
			const numGtSix = {
				state: (s: string) => Promise.resolve(s.length),
				test: (_: string, x: number) => x > 6,
			};

			const op = Operation.all([lenGtFive, numGtSix]);

			expect(await op.state('hello')).to.deep.equal(['hello', 5]);
			expect(op.test('', ['goodbye', 7])).to.be.true;
			expect(op.test('', ['goodbye', 5])).to.be.false;
			expect(op.test('', ['hello', 7])).to.be.false;
			expect(op.test('', ['hello', 5])).to.be.false;
		});
	});

	describe('and', () => {
		it('combines a dictionary of testable objects into an operation that takes a dictionary state', async () => {
			const lenGtFive = {
				state: (s: string) => Promise.resolve(s),
				test: (_: string, s: string) => s.length > 5,
			};
			const numGtSix = {
				state: (s: string) => Promise.resolve(s.length),
				test: (_: string, x: number) => x > 6,
			};

			const op = Operation.and({ lenGtFive, numGtSix });

			expect(await op.state('hello')).to.deep.equal({
				lenGtFive: 'hello',
				numGtSix: 5,
			});
			expect(op.test('', { lenGtFive: 'goodbye', numGtSix: 7 })).to.be.true;
			expect(op.test('', { lenGtFive: 'goodbye', numGtSix: 5 })).to.be.false;
			expect(op.test('', { lenGtFive: 'hello', numGtSix: 7 })).to.be.false;
			expect(op.test('', { lenGtFive: 'hello', numGtSix: 5 })).to.be.false;
		});

		it('combines a list of testable objects into an operation that takes a list state', async () => {
			const lenGtFive = {
				state: (s: string) => Promise.resolve(s),
				test: (_: string, s: string) => s.length > 5,
			};
			const numGtSix = {
				state: (s: string) => Promise.resolve(s.length),
				test: (_: string, x: number) => x > 6,
			};

			const op = Operation.and([lenGtFive, numGtSix]);

			expect(await op.state('hello')).to.deep.equal(['hello', 5]);
			expect(op.test('', ['goodbye', 7])).to.be.true;
			expect(op.test('', ['goodbye', 5])).to.be.false;
			expect(op.test('', ['hello', 7])).to.be.false;
			expect(op.test('', ['hello', 5])).to.be.false;
		});
	});

	describe('or', () => {
		it('combines a dictionary of testable objects into an operation that takes a dictionary state', async () => {
			const lenGtFive = {
				state: (s: string) => Promise.resolve(s),
				test: (_: string, s: string) => s.length > 5,
			};
			const numGtSix = {
				state: (s: string) => Promise.resolve(s.length),
				test: (_: string, x: number) => x > 6,
			};

			const op = Operation.or({ lenGtFive, numGtSix });

			expect(await op.state('hello')).to.deep.equal({
				lenGtFive: 'hello',
				numGtSix: 5,
			});
			expect(op.test('', { lenGtFive: 'goodbye', numGtSix: 7 })).to.be.true;
			expect(op.test('', { lenGtFive: 'goodbye', numGtSix: 5 })).to.be.true;
			expect(op.test('', { lenGtFive: 'hello', numGtSix: 7 })).to.be.true;
			expect(op.test('', { lenGtFive: 'hello', numGtSix: 5 })).to.be.false;
		});

		it('combines a list of testable objects into an operation that takes a list state', async () => {
			const lenGtFive = {
				state: (s: string) => Promise.resolve(s),
				test: (_: string, s: string) => s.length > 5,
			};
			const numGtSix = {
				state: (s: string) => Promise.resolve(s.length),
				test: (_: string, x: number) => x > 6,
			};

			const op = Operation.or([lenGtFive, numGtSix]);

			expect(await op.state('hello')).to.deep.equal(['hello', 5]);
			expect(op.test('', ['goodbye', 7])).to.be.true;
			expect(op.test('', ['goodbye', 5])).to.be.true;
			expect(op.test('', ['hello', 7])).to.be.true;
			expect(op.test('', ['hello', 5])).to.be.false;
		});
	});

	describe('any', () => {
		it('combines a dictionary of testable objects into an operation that takes a dictionary state', async () => {
			const lenGtFive = {
				state: (s: string) => Promise.resolve(s),
				test: (_: string, s: string) => s.length > 5,
			};
			const numGtSix = {
				state: (s: string) => Promise.resolve(s.length),
				test: (_: string, x: number) => x > 6,
			};

			const op = Operation.any({ lenGtFive, numGtSix });

			expect(await op.state('hello')).to.deep.equal({
				lenGtFive: 'hello',
				numGtSix: 5,
			});
			expect(op.test('', { lenGtFive: 'goodbye', numGtSix: 7 })).to.be.true;
			expect(op.test('', { lenGtFive: 'goodbye', numGtSix: 5 })).to.be.true;
			expect(op.test('', { lenGtFive: 'hello', numGtSix: 7 })).to.be.true;
			expect(op.test('', { lenGtFive: 'hello', numGtSix: 5 })).to.be.false;
		});

		it('combines a list of testable objects into an operation that takes a list state', async () => {
			const lenGtFive = {
				state: (s: string) => Promise.resolve(s),
				test: (_: string, s: string) => s.length > 5,
			};
			const numGtSix = {
				state: (s: string) => Promise.resolve(s.length),
				test: (_: string, x: number) => x > 6,
			};

			const op = Operation.any([lenGtFive, numGtSix]);

			expect(await op.state('hello')).to.deep.equal(['hello', 5]);
			expect(op.test('', ['goodbye', 7])).to.be.true;
			expect(op.test('', ['goodbye', 5])).to.be.true;
			expect(op.test('', ['hello', 7])).to.be.true;
			expect(op.test('', ['hello', 5])).to.be.false;
		});
	});
});
