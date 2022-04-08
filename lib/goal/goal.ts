import { AssertionError } from 'assert';

import { State } from './state';
import { Test } from './test';
import { Action } from './action';
import { keys, values } from './utils';

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
	readonly before?: Link<TContext>;

	// Requirements that need to be met after entering the state
	readonly after?: Link<TContext>;
}

type Link<TContext = any, TState = any> =
	| Seekable<TContext, TState>
	| Operation<TContext>;

export const isSeekable = (x: unknown): x is Seekable =>
	x != null &&
	State.is((x as Seekable).state) &&
	typeof (x as Seekable).test === 'function' &&
	typeof (x as Seekable).action === 'function';

const Operations = ['and', 'or', 'any', 'all'] as const;
type Operator = typeof Operations[number];

export interface Operation<TContext = any> {
	readonly op: Operator;
	readonly links: Array<Link<TContext>>;
}

export const isOperation = (x: unknown): x is Operation =>
	x != null &&
	Operations.includes((x as Operation).op) &&
	// TODO: validate the array elements
	Array.isArray((x as Operation).links);

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

// Create a single goal from a seekable input
function fromSeekable<TContext = any, TState = any>({
	state,
	test: _test = (_: TContext, s: TState) => !!s,
	action: _action = () => Promise.resolve(void 0),
	before: _before = Always,
	after: _after = Always,
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

type TupleStates<
	T extends Array<Seekable<TContext>>,
	TContext = any,
> = T extends [Seekable<TContext, infer TState>, ...infer TTail]
	? TTail extends Array<Seekable<TContext>>
		? [TState, ...TupleStates<TTail, TContext>]
		: [TState]
	: [];

/**
 * Combine an array of state objects into a state that returns a tuple of
 * results
 */
const fromTuple = <
	TContext = any,
	TTuple extends Array<Seekable<TContext>> = Array<Seekable<TContext>>,
>(
	goals: TTuple,
): Goal<TContext, TupleStates<TTuple, TContext>> => {
	const bgoals = goals.map((g) => g.before).filter((g) => !!g) as Array<
		Seekable<TContext>
	>;
	const agoals = goals.map((g) => g.after).filter((g) => !!g) as Array<
		Seekable<TContext>
	>;
	return fromSeekable({
		state: State.of(goals.map((g) => g.state)) as State<
			TContext,
			TupleStates<TTuple, TContext>
		>,
		test: Test.all(goals.map((g) => g.test)),
		action: Action.of(goals.map((g) => g.action)),

		// Only add before/after goals if any to avoid infinite recursion
		...(bgoals.length > 0 && { before: fromTuple(bgoals) }),
		...(agoals.length > 0 && { before: fromTuple(agoals) }),
	});
};

// Infer the context from a dictionary. This will only make sense if all the states
// have the same context otherwise it will return invalid types like `number & string`
type DictionaryContext<
	T extends { [K in keyof TState]: Seekable<any, TState[K]> },
	TState = any,
> = T extends {
	[K in keyof TState]: Seekable<infer TContext, TState[K]>;
}
	? TContext
	: never;

/**
 * Combine a dictionary of seekable objects into a goal that operates on a dictionary of results as state*
 *
 * **Note**: All state objects must have the same context type
 * TODO: we have not found a way to reliably validate the inputs to prevent creating
 * combinators from incompatible types, however such combinators are unusable as the type
 * signature won't match anything.
 */
const fromDict = <
	TContext extends DictionaryContext<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Seekable<any, TState[K]>;
	} = {
		[K in keyof TState]: Seekable<any, TState[K]>;
	},
>(goals: {
	[K in keyof TState]: Seekable<TContext, TState[K]>;
}): Goal<TContext, { [K in keyof TState]: TState[K] }> => {
	const bgoals = values(goals)
		.map((g) => g.before)
		.filter((g) => !!g) as Array<Seekable<TContext>>;
	const agoals = values(goals)
		.map((g) => g.after)
		.filter((g) => !!g) as Array<Seekable<TContext>>;
	return fromSeekable({
		state: State.fromDict(
			keys(goals).reduce(
				(states, key) => ({ ...states, [key]: goals[key].state }),
				{} as { [K in keyof TState]: State<TContext, TState[K]> },
			),
		),
		test: Test.fromDict(
			keys(goals).reduce(
				(tests, key) => ({ ...tests, [key]: goals[key].test }),
				{} as { [K in keyof TState]: Test<TContext, TState[K]> },
			),
		),
		action: Action.fromDict(
			keys(goals).reduce(
				(actions, key) => ({ ...actions, [key]: goals[key].action }),
				{} as { [K in keyof TState]: Action<TContext, TState[K]> },
			),
		),

		// Before and after goals don't need to be a dictionary
		...(bgoals.length > 0 && { before: fromTuple(bgoals) }),
		...(agoals.length > 0 && { before: fromTuple(agoals) }),
	});
};

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
// From tuple
export function of<
	TContext = any,
	TState = any,
	TTuple extends Array<Seekable<TContext>> = Array<Seekable<TContext>>,
>(
	goals: [Seekable<TContext, TState>, ...TTuple],
): Goal<TContext, [TState, ...TupleStates<TTuple, TContext>]>;
// From dictionary
export function of<
	TContext extends DictionaryContext<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Seekable<any, TState[K]>;
	} = { [K in keyof TState]: Seekable<any, TState[K]> },
