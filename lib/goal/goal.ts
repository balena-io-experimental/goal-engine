import { AssertionError } from 'assert';

import { State } from './state';
import { Test } from './test';
import { Action } from './action';
import { keys, values } from './utils';

/**
 * An assertion describes a repeatable test on a piece of a system state.
 *
 * Examples:
 * - Is process with pid X running?
 * - Is configuration X set to true?
 * - Does dependency X exist?
 * - Does the system have connectivity to URL X?
 */
export interface Assertion<TContext = any, TState = any> {
	/**
	 * Provides the mechanism to read a specific piece of state
	 */
	readonly state: State<TContext, TState>;

	/**
	 * The test acts on the state in order to check for the desired condition
	 */
	readonly test: Test<TContext, TState>;
}

/**
 * Type guard to check if a given object is an assertion
 */
export const isAssertion = (x: unknown): x is Assertion =>
	x != null &&
	State.is((x as Assertion).state) &&
	Test.is((x as Assertion).test);

/**
 * A seekable describes a mechanism to change a system's state that does not
 * meet an expected condition. Given a set of preconditions is met, running the actions
 * should modify the system state to meet the condition.
 *
 * Examples:
 * - Is process with pid X running? If not, run the binary Y
 * - Is configuration X set to true? If not, modify the file to enable
 * - Does dependency X exist? If not, install the dependency
 * - Does the system have connectivity to URL X? If not, change the default network interface
 */
export interface Seekable<TContext = any, TState = any>
	extends Assertion<TContext, TState> {
	/**
	 * If the goal has not been met, the action should let us reach the
	 * goal given that all pre-conditions (or before-goals) are met
	 */
	readonly action: Action<TContext, TState>;

	/**
	 * Conditions that need to be met before running the action.
	 */
	readonly before?: Link<TContext>;

	/**
	 * Conditions that need to be met after running the action.
	 */
	readonly after?: Link<TContext>;
}

/**
 * Type guard to check if a given object is a seekable
 */
export const isSeekable = (x: unknown): x is Seekable =>
	isAssertion(x) && Action.is((x as Seekable).action);

/**
 * The list of allowed operations
 */
const Operations = ['and', 'or', 'any', 'all'] as const;
type Operator = typeof Operations[number];

/**
 * An operation controls the runtime evaluation of goals and allows
 * for more complex execution paths.
 *
 * For instance a precondition on downloading a file may be that
 * the device has connectivity AND there is enough disk space. If the first condition
 * fails, there is no point in checking the second condition.
 *
 * Alternatively, it may be desirable to check that ALL preconditons are met
 * and evaluated in parallel.
 */
export interface Operation<TContext = any> {
	readonly op: Operator;
	readonly links: Array<Link<TContext>>;
}

/**
 * Type guard to check if an object is an operation
 */
export const isOperation = (x: unknown): x is Operation =>
	x != null &&
	Operations.includes((x as Operation).op) &&
	// TODO: validate the array elements
	Array.isArray((x as Operation).links);

/**
 * A combination is an operation that can also be queried for state and tested, however
 * during evaluation it is evaluated as any other operation.
 *
 * Examples of operations are the results of fromDict and fromTuple
 */
export type Combination<TContext = any, TState = any> = Assertion<
	TContext,
	TState
> &
	Operation<TContext>;

export const isCombination = (x: unknown): x is Combination =>
	isAssertion(x) && isOperation(x);

/**
 * A link describes a connection between two or more goals or a goal and a precondition
 */
type Link<TContext = any, TState = any> =
	| Assertion<TContext, TState>
	| Seekable<TContext, TState>
	| Operation<TContext>
	| Combination<TContext, TState>;

// Utility type to make some properties of a type optional
type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * A goal extends the Seekable interface with utility methods,
 * it is the recommended way to interact with the library.
 */
export interface Goal<TContext = any, TState = any>
	extends Assertion<TContext, TState> {
	/**
	 * Transform the current goal a context A into a goal/link that receives
	 * a context B by applying a transformation function
	 *
	 * This is useful to make sure contexts are compatible when linking goals together.
	 *
	 * Example:
	 * ```
	 * const LessThan256Chars = Goal.of({state: (x: number) => Promise.resolve(x <= 255)});
	 * const StringIsLessThan256Chars = Goal.map(LessThan256Chars, (x: string) => x.length);
	 * await StringIsLessThan256Chars.seek('a'.repeat(256)) // should be false
	 * ```
	 *
	 * @param f - transformation function
	 */
	map<TInputContext>(
		f: (c: TInputContext) => TContext,
	): Goal<TInputContext, TState>;

	/**
	 * Tries to reach the current goal given an context.
	 *
	 * This function will follow the dependency graph goal to perform the necessary
	 * actions from preconditions in order to reach the goal. If any of the operations fail
	 * the function will throw.
	 *
	 * @param context - context to provide to the goal
	 * @returns true if the goal has been met
	 */
	seek(c: TContext): Promise<boolean>;
}

