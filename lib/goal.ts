import { Action } from './action';
import { Actionable } from './actionable';
import { Described, Description } from './described';
import { seek as seekNode } from './engine';
import { Node } from './node';
import { Operation, fromDict as opFromDict } from './operation';
import { State, StateNotFound } from './state';
import { Testable } from './testable';
import { keys, IntersectTuple } from './utils';

/**
 * A goal is an utility interface to create and combine simple goals into more complex ones
 */
export interface Goal<TContext = any, TState = any> {
	/**
	 * Node referenced by this goal
	 */
	get node(): Node<TContext, TState>;

	/**
	 * Utility function to return the state of the referenced node. For operations
	 * the state of the operation is the state of the individual
	 * nodes.
	 */
	state(c: TContext): Promise<TState>;

	/**
	 * Utility function to determine if the goal has been met.
	 *
	 * It works by querying the goal state and calling the test function on the given node.
	 * If the referenced node points to an
	 * operation, the result of the test is the result of the operation over the operands.
	 */
	test(c: TContext): Promise<boolean>;

	/**
	 * Create a new goal from the current goal into a goal that receives
	 * a context InputContext by applying a transformation function
	 *
	 * This is useful to make sure contexts are compatible when linking goals together.
	 *
	 * Example:
	 * ```
	 * const LessThan256Chars = Goal.of({state: (x: number) => Promise.resolve(x <= 255)});
	 * const StringIsLessThan256Chars = Goal.map(LessThan256Chars, (x: string) => x.length);
	 * await StringIsLessThan256Chars.seek('a'.repeat(256)) // should be false
	 * ```
	 * @param f - transformation function
	 */
	map<TInputContext>(
		f: (c: TInputContext) => TContext,
	): Goal<TInputContext, TState>;

	/**
	 * Combinator to extend a goal with an action. Does not modify the current goal.
	 *
	 * Be careful if applying this to a goal referencing an operation
	 * since it will effectively change the way the goal is evaluated.
	 */
	action(a: Action<TContext, TState>): Goal<TContext, TState>;

	/**
	 * Create a new goal that requires the given goal before being met. Does not modify the current goal.
	 *
	 * @param r - requirement for the new goal
	 */
	requires(r: Goal<TContext>): Goal<TContext, TState>;

	/**
	 * Tries to reach the current goal given an context.
	 *
	 * This function will follow the dependency graph goal to perform the necessary
	 * actions from preconditions in order to reach the goal. If any of the operations fail
	 * the function will throw.
	 *
	 * @param c - context to provide to the goal
	 * @returns true if the goal has been met
	 */
	seek(c: TContext): Promise<boolean>;

	/**
	 * Creates a new goal with the description added to the node
	 *
	 * @param d - description function for the goal
	 */
	description<TC extends TContext>(
		// NOTE: using just TContext instead of  `extends TContext` messes up with the
		// type inference in ContextFromGoalDict. I have not figured out why, but this solves it
		d: Description<TC>,
	): Goal<TContext, TState>;
}

// Utility type to make some properties of a type optional
type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Create a new goal from an input goal that receives a context TContext into a goal that receives
 * a context TInputContext by applying a transformation function
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
	g: Goal<TContext, TState>,
	f: (c: TInputContext) => TContext,
): Goal<TInputContext, TState> {
	return g.map(f);
}

/**
 * Combinator to extend a goal with an action.
 *
 * Be careful if applying this to a combined goal (from a dictionary or a tuple)
 * since it will effectively change the way the goal is evaluated.
 */
export const action = <TContext = any, TState = any>(
	g: Goal<TContext, TState>,
	a: Action<TContext, TState>,
): Goal<TContext, TState> => {
	return g.action(a);
};

/**
 * Combinator to extend a goal with a precondition.
 *
 * Be careful if applying this to a combined goal (from a dictionary or a tuple)
 * since it will effectively change the way the goal is evaluated.
 */
export const requires = <TContext = any, TState = any>(
	g: Goal<TContext, TState>,
	r: Goal<TContext>,
): Goal<TContext, TState> => {
	return g.requires(r);
};

/**
 * Combinator to add a description to a goal
 */
export const description = <TContext = any, TState = any>(
	g: Goal<TContext, TState>,
	d: Description<TContext>,
): Goal<TContext, TState> => {
	return g.description(d);
};

/**
 * Try to reach the goal from the given context
 */
export function seek<TContext = any, TState = any>(
	g: Goal<TContext, TState>,
	c: TContext,
) {
	return g.seek(c);
}

/**
 * Create a single goal from a testable input
 *
 * It receives an object with at least a `state` property and it p
 *
 * @template TContext = any - the context type for the goal
 * @template TState = any - the state type for the goal
 * @param input - actionable input
 * @returns goal object created from the given actionable input
 */