>(
	goals: {
		[K in keyof TState]: Seekable<TContext, TState[K]>;
	} & TStateDict,
): Goal<TContext, { [K in keyof TState]: TState[K] }>;
// Implementation
export function of<TContext = any, TState = any>(
	input:
		| WithOptional<
				Seekable<TContext, TState>,
				'test' | 'action' | 'before' | 'after'
		  >
		| [Seekable<TContext>, ...Array<Seekable<TContext>>]
		| { [K in keyof TState]: Seekable<TContext, TState[K]> },
) {
	if (Array.isArray(input)) {
		return fromTuple(input);
	} else if ('state' in input && State.is(input.state)) {
		return fromSeekable(input);
	} else {
		return fromDict(input as { [K in keyof TState]: Seekable<any, TState[K]> });
	}
}

/**
 * Transform a goal that receives a context A  into a goal that receives
 * a context B by applying a transformation function
 */
export function map<TContext = any, TState = any, TInputContext = any>(
	g: Seekable<TContext, TState>,
	f: (c: TInputContext) => TContext,
): Goal<TInputContext, TState>;
export function map<TContext = any, TState = any, TInputContext = any>(
	g: Link<TContext, TState>,
	f: (c: TInputContext) => TContext,
): Link<TInputContext, TState>;
export function map<TContext = any, TState = any, TInputContext = any>(
	g: Link<TContext, TState>,
	f: (c: TInputContext) => TContext,
): Goal<TInputContext, TState> | Link<TInputContext, TState> {
	if (isSeekable(g)) {
		return of({
			state: State.map(g.state, f),
			test: Test.map(g.test, f),
			action: Action.map(g.action, f),
			...(g.before && { before: map(g.before, f) }),
			...(g.after && { after: map(g.after, f) }),
		});
	} else if (isOperation(g)) {
		return { ...g, links: g.links.map((l) => map(l, f)) };
	}

	// Should never be callsed
	throw new AssertionError({
		message: 'Expected first parameter to be a goal or an operation',
		actual: g,
	});
}

/**
 * Try to reach the goal given an initial context
 */
export async function seek<TContext = any, TState = any>(
	goal: Link<TContext, TState>,
	ctx: TContext,
): Promise<boolean> {
	if (isSeekable(goal)) {
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
	} else if (isOperation(goal)) {
		switch (goal.op) {
			case 'and':
				return goal.links.reduce(
					(promise, link) =>
						// Terminate the chain when the first link fails
						promise.then((success) => success && seek(link, ctx)),
					Promise.resolve(true),
				);
			case 'or':
				return goal.links.reduce(
					(promise, link) =>
						// Terminate the chain  when the first link succeeds
						promise
							.then((success) => success || seek(link, ctx))
							// TODO: what to do with this error
							.catch(() => seek(link, ctx)),
					Promise.resolve(false),
				);
			case 'all':
				return (
					(await Promise.all(goal.links.map((link) => seek(link, ctx)))).filter(
						(r) => !r,
					).length === 0
				);
			case 'any':
				return Promise.any(goal.links.map((link) => seek(link, ctx)));
			default:
				return false;
		}
	}

	// Should never be reached
	throw new AssertionError({
		message: 'Expected first parameter to be a goal or an operation',
		actual: goal,
	});
}

// A goal that is always met
export const Always = of({ state: () => Promise.resolve(true) });

// A goal that can never be met
export const Never = of({ state: () => Promise.resolve(false) });

/**
 * Create an `and` operation between the links. An 'and' operation is run sequentially and
 * will fail when the first link fails.
 */
function and<TContext = any>(
	links: Array<Link<TContext>>,
): Operation<TContext> {
	return { op: 'and', links };
}

/**
 * Create an `or` operation between the links. An 'or' operation is run sequentially and
 * will succeed when the first link succeeds.
 */
function or<TContext = any>(links: Array<Link<TContext>>): Operation<TContext> {
	return { op: 'or', links };
}

/**
 * Parallel `and`. All links are seeked in parallel and the operation will only succeed
 * if all the linked goals succeed.
 */
function all<TContext = any>(
	links: Array<Link<TContext>>,
): Operation<TContext> {
	return { op: 'all', links };
}

/**
 * Parallel `or`. All links are seeked in parallel and the operation will succeed
 * when the first linked goal succeeds.
 */
function any<TContext = any>(
	links: Array<Link<TContext>>,
): Operation<TContext> {
	return { op: 'any', links };
}

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
	all,
	any,
	and,
	or,
};

export default Goal;