/**
 * Create a single goal from a seekable input
 *
 * It receives an object with at least a `state` property and it p
 *
 * @template TContext = any - the context type for the goal
 * @template TState = any - the state type for the goal
 * @param input - seekable input
 * @returns goal object created from the given seekable input
 */
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

/**
 * Utility type to infer the combined state type of a tuple of seekable objects
 */
type StatesFromAssertionTuple<
	T extends Array<Assertion<TContext>>,
	TContext = any,
> = T extends [Assertion<TContext, infer TState>, ...infer TTail]
	? TTail extends Array<Assertion<TContext>>
		? [TState, ...StatesFromAssertionTuple<TTail, TContext>]
		: [TState]
	: [];

/**
 * Combine an array of state objects into a state that returns a tuple of
 * results
 *
 * @template TContext = any - the common context for all goals in the tuple
 * @template TTuple extends Array<Seekable<TContext>> = Array<Seekable<TContext>> - the type of the goal list
 * @param goals - an array of seekable objects
 * @returns a combined goal that acts on a tuple of the individual states
 */
const fromTuple = <
	TContext = any,
	TTuple extends Array<Assertion<TContext>> = Array<Assertion<TContext>>,
>(
	goals: TTuple,
): Goal<TContext, StatesFromAssertionTuple<TTuple, TContext>> &
	Operation<TContext> => {
	return {
		op: 'all',
		links: goals,
		...fromSeekable({
			state: State.of(goals.map((g) => g.state)) as State<
				TContext,
				StatesFromAssertionTuple<TTuple, TContext>
			>,
			test: Test.all(goals.map((g) => g.test)),
		}),
	};
};

/**
 * Utility type to infer the context from a dictionary.
 * This will only make sense if all the seekable elements in the
 * dictionary have the same context.
 * Other it will return invalid types like `number & string`
 */
type ContextFromAssertionDict<
	T extends { [K in keyof TState]: Assertion<any, TState[K]> },
	TState = any,
> = T extends {
	[K in keyof TState]: Assertion<infer TContext, TState[K]>;
}
	? TContext
	: never;

/**
 * Combine a dictionary of seekable objects into a goal that operates on a dictionary of results as state*
 *
 * IMPORTANT: All state objects must have the same context type
 *
 * TODO: we have not found a way to reliably validate the inputs to prevent creating
 * combinators from incompatible context, however such combinators are unusable as the type
 * signature won't match anything.
 *
 * @template TContext  - common context for all seekable objects in the dictionary
 * @template TState  - the target state of the resulting goal
 * @template TStateDict - the format for the input goal dictionary
 * @param goals - dictionary of seekable objects
 * @returns a combined goal operates on the combined dictionary of states
 */
const fromDict = <
	TContext extends ContextFromAssertionDict<TStateDict, TState> = any,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Assertion<any, TState[K]>;
	} = {
		[K in keyof TState]: Assertion<any, TState[K]>;
	},
>(
	goals: TStateDict,
): Goal<TContext, TState> & Operation<TContext> => {
	return {
		op: 'all',
		links: values(goals),
		...fromSeekable({
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
		}),
	};
};

/**
 * Create a single goal from a seekable input
 *
 * It receives an object with at least a `state` property and it p
 *
 * @template TContext = any - the context type for the goal
 * @template TState = any - the state type for the goal
 * @param input - seekable input
 * @returns goal object created from the given seekable input
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
/**
 * Combine an array of state objects into a state that returns a tuple of
 * results
 *
 * @template TContext = any - the common context for all goals in the tuple
 * @template TState = any - the first state of the tuple
 * @template TTuple extends Array<Seekable<TContext>> = Array<Seekable<TContext>> - the type of the goal list
 * @param goals - a non empty array of seekable objects
 * @returns a combined goal that acts on a tuple of the individual states
 */
export function of<
	TContext = any,
	TState = any,
	TTuple extends Array<Assertion<TContext>> = Array<Assertion<TContext>>,
>(
	goals: [Assertion<TContext, TState>, ...TTuple],
): Goal<TContext, [TState, ...StatesFromAssertionTuple<TTuple, TContext>]>;
/**
 * Combine a dictionary of seekable objects into a goal that operates on a dictionary of results as state*
 *
 * IMPORTANT: All state objects must have the same context type
 *
 * TODO: we have not found a way to reliably validate the inputs to prevent creating
 * combinators from incompatible context, however such combinators are unusable as the type
 * signature won't match anything.
 *
 * @template TContext  - common context for all seekable objects in the dictionary
 * @template TState  - the target state of the resulting goal
 * @template TStateDict - the format for the input goal dictionary
 * @param goals - dictionary of seekable objects
 * @returns a combined goal operates on the combined dictionary of states
 */