function fromNode<TContext = any, TState = any>({
	state,
	test: _test = (_: TContext, s: TState) => !!s,
	...extra
}: WithOptional<
	Node<TContext, TState> & Described<TContext>,
	'test' | 'description'
>): Goal<TContext, TState> {
	const node = {
		state,
		test: _test,
		// If extra has a `requires` property, ensure that a default action exists
		...((extra as any).requires && {
			action: () => Promise.resolve(void 0),
		}),

		// The action will be overriden by this step if it exists in extra
		...extra,
	};

	const goal: Goal<TContext, TState> = {
		node,
		state(c: TContext): Promise<TState> {
			return node.state(c);
		},
		async test(c: TContext): Promise<boolean> {
			try {
				const s = await node.state(c);
				return node.test(c, s);
			} catch (e) {
				if (e instanceof StateNotFound) {
					return false;
				}
				throw e;
			}
		},
		map<TInputContext>(
			f: (c: TInputContext) => TContext,
		): Goal<TInputContext, TState> {
			return fromNode({
				...(Described.is(node) && Described.map(node, f)),
				...Node.map(node, f),
			});
		},
		action(a: Action<TContext, TState>) {
			if (Operation.is(node)) {
				// Modifying the action on an operation turns it into a regular goal
				const { op, nodes, ...nodeOnly } = node;
				return fromNode({ ...nodeOnly, action: a } as Actionable<
					TContext,
					TState
				>);
			}
			return fromNode({ ...node, action: a });
		},
		requires(r: Goal<TContext>) {
			if (Operation.is(node)) {
				// Adding a requirement on an operation turns it into an actionable
				const { op, nodes, ...nodeOnly } = node;
				return fromNode({
					action: () => Promise.resolve(void 0),
					...nodeOnly,
					requires: r.node,
				} as Actionable<TContext, TState>);
			}

			return fromNode({
				// Set a default action in case the node does not have one
				action: () => Promise.resolve(void 0),
				...node,
				requires: r.node,
			});
		},
		seek(c: TContext) {
			return seekNode(node, c);
		},
		description(d: Description) {
			return fromNode(Described.of(node, d));
		},
	};

	return goal;
}

/**
 * Utility type to calculate the combination of an array
 * of Goal objects into a Goal that returns a tuple of the individual
 * state elements.
 *
 * It is used by the functions `of`, `and`, `all`, `or` and `any` to calculate the combined type of the output .
 */

type StatesFromGoalTuple<
	T extends Array<Goal<TContext>>,
	TContext = any,
> = T extends [Goal<TContext, infer TState>, ...infer TTail]
	? TTail extends Array<Goal<TContext>>
		? [TState, ...StatesFromGoalTuple<TTail, TContext>]
		: [TState]
	: [];

/**
 * Utility type to calculate the combination of an array
 * of Goal objects into a State that returns a tuple of the individual
 * state elements.
 *
 * It is used by the function `of()` to calculate the combined type of the output .
 */
type ContextFromGoalTuple<T extends Goal[] = []> = T extends [
	Goal<infer TContext>,
	...infer TTail,
]
	? TTail extends Goal[]
		? [TContext, ...ContextFromGoalTuple<TTail>]
		: [TContext]
	: [];

/**
 * Combine an array of goal objects into goal that returns a tuple of
 * results
 *
 * @template TContext = any - the common context for all goals in the tuple
 * @template TTuple extends Array<Goal<TContext>> = Array<Goal<TContext>> - the type of the goal list
 * @param goals - an array of goal objects
 * @returns a combined goal that acts on a tuple of the individual goals
 */
const fromTuple = <
	TContext = any,
	TTuple extends Array<Goal<TContext>> = Array<Goal<TContext>>,
>(
	goals: TTuple,
): Goal<TContext, StatesFromGoalTuple<TTuple, TContext>> => {
	return fromNode(
		Operation.all(goals.map((g) => g.node)) as Operation<TContext>,
	);
};

/**
 * Utility type to infer the unified context from a dictionary of Goal objects. This is used to
 * infer the combined context for the `of`, `and`, `all`, `or`, `any` functions and is not meant to be exported.
 *
 * Because of the way type inference works in conditional types works (see the link below), the
 * resulting type will be the intersection of the individual context types for each element in the dictionary.
 *
 * https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-8.html#type-inference-in-conditional-types
 */
type ContextFromGoalDict<
	T extends { [K in keyof TState]: Goal<any, TState[K]> },
	TState = any,
> = T[keyof TState] extends Goal<infer TContext> ? TContext : never;

