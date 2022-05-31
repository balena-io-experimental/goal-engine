import { Action } from './action';
import { Actionable } from './actionable';
import { Described, Description } from './described';
import { seek as seekNode } from './engine';
import { Node } from './node';
import { Operation, fromDict as opFromDict } from './operation';
import { State } from './state';
import { Testable } from './testable';
import { keys } from './utils';

/**
 * A goal is an utility interface to create and combine simple goals into more complex ones
 */
export interface Goal<TContext = any, TState = any> {
	/**
	 * Node referenced by this goal
	 */
	readonly node: Node<TContext, TState>;

	/**
	 * Return the state of the referenced node. For operations
	 * the state of the operation is the state of the individual
	 * nodes.
	 */
	state(c: TContext): Promise<TState>;

	/**
	 * Return true if the goal has been met. If the reference node points to an
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
	 *
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
	 * @param before - requirement for the new goal
	 */
	requires(r: Goal<TContext>): Goal<TContext, TState>;

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
	return of({
		...(Described.is(g.node) && Described.map(g.node, f)),
		...Node.map(g.node, f),
	});
}

/**
 * Combinator to extend a goal with an action.
 *
 * Be careful if applying this to a combined goal (from a dictionary or a tuple)
 * since it will effectively change the way the goal is evaluated.
 */
export const action = <TContext = any, TState = any>(
	goal: Goal<TContext, TState>,
	_action: Action<TContext, TState>,
): Goal<TContext, TState> => {
	if (Operation.is(goal.node)) {
		// Modifying the action on an operation turns it into a regular goal
		const { op, nodes, ...node } = goal.node;
		return of({ ...node, action: _action });
	}
	return of({ ...goal.node, action: _action });
};

/**
 * Combinator to extend a goal with a precondition.
 *
 * Be careful if applying this to a combined goal (from a dictionary or a tuple)
 * since it will effectively change the way the goal is evaluated.
 */
export const requires = <TContext = any, TState = any>(
	goal: Goal<TContext, TState>,
	_requires: Goal<TContext>,
): Goal<TContext, TState> => {
	if (Operation.is(goal.node)) {
		// Adding a requirement on an operation turns it into an actionable
		const { op, nodes, ...node } = goal.node;
		return of({
			action: () => Promise.resolve(void 0),
			...node,
			requires: _requires.node,
		});
	}

	return of({
		// Set a default action in case the node does not have one
		action: () => Promise.resolve(void 0),
		...goal.node,
		requires: _requires.node,
	});
};

/**
 * Combinator to add a description to a goal
 */
export const describe = <TContext = any, TState = any>(
	g: Goal<TContext, TState>,
	d: Description<TContext>,
): Goal<TContext, TState> => {
	return fromNode(Described.of(g.node, d));
};

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
}: WithOptional<Node<TContext, TState>, 'test'>): Goal<TContext, TState> {
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
			// QUESTION: the call to state() can throw. Should we catch it?
			// Or should we let it slip?
			const s = await node.state(c);
			return node.test(c, s);
		},
		map<TInputContext>(
			f: (c: TInputContext) => TContext,
		): Goal<TInputContext, TState> {
			return map(goal, f);
		},
		action(a: Action<TContext, TState>) {
			return action(goal, a);
		},
		requires(r: Goal<TContext>) {
			return requires(goal, r);
		},
		seek(c: TContext) {
			return seek(goal, c);
		},
	};

	return goal;
}

/**
 * Utility type to infer the combined state type of a tuple of goal objects
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
 * Combine an array of goal objects into goal that returns a tuple of
 * results
 *
 * @template TContext = any - the common context for all goals in the tuple
 * @template TTuple extends Array<Goal<TContext>> = Array<Goal<TContext>> - the type of the goal list
 * @param goals - an array of goal objects
 * @returns a combined goal that acts on a tuple of the individual states
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
 * Utility type to infer the context from a dictionary.
 * This will only make sense if all the goal elements in the
 * dictionary have the same context.
 * Other it will return invalid types like `number & string`
 */
type ContextFromGoalDict<
	T extends { [K in keyof TState]: Goal<any, TState[K]> },
	TState = any,
> = T extends {
	[K in keyof TState]: Goal<infer TContext, TState[K]>;
}
	? TContext
	: never;

/**
 * Combine a dictionary of goal objects into a goal that operates on a dictionary of results as state*
 *
 * IMPORTANT: All state objects must have the same context type
 *
 * TODO: we have not found a way to reliably validate the inputs to prevent creating
 * combinators from incompatible context, however such combinators are unusable as the type
 * signature won't match anything.
 *
 * @template TContext  - common context for all goal objects in the dictionary
 * @template TState  - the target state of the resulting goal
 * @template TStateDict - the format for the input goal dictionary
 * @param goals - dictionary of goal objects
 * @returns a combined goal operates on the combined dictionary of states
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
	input: WithOptional<Actionable<TContext, TState>, 'action' | 'requires'>,
): Goal<TContext, TState>;
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
	TTuple extends Array<Goal<TContext>> = Array<Goal<TContext>>,
>(
	goals: [Goal<TContext, TState>, ...TTuple],
): Goal<TContext, [TState, ...StatesFromGoalTuple<TTuple, TContext>]>;
/**
 * Combine a dictionary of goal objects into a goal that operates on a dictionary of results as state*
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
	TContext extends ContextFromGoalDict<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Goal<any, TState[K]>;
	} = { [K in keyof TState]: Goal<any, TState[K]> },
>(
	goals: {
		[K in keyof TState]: Goal<TContext, TState[K]>;
	} & TStateDict,
): Goal<TContext, { [K in keyof TState]: TState[K] }>;
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
	TContext = any,
	TState = any,
	TTuple extends Array<Goal<TContext>> = Array<Goal<TContext>>,
>(
	goals: [Goal<TContext, TState>, ...TTuple],
): Goal<TContext, [TState, ...StatesFromGoalTuple<TTuple, TContext>]>;
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
): Goal<TContext, { [K in keyof TState]: TState[K] }>;
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
	TContext = any,
	TState = any,
	TTuple extends Array<Goal<TContext>> = Array<Goal<TContext>>,
>(
	goals: [Goal<TContext, TState>, ...TTuple],
): Goal<TContext, [TState, ...StatesFromGoalTuple<TTuple, TContext>]>;
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
): Goal<TContext, { [K in keyof TState]: TState[K] }>;
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
	TContext = any,
	TState = any,
	TTuple extends Array<Goal<TContext>> = Array<Goal<TContext>>,
>(
	goals: [Goal<TContext, TState>, ...TTuple],
): Goal<TContext, [TState, ...StatesFromGoalTuple<TTuple, TContext>]>;
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
): Goal<TContext, { [K in keyof TState]: TState[K] }>;
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
	TContext = any,
	TState = any,
	TTuple extends Array<Goal<TContext>> = Array<Goal<TContext>>,
>(
	goals: [Goal<TContext, TState>, ...TTuple],
): Goal<TContext, [TState, ...StatesFromGoalTuple<TTuple, TContext>]>;
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
): Goal<TContext, { [K in keyof TState]: TState[K] }>;
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

export function seek<TContext = any, TState = any>(
	g: Goal<TContext, TState>,
	c: TContext,
) {
	return seekNode(g.node, c);
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
	describe,
	all,
	any,
	and,
	or,
};

export default Goal;
