import { expect } from '~/tests';

import { Goal, Always, Never } from './goal';
import * as sinon from 'sinon';
import { StateNotFound } from './state';

describe('Goal', function () {
	before(() => {
		console.log = () => void 0;
	});
	describe('map', () => {
		it('creates a goal with a different context type from an input goal', async () => {
			const LessThan256Chars = Goal.of({
				state: (x: number) => Promise.resolve(x <= 255),
			});
			const StringIsLessThan256Chars = LessThan256Chars.map(
				(x: string) => x.length,
			);

			expect(await Goal.seek(StringIsLessThan256Chars, 'hello')).to.be.true;
			expect(await StringIsLessThan256Chars.seek('a'.repeat(256))).to.be.false;
		});

		it('creates a goal with a different context type from an input tuple', async () => {
			const LessThan256Chars = Goal.of({
				state: (x: number) => Promise.resolve(x <= 255),
			});
			const combined = Goal.of([LessThan256Chars, LessThan256Chars]);

			const TupleElementsAreLessThan256Chars = combined.map(
				(x: string) => x.length,
			);

			expect(await Goal.seek(TupleElementsAreLessThan256Chars, 'hello')).to.be
				.true;
			expect(await TupleElementsAreLessThan256Chars.seek('a'.repeat(256))).to.be
				.false;
		});

		it('creates a goal with a different context type from an input dict', async () => {
			const LessThan256Chars = Goal.of({
				state: (x: number) => Promise.resolve(x <= 255),
			});

			// Not a super useful combinator. It's meant to just test the map
			const combined = Goal.of({
				one: LessThan256Chars,
				two: LessThan256Chars,
			});

			const DictElementsAreLessThan256Chars = combined.map(
				(x: string) => x.length,
			);

			expect(await Goal.seek(DictElementsAreLessThan256Chars, 'hello')).to.be
				.true;
			expect(await DictElementsAreLessThan256Chars.seek('a'.repeat(256))).to.be
				.false;
		});
	});

	describe('of', () => {
		it('infers the goal test function if the goal returns a boolean', async () => {
			// state is always true
			const myGoal = Goal.of({ state: () => Promise.resolve(true) });

			expect(await myGoal.test(void 0)).to.be.true;
			expect(await myGoal.seek(0)).to.be.true;
		});

		it('allows to define the test function even if the goal returns a boolean', async () => {
			// state is always true
			const myGoal = Goal.of({
				state: () => Promise.resolve(true),
				test: (_: unknown, s) => !s,
			});

			expect(await myGoal.test(void 0)).to.be.false;
			expect(await myGoal.seek(0)).to.be.false;
		});

		it('allows to combine goals as a tuple', async () => {
			const a = Goal.of({ state: () => Promise.resolve(10), test: () => true });
			const b = Goal.of({
				state: () => Promise.resolve('Hello World'),
				test: () => true,
			});

			const c = Goal.of([a, b]);
			expect(await c.state(0)).to.deep.equal([10, 'Hello World']);
			expect(await c.test(0)).to.be.true;
		});

		it('allows to combine goals as a dict', async () => {
			const num = Goal.of({
				state: (x: string) => Promise.resolve(x.length),
				test: (_) => true,
			});
			const str = Goal.of({
				state: (x: string) => Promise.resolve(`Hello ${x}`),
				test: (_) => true,
			});

			const combined = Goal.of({ number: num, string: str });
			expect(await combined.state('world')).to.deep.equal({
				number: 5,
				string: 'Hello world',
			});
			expect(await combined.test('world')).to.be.true;
		});
	});

	describe('seek', () => {
		it('succeeds if the goal has already been reached', async () => {
			const actionSpy = sinon.spy();
			const myGoal = Goal.action(Always, actionSpy);

			expect(await Goal.seek(myGoal, void 0)).to.be.true;
			expect(actionSpy).to.not.have.been.called;
		});

		it('fails if the goal has not been reached and there is no way to modify the state', async () => {
			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 0 };

			// another more complex goal
			const myGoal = Goal.of({
				state: (_: C) => Promise.resolve(state),
				test: (c: C, s: S) => s.count > c.threshold,
			});

			expect(await Goal.seek(myGoal, { threshold: 5 })).to.be.false;

			// state changes
			state.count = 6;

			// Now the goal succeeds
			expect(await Goal.seek(myGoal, { threshold: 5 })).to.be.true;
		});

		it('fails if getting the state throws a StateNotFound and modifying state fails', async () => {
			const action = sinon.spy();
			const myGoal = Goal.of({
				state: () =>
					Promise.reject(
						new StateNotFound(
							'could not get the state but this should be considered a test failure',
						),
					),
			}).action(action);

			expect(await Goal.seek(myGoal, null)).to.be.false;
			expect(action).to.have.been.called;
		});

		it('fails if getting the state throws a StateNotFound and there is no way to modify the state', async () => {
			const myGoal = Goal.of({
				state: () =>
					Promise.reject(
						new StateNotFound(
							'could not get the state but this should be considered a test failure',
						),
					),
			});

			expect(await Goal.seek(myGoal, null)).to.be.false;
		});

		it('calls the action to change the state if the goal has not been met yet', async () => {
			const actionSpy = sinon.spy();

			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 0 };

			// another more complex goal
			const myGoal = Goal.action(
				Goal.of({
					state: (_: C) => Promise.resolve(state),
					test: (c: C, s: S) => s.count > c.threshold,
				}),
				actionSpy,
			); // the action has no effect but it should be called nonetheless

			expect(await Goal.seek(myGoal, { threshold: 5 })).to.be.false;

			// The action should be called
			expect(actionSpy).to.have.been.calledOnce;
		});

		it('succeeds if calling the action causes the goal to be met', async () => {
			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 5 };

			// another more complex goal
			const otherGoal = Goal.of({
				state: (_: C) => Promise.resolve(state),
				test: (c: C, s: S) => s.count > c.threshold,
				action: () => {
					// Update the state
					state.count++;
					return Promise.resolve(void 0);
				},
			});

			expect(await Goal.seek(otherGoal, { threshold: 5 })).to.be.true;
			expect(state.count).to.equal(6);
		});

		it('does not try the action if before goals are not met', async () => {
			// a goal that is never met
			const myGoal = Never;

			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 0 };

			// another more complex goal
			const actionSpy = sinon.spy();
			const otherGoal = Goal.requires(
				Goal.action(
					Goal.of({
						state: (_: C) => Promise.resolve(state),
						test: (c: C, s: S) => s.count > c.threshold,
					}),
					actionSpy,
				),
				myGoal,
			);

			expect(await Goal.seek(otherGoal, { threshold: 5 })).to.be.false;
			expect(actionSpy).to.not.have.been.called;
		});

		it('only calls the action if before goals are met', async () => {
			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 0 };

			// another more complex goal
			const actionSpy = sinon.spy();
			const otherGoal = Goal.of({
				state: (_: C) => Promise.resolve(state),
				test: (c: C, s: S) => s.count > c.threshold,
				action: actionSpy,
			}).requires(Always);

			expect(await Goal.seek(otherGoal, { threshold: 5 })).to.be.false;
			expect(actionSpy).to.have.been.called;
		});

		it('tries to achieve before goals if the seeked goal is not met', async () => {
			const actionSpy = sinon.spy();
			const myGoal = Goal.action(Never, actionSpy);

			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 0 };

			// another more complex goal
			const otherGoal = Goal.of({
				state: (_: C) => Promise.resolve(state),
				test: (c: C, s: S) => s.count > c.threshold,
			}).requires(myGoal);

			expect(await Goal.seek(otherGoal, { threshold: 5 })).to.be.false;
			expect(actionSpy).to.have.been.called;
		});

		describe('Seeking operations', () => {
			it('and: fails at the first failure', async () => {
				const state = sinon.stub().resolves(true);
				const g = Goal.and([Always, Never, Goal.of({ state })]);
				expect(await Goal.seek(g, 0)).to.be.false;
				expect(state).to.not.have.been.called;
			});

			it('or: succeeds at the first success', async () => {
				const state = sinon.stub().resolves(false);
				const g = Goal.or([Never, Always, Goal.of({ state })]);
				expect(await Goal.seek(g, 0)).to.be.true;
				expect(state).to.not.have.been.called;
			});

			it('all: fails at the first failure', async () => {
				const state = sinon.stub().resolves(true);
				const g = Goal.all([Always, Never, Goal.of({ state })]);
				expect(await Goal.seek(g, 0)).to.be.false;
				expect(state).to.have.been.called;
			});

			it('any: succeeds at the first success', async () => {
				const state = sinon.stub().resolves(false);
				const g = Goal.any([Never, Always, Goal.of({ state })]);
				expect(await Goal.seek(g, 0)).to.be.true;
				expect(state).to.have.been.called;
			});
		});

		describe('Seeking combined goals', () => {
			it('succeds if all the goals in the tuple are able to be met', async () => {
				const g = Goal.of([Always, Always, Always]);
				expect(await Goal.seek(g, 0)).to.be.true;
			});

			it('fails if any of the goals in the tuple not able to be met', async () => {
				const g = Goal.of([Always, Never, Always]);
				expect(await Goal.seek(g, 0)).to.be.false;
			});

			it('succeeds if calling the actions in the tuple causes the goal to be met', async () => {
				type S = { count: number };

				const state: S = { count: 5 };

				const greaterThan = Goal.of({
					state: () => Promise.resolve(state),
					test: ({ min }: { min: number }, s) => s.count > min,
					action: () => {
						// Update the state
						state.count++;
						return Promise.resolve();
					},
				});

				const lowerThan = Goal.of({
					state: () => Promise.resolve(state),
					test: ({ max }: { max: number }, s) => s.count < max,
				});

				const combined = Goal.of([greaterThan, lowerThan]);

				// The combined goal is not met before the test
				expect(await combined.test({ min: 5, max: 8 })).to.be.false;
				expect(await Goal.seek(combined, { min: 5, max: 8 })).to.be.true;
				expect(state.count).to.equal(6);
				expect(await Goal.seek(combined, { min: 5, max: 6 })).to.be.false;
				// The action for the first goal only should be called once
				expect(state.count).to.equal(6);
			});

			it('succeds if all the goals in the dict are able to be met', async () => {
				const g = Goal.of({ one: Always, two: Always, three: Always });
				expect(await Goal.seek(g, 0)).to.be.true;
			});

			it('fails if any the goals in the dict is not able to be met', async () => {
				const g = Goal.of({ one: Always, two: Never, three: Always });
				expect(await Goal.seek(g, 0)).to.be.false;
			});

			it('succeeds if calling the actions in the dict causes the goal to be met', async () => {
				type S = { count: number };

				const state: S = { count: 5 };

				const greaterThan = Goal.of({
					state: () => Promise.resolve(state),
					test: ({ min }: { min: number }, s) => s.count > min,
					action: () => {
						// Update the state
						state.count++;
						return Promise.resolve();
					},
				});

				const lowerThan = Goal.of({
					state: () => Promise.resolve(state),
					test: ({ max }: { max: number }, s) => s.count < max,
				});

				const combined = Goal.of({ greaterThan, lowerThan });

				expect(await Goal.seek(combined, { min: 5, max: 8 })).to.be.true;
				expect(state.count).to.equal(6);
				expect(await Goal.seek(combined, { min: 5, max: 6 })).to.be.false;
				// The action for the first goal only should be called once
				expect(state.count).to.equal(6);
			});
		});
	});
});