/**
 * Combine a dictionary of goal objects into a goal that operates on a dictionary of results as state*
 *
 * @template TContext  - common context for all goal objects in the dictionary
 * @template TState  - the target state of the resulting goal
 * @template TStateDict - the format for the input goal dictionary
 * @param goals - dictionary of goal objects
 * @returns a combined goal that operates on the dictionary of goals
 */
const fromDict = <TContext = any, TState = any>(goals: {
	[K in keyof TState]: Goal<TContext, TState[K]>;
}): Goal<TContext, TState> => {
	return fromNode(
		opFromDict(
			'all',
			keys(goals).reduce(
				(nodes, k) => ({ ...nodes, [k]: goals[k].node }),
				{} as { [K in keyof TState]: Node<TContext, TState[K]> },
			),
		),
	);
};

/**
 * Create a single goal from an actionable input
 *
 * It receives an object with at least a `state` property and it p
 *
 * @template TContext = any - the context type for the goal
 * @template TState = any - the state type for the goal
 * @param input - actionable input
 * @returns goal object created from the given actionable input
 */
export function of<TContext = any>({
	state,
}: WithOptional<Testable<TContext, boolean>, 'test'>): Goal<TContext, boolean>;
export function of<TContext = any, TState = any>(
	input: WithOptional<
		Actionable<TContext, TState> & Described<TContext>,
		'action' | 'requires' | 'description'
	>,
): Goal<TContext, TState>;
/**
 * Combine an array of state objects into a state that returns a tuple of
 * results
 *
 * NOTE: All Goal objects of the tuple need to have the same context type otherwise the
 * compiler will infer the resulting context as `never`
 *
 * @template TContext = any - the common context for all goals in the tuple
 * @template TState = any - the first state of the tuple
 * @template TTuple extends Array<Seekable<TContext>> = Array<Seekable<TContext>> - the type of the goal list
 * @param goals - a non empty array of seekable objects
 * @returns a combined goal that acts on a tuple of the individual states
 */
export function of<
	TContext extends IntersectTuple<ContextFromGoalTuple<TTuple>>,
	TState = any,
	TTuple extends Goal[] = Goal[],
	TTail extends Goal[] = Goal[],
>(
	goals: [Goal<TContext, TState>, ...TTail] & TTuple,
): Goal<TContext, [TState, ...StatesFromGoalTuple<TTail, TContext>]>;
/**
 * Combine a dictionary of goal objects into a goal that operates on a dictionary of results as state*
 *
 * @template TContext  - common context for all seekable objects in the dictionary
 * @template TState  - the target state of the resulting goal
 * @template TStateDict - the format for the input goal dictionary
 * @param goals - dictionary of seekable objects
 * @returns a combined goal operates on the combined dictionary of states
 */
export function of<
	TContext extends ContextFromGoalDict<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Goal<any, TState[K]>;
	} = { [K in keyof TState]: Goal<any, TState[K]> },
>(
	goals: { [K in keyof TState]: Goal<TContext, TState[K]> } & TStateDict,
): Goal<TContext, TState>;
// Method implementation
export function of<TContext = any, TState = any>(
	input:
		| WithOptional<Node<TContext, TState>, 'test'>
		| [Goal<TContext>, ...Array<Goal<TContext>>]
		| { [K in keyof TState]: Goal<TContext, TState[K]> },
) {
	if (Array.isArray(input)) {
		return fromTuple(input);
	} else if ('state' in input && State.is(input.state)) {
		return fromNode(input);
	} else {
		return fromDict(
			input as { [K in keyof TState]: Goal<TContext, TState[K]> },
		);
	}
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
 * Create an `and` operation between the goals. An 'and' operation is run sequentially and
 * will fail when the first goal fails.
 */
export function and<
	TContext extends IntersectTuple<ContextFromGoalTuple<TTuple>>,
	TState = any,
	TTuple extends Goal[] = Goal[],
	TTail extends Goal[] = Goal[],
>(
	goals: [Goal<TContext, TState>, ...TTail] & TTuple,
): Goal<TContext, [TState, ...StatesFromGoalTuple<TTail, TContext>]>;
export function and<
	TContext extends ContextFromGoalDict<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Goal<any, TState[K]>;
	} = { [K in keyof TState]: Goal<any, TState[K]> },
>(
	goals: {
		[K in keyof TState]: Goal<TContext, TState[K]>;
	} & TStateDict,
): Goal<TContext, TState>;
export function and<TContext = any, TState = any>(
	goals:
		| [Goal<TContext>, ...Array<Goal<TContext>>]
		| { [K in keyof TState]: Goal<TContext, TState[K]> },
) {
	if (Array.isArray(goals)) {
		return fromNode(
			Operation.and(goals.map((g) => g.node)) as Operation<TContext>,
		);
	} else {
		return fromNode(
			opFromDict(
				'and',
				keys(goals).reduce(
					(nodes, k) => ({ ...nodes, [k]: goals[k].node }),
					{} as { [K in keyof TState]: Node<TContext, TState[K]> },
				),
			),
		);
	}
}

