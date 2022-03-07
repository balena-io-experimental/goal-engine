import { State } from './state';
import { Test } from './test';
import { Action } from './action';

// Utility type to make some properties of a type optional
type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export interface Seekable<TContext = any, TState = any> {
	// How to read the state
	readonly state: State<TContext, TState>;

	// How to test if the state matches the goal that we are seeking
	readonly test: Test<TContext, TState>;

	// If the goal has not been met, the action should let us reach the
	// goal given that all pre-conditions (or before-goals) are met
	readonly action: Action<TContext, TState>;

	// Requirements that need to be before entering the state
	// through the action
	readonly before: Seekable<TContext>;

	// Requirements that need to be met after entering the state
	readonly after: Seekable<TContext>;

	// TODO: should we add `always`, as invariants that need to be met both
	// before and after?
}

// This is the interface users will most likely operate with
export interface Goal<TContext = any, TState = any>
	extends Seekable<TContext, TState> {
	tries(a: Action<TContext, TState>): Goal<TContext, TState>;
	requires(b: Seekable<TContext>): Goal<TContext, TState>;
	afterwards(a: Seekable<TContext>): Goal<TContext, TState>;
	map<TInputContext>(
		f: (c: TInputContext) => TContext,
	): Goal<TInputContext, TState>;
	seek(c: TContext): Promise<boolean>;
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
export function of<TContext = any, TState = any>({
	state,
	test = (_: TContext, s: TState) => !!s,
	action = () => Promise.resolve(void 0),
	before = Always,
	after = Always,
}: WithOptional<
	Seekable<TContext, TState>,
	'test' | 'action' | 'before' | 'after'
>): Goal<TContext, TState> {
	const goal = {
		state,
		test,
		action,
		before,
		after,
		map<TInputContext>(
			f: (c: TInputContext) => TContext,
		): Goal<TInputContext, TState> {
			return map(goal, f);
		},
		seek(c: TContext): Promise<boolean> {
			return seek(goal, c);
		},
		tries(a: Action<TContext, TState>) {
			return tries(goal, a);
		},
		requires(b: Seekable<TContext>) {
			return requires(goal, b);
		},
		afterwards(a: Seekable<TContext>) {
			return afterwards(goal, a);
		},
	};

	return goal;
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
		before: map(g.before, f),
		after: map(g.after, f),
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
	if (!(await seek(goal.before, ctx))) {
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
	return seek(goal.after, ctx);
}

export const identity = <A>(a: A): A => a;

// A goal that is always met
export const Always = of({ state: () => Promise.resolve(true) });

// A goal that can never be met
export const Never = of({ state: () => Promise.resolve(false) });

// Combinator to extend a goal with an action
export const tries = <TContext = any, TState = any>(
	goal: Seekable<TContext, TState>,
	action: Action<TContext, TState>,
): Goal<TContext, TState> => {
	return of({ ...goal, action });
};

// Combinator to extend a goal with a before goal
export const requires = <TContext = any, TState = any>(
	goal: Seekable<TContext, TState>,
	before: Seekable<TContext>,
): Goal<TContext, TState> => {
	return of({ ...goal, before });
};

export const afterwards = <TContext = any, TState = any>(
	goal: Seekable<TContext, TState>,
	after: Seekable<TContext>,
): Goal<TContext, TState> => {
	return of({ ...goal, after });
};

export const Goal = {
	of,
	map,
	seek,
	tries,
	requires,
	afterwards,
};

export default Goal;
