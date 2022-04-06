import { Seekable } from './seekable';
import { Link } from './link';
import { State } from './state';
import { Test } from './test';
import { Action } from './action';

import { tuple, TupleStates } from './combinators';

// Utility type to make some properties of a type optional
type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// This is the interface users will most likely operate with
export interface Goal<TContext = any, TState = any>
	extends Seekable<TContext, TState> {
	map<TInputContext>(
		f: (c: TInputContext) => TContext,
	): Goal<TInputContext, TState>;
	seek(c: TContext): Promise<boolean>;
}

export interface LinkedGoal<TContext = any, TState = any>
	extends Goal<TContext, TState>,
		Link<TContext, TState> {}

// Create a single goal from a seekable input
function one<TContext = any, TState = any>({
	state,
	test: _test = (_: TContext, s: TState) => !!s,
	action: _action = () => Promise.resolve(void 0),
	before: _before = Always,
	after: _after = Always,
	...extra // Additional properties from seekable
}: WithOptional<
	Seekable<TContext, TState>,
	'test' | 'action' | 'before' | 'after'
>): Goal<TContext, TState> {
	const goal = {
		state,
		test: _test,
		action: _action,
		before: _before,
		after: _after,
		...extra,
		map<TInputContext>(
			f: (c: TInputContext) => TContext,
		): Goal<TInputContext, TState> {
			return map(goal, f);
		},
		seek(c: TContext): Promise<boolean> {
			return seek(goal, c);
		},
	};

	return goal;
}

/**
 * Create a goal from a given Seekable interface
 */
export function of<TContext = any>({
	state,
}: WithOptional<
	Seekable<TContext, boolean>,
	'test' | 'action' | 'before' | 'after'
>): Goal<TContext, boolean>;
export function of<TContext = any, TState = any>({
	state,
	test,
}: WithOptional<
	Seekable<TContext, TState>,
	'action' | 'before' | 'after'
>): Goal<TContext, TState>;
export function of<
	TContext = any,
	TState = any,
	TTuple extends Array<Seekable<TContext>> = Array<Seekable<TContext>>,
>(
	goals: [Seekable<TContext, TState>, ...TTuple],
): Goal<TContext, [TState, ...TupleStates<TTuple, TContext>]>;
export function of<TContext = any, TState = any>(
	input:
		| WithOptional<
				Seekable<TContext, TState>,
				'test' | 'action' | 'before' | 'after'
		  >
		| [Seekable<TContext>, ...Array<Seekable<TContext>>],
) {
	if (Array.isArray(input)) {
		return one(tuple(input));
	} else {
		return one(input);
	}
}

/**
 * Transform a goal that receives a context A  into a goal that receives
 * a context B by applying a transformation function
 */
export function map<TContext = any, TState = any, TInputContext = any>(
	g: Seekable<TContext, TState>,
	f: (c: TInputContext) => TContext,
): Goal<TInputContext, TState> {
	return of({
		state: State.map(g.state, f),
		test: Test.map(g.test, f),
		action: Action.map(g.action, f),
		...(g.before && { before: map(g.before, f) }),
		...(g.after && { after: map(g.after, f) }),
	});
}

/**
 * Try to reach the goal given an initial context
 */
export async function seek<TContext = any, TState = any>(
	goal: Seekable<TContext, TState>,
	ctx: TContext,

	// TODO: use TaskEither<Error, boolean> as the re
): Promise<boolean> {
	const s = await goal.state(ctx);
	if (goal.test(ctx, s)) {
		// The goal has been met
		return true;
	}

	// Check if pre-conditions are met
	if (!!goal.before && !(await seek(goal.before, ctx))) {
		// Cannot try the goal action since some preconditions are not met
		return false;
	}

	// Run the action
	await goal.action(ctx, s);

	// Get the state again and run the test with the
	// new state. If the state could not be met, something
	// failed (reason is unknown at this point)
	if (!goal.test(ctx, await goal.state(ctx))) {
		return false;
	}

	// The goal is achieved if the postconditions are met.
	return !goal.after || seek(goal.after, ctx);
}

// A goal that is always met
export const Always = of({ state: () => Promise.resolve(true) });

// A goal that can never be met
export const Never = of({ state: () => Promise.resolve(false) });

// Combinator to extend a goal with an action
// note that this can be applied to a link but it will change
// the runtime behavior
export const action = <TContext = any, TState = any>(
	goal: Seekable<TContext, TState>,
	_action: Action<TContext, TState>,
): Goal<TContext, TState> => {
	return of({ ...goal, action: _action });
};

// Combinator to extend a goal with a before goal
export const before = <TContext = any, TState = any>(
	goal: Seekable<TContext, TState>,
	_before: Seekable<TContext>,
): Goal<TContext, TState> => {
	return of({ ...goal, before: _before });
};

export const after = <TContext = any, TState = any>(
	goal: Seekable<TContext, TState>,
	_after: Seekable<TContext>,
): Goal<TContext, TState> => {
	return of({ ...goal, after: _after });
};

export const Goal = {
	of,
	map,
	seek,
	action,
	before,
	after,
};

export default Goal;