/**
 * Create an `or` operation between the links. An 'or' operation is run sequentially and
 * will succeed when the first link succeeds.
 */
export function or<
	TContext extends IntersectTuple<ContextFromGoalTuple<TTuple>>,
	TState = any,
	TTuple extends Goal[] = Goal[],
	TTail extends Goal[] = Goal[],
>(
	goals: [Goal<TContext, TState>, ...TTail] & TTuple,
): Goal<TContext, [TState, ...StatesFromGoalTuple<TTail, TContext>]>;
export function or<
	TContext extends ContextFromGoalDict<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Goal<any, TState[K]>;
	} = { [K in keyof TState]: Goal<any, TState[K]> },
>(
	goals: {
		[K in keyof TState]: Goal<TContext, TState[K]>;
	} & TStateDict,
): Goal<TContext, TState>;
export function or<TContext = any, TState = any>(
	goals:
		| [Goal<TContext>, ...Array<Goal<TContext>>]
		| { [K in keyof TState]: Goal<TContext, TState[K]> },
) {
	if (Array.isArray(goals)) {
		return fromNode(
			Operation.or(goals.map((g) => g.node)) as Operation<TContext>,
		);
	} else {
		return fromNode(
			opFromDict(
				'or',
				keys(goals).reduce(
					(nodes, k) => ({ ...nodes, [k]: goals[k].node }),
					{} as { [K in keyof TState]: Node<TContext, TState[K]> },
				),
			),
		);
	}
}

/**
 * Parallel `and`. All links are seeked in parallel and the operation will only succeed
 * if all the linked goals succeed.
 */
export function all<
	TContext extends IntersectTuple<ContextFromGoalTuple<TTuple>>,
	TState = any,
	TTuple extends Goal[] = Goal[],
	TTail extends Goal[] = Goal[],
>(
	goals: [Goal<TContext, TState>, ...TTail] & TTuple,
): Goal<TContext, [TState, ...StatesFromGoalTuple<TTail, TContext>]>;
export function all<
	TContext extends ContextFromGoalDict<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Goal<any, TState[K]>;
	} = { [K in keyof TState]: Goal<any, TState[K]> },
>(
	goals: {
		[K in keyof TState]: Goal<TContext, TState[K]>;
	} & TStateDict,
): Goal<TContext, TState>;
export function all<TContext = any, TState = any>(
	goals:
		| [Goal<TContext>, ...Array<Goal<TContext>>]
		| { [K in keyof TState]: Goal<TContext, TState[K]> },
) {
	if (Array.isArray(goals)) {
		return fromNode(
			Operation.all(goals.map((g) => g.node)) as Operation<TContext>,
		);
	} else {
		return fromNode(
			opFromDict(
				'all',
				keys(goals).reduce(
					(nodes, k) => ({ ...nodes, [k]: goals[k].node }),
					{} as { [K in keyof TState]: Node<TContext, TState[K]> },
				),
			),
		);
	}
}

/**
 * Parallel `or`. All links are seeked in parallel and the operation will succeed
 * when the first linked goal succeeds.
 */
export function any<
	TContext extends IntersectTuple<ContextFromGoalTuple<TTuple>>,
	TState = any,
	TTuple extends Goal[] = Goal[],
	TTail extends Goal[] = Goal[],
>(
	goals: [Goal<TContext, TState>, ...TTail] & TTuple,
): Goal<TContext, [TState, ...StatesFromGoalTuple<TTail, TContext>]>;
export function any<
	TContext extends ContextFromGoalDict<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Goal<any, TState[K]>;
	} = { [K in keyof TState]: Goal<any, TState[K]> },
>(
	goals: {
		[K in keyof TState]: Goal<TContext, TState[K]>;
	} & TStateDict,
): Goal<TContext, TState>;
export function any<TContext = any, TState = any>(
	goals:
		| [Goal<TContext>, ...Array<Goal<TContext>>]
		| { [K in keyof TState]: Goal<TContext, TState[K]> },
) {
	if (Array.isArray(goals)) {
		return fromNode(
			Operation.any(goals.map((g) => g.node)) as Operation<TContext>,
		);
	} else {
		return fromNode(
			opFromDict(
				'any',
				keys(goals).reduce(
					(nodes, k) => ({ ...nodes, [k]: goals[k].node }),
					{} as { [K in keyof TState]: Node<TContext, TState[K]> },
				),
			),
		);
	}
}

/**
 * The exported Goal object is the recommended way to interact with goals
 */
export const Goal = {
	of,
	map,
	seek,
	action,
	requires,
	description,
	all,
	any,
	and,
	or,
};

export default Goal;