export function of<
	TContext extends ContextFromAssertionDict<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Assertion<any, TState[K]>;
	} = { [K in keyof TState]: Assertion<any, TState[K]> },
>(
	goals: {
		[K in keyof TState]: Assertion<TContext, TState[K]>;
	} & TStateDict,
): Goal<TContext, { [K in keyof TState]: TState[K] }>;

// Method implementation
export function of<TContext = any, TState = any>(
	input:
		| WithOptional<
				Seekable<TContext, TState>,
				'test' | 'action' | 'before' | 'after'
		  >
		| [Assertion<TContext>, ...Array<Assertion<TContext>>]
		| { [K in keyof TState]: Assertion<TContext, TState[K]> },
) {
	if (Array.isArray(input)) {
		return fromTuple(input);
	} else if ('state' in input && State.is(input.state)) {
		return fromSeekable(input);
	} else {
		return fromDict(
			input as { [K in keyof TState]: Assertion<any, TState[K]> },
		);
	}
}

/**
 * Transform a goal/link that receives a context A into a goal/link that receives
 * a context B by applying a transformation function
 *
 * This is useful to make sure contexts are compatible when linking goals together.
 *
 * Example:
 * ```
 * const LessThan256Chars = Goal.of({state: (x: number) => Promise.resolve(x <= 255)});
 * const StringIsLessThan256Chars = Goal.map(LessThan256Chars, (x: string) => x.length);
 * await StringIsLessThan256Chars.seek('a'.repeat(256)) // should be false
 * ```
 *
 * @param g - input goal
 * @param f - transformation function
 */
export function map<TContext = any, TState = any, TInputContext = any>(
	g: Assertion<TContext, TState>,
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
	// Combinatios and operations fall here
	if (isOperation(g)) {
		return {
			...g,
			...(isAssertion(g) && {
				state: State.map(g.state, f),
				test: Test.map(g.test, f),
			}),
			links: g.links.map((l) => map(l, f)),
		};
	}

	if (isAssertion(g)) {
		return of({
			state: State.map(g.state, f),
			test: Test.map(g.test, f),

			...(isSeekable(g) && {
				action: Action.map(g.action, f),

				// Only add the before and after goals if they exist
				...(g.before && { before: map(g.before, f) }),
				...(g.after && { after: map(g.after, f) }),
			}),
		});
	}

	// Should never be callsed
	throw new AssertionError({
		message: 'Expected first parameter to be a goal or an operation',
		actual: g,
	});
}

/**
 * Tries to reach a goal given an context.
 *
 * This function will follow the dependency graph to perform the necessary
 * actions from preconditions in order to reach the goal. If any of the operations fail
 * the function will throw.
 *
 * @param goal - the goal to seek
 * @param context - context to provide to the goal
 * @returns true if the goal has been met
 */
export async function seek<TContext = any, TState = any>(
	goal: Link<TContext, TState>,
	ctx: TContext,
): Promise<boolean> {
	// Evaluate operations and combinations first
	if (isOperation(goal)) {
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

	if (isAssertion(goal)) {
		const s = await goal.state(ctx);
		if (goal.test(ctx, s)) {
			// The goal has been met
			return true;
		}

		if (isSeekable(goal)) {
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
	}

	// If we get here, then the test failed
	return false;
}

/**
 * A goal that is always met
 */
export const Always = of({ state: () => Promise.resolve(true) });

/**
 * A goal that can never be met
 */
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

/**
 * Combinator to extend a goal with an action.
 *
 * Be careful if applying this to a combined goal (from a dictionary or a tuple)
 * since it will effectively change the way the goal is evaluated.
 */
export const action = <TContext = any, TState = any>(
	goal: Assertion<TContext, TState>,
	_action: Action<TContext, TState>,
): Goal<TContext, TState> => {
	return of({ ...goal, action: _action });
};

/**
 * Combinator to extend a goal with a precondition.
 *
 * Be careful if applying this to a combined goal (from a dictionary or a tuple)
 * since it will effectively change the way the goal is evaluated.
 */
export const before = <TContext = any, TState = any>(
	goal: Assertion<TContext, TState>,
	_before: Link<TContext>,
): Goal<TContext, TState> => {
	return of({ ...goal, before: _before });
};

/**
 * Combinator to extend a goal with a postcondition.
 *
 * Be careful if applying this to a combined goal (from a dictionary or a tuple)
 * since it will effectively change the way the goal is evaluated.
 */
export const after = <TContext = any, TState = any>(
	goal: Assertion<TContext, TState>,
	_after: Link<TContext>,
): Goal<TContext, TState> => {
	return of({ ...goal, after: _after });
};

/**
 * The exported Goal object is the recommended way to interact with goals
 */
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
