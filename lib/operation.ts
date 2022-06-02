// This establishes a circular dependency with the node module, however there is no way
// to really avoid it other than putting all the definitions in the same file
import { Node } from './node';
import { fromDict as stateFromDict, State } from './state';
import {
	allFromDict as allTestsFromDict,
	anyFromDict as anyTestsFromDict,
	Test,
} from './test';
import { Testable } from './testable';
import { keys, values } from './utils';

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
export interface Operation<TContext = any, TState = any>
	extends Testable<TContext, TState> {
	readonly op: Operator;
	readonly nodes: Array<Node<TContext>>;
}

export interface And<TContext = any, TState = any>
	extends Operation<TContext, TState> {
	readonly op: 'and';
}

export interface Or<TContext = any, TState = any>
	extends Operation<TContext, TState> {
	readonly op: 'or';
}

export interface All<TContext = any, TState = any>
	extends Operation<TContext, TState> {
	readonly op: 'all';
}

export interface Any<TContext = any, TState = any>
	extends Operation<TContext, TState> {
	readonly op: 'all';
}

/**
 * Utility type to calculate the combination of an array
 * of Testable objects into a testable that returns a tuple of the individual
 * state elements.
 *
 * It is used by the functions `and`, `or`, `all`, `any` to calculate the combined type of the output .
 */

type StatesFromTestableTuple<
	T extends Array<Testable<TContext>>,
	TContext = any,
> = T extends [Testable<TContext, infer TState>, ...infer TTail]
	? TTail extends Array<Testable<TContext>>
		? [TState, ...StatesFromTestableTuple<TTail, TContext>]
		: [TState]
	: [];

/**
 * Combine an array of node objects into a node with a state that returns a tuple of
 * results
 *
 * @template TContext = any - the common context for all nodes in the tuple
 * @template TTuple extends Array<Testable<TContext>> = Array<Testable<TContext>> - the type of the node list
 * @param nodes - an array of node objects
 * @returns a combined goal that acts on a tuple of the individual states
 */
const fromTuple = <
	TContext = any,
	TTuple extends Array<Testable<TContext>> = Array<Testable<TContext>>,
>(
	op: Operator,
	nodes: TTuple,
): Operation<TContext, StatesFromTestableTuple<TTuple, TContext>> => {
	return {
		op,
		nodes,
		state: State.of(nodes.map((n) => n.state)) as State<
			TContext,
			StatesFromTestableTuple<TTuple, TContext>
		>,
		test: ['all', 'and'].includes(op)
			? (Test.all(nodes.map((n) => n.test)) as Test<TContext>)
			: (Test.any(nodes.map((n) => n.test)) as Test<TContext>),
	};
};

/**
 * Utility type to infer the unified context from a dictionary of Testable objects. This is used to
 * infer the combined context for the `and`, `all`, `or`, `any` functions and is not meant to be exported.
 *
 * Because of the way type inference works in conditional types works (see the link below), the
 * resulting type will be the intersection of the individual context types for each element in the dictionary.
 *
 * https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-8.html#type-inference-in-conditional-types
 */
type ContextFromTestableDict<
	T extends { [K in keyof TState]: Testable<any, TState[K]> },
	TState = any,
> = T[keyof TState] extends Testable<infer TContext> ? TContext : never;

/**
 * Combine a dictionary of node objects into an operation on a dictionary of results as state*
 *
 * @template TContext  - common context for all node objects in the dictionary
 * @template TState  - the target state of the resulting goal
 * @template TStateDict - the format for the input goal dictionary
 * @param nodes - dictionary of node objects
 * @returns a combined testable object that operates on the combined dictionary of states
 */
export const fromDict = <TContext = any, TState = any>(
	op: Operator,
	nodes: {
		[K in keyof TState]: Testable<TContext, TState[K]>;
	},
): Operation<TContext, TState> => {
	return {
		op,
		nodes: values(nodes),
		state: stateFromDict(
			keys(nodes).reduce(
				(states, key) => ({ ...states, [key]: nodes[key].state }),
				{} as { [K in keyof TState]: State<TContext, TState[K]> },
			),
		),
		test: ['all', 'and'].includes(op)
			? allTestsFromDict(
					keys(nodes).reduce(
						(tests, key) => ({ ...tests, [key]: nodes[key].test }),
						{} as { [K in keyof TState]: Test<TContext, TState[K]> },
					),
			  )
			: anyTestsFromDict(
					keys(nodes).reduce(
						(tests, key) => ({ ...tests, [key]: nodes[key].test }),
						{} as { [K in keyof TState]: Test<TContext, TState[K]> },
					),
			  ),
	};
};

/**
 * Create an `and` operation from a dict of testable objects
 */
export function and<
	TContext extends ContextFromTestableDict<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Testable<any, TState[K]>;
	} = {
		[K in keyof TState]: Testable<any, TState[K]>;
	},
>(
	nodes: {
		[K in keyof TState]: Testable<TContext, TState[K]>;
	} & TStateDict,
): And<TContext, TState>;
/**
 * Create an `and` operation from a tuple of testable objects
 */
export function and<
	TContext = any,
	TState = any,
	TTuple extends Array<Testable<TContext>> = Array<Testable<TContext>>,
>(
	nodes: [Testable<TContext, TState>, ...TTuple],
): And<TContext, [TState, ...StatesFromTestableTuple<TTuple, TContext>]>;
// Implementation
export function and<TContext = any, TState = any>(
	nodes:
		| [Testable<TContext>, ...Array<Testable<TContext>>]
		| { [K in keyof TState]: Testable<TContext, TState[K]> },
) {
	if (Array.isArray(nodes)) {
		return fromTuple('and', nodes);
	} else {
		return fromDict('and', nodes);
	}
}

/**
 * Create an `or` operation from a dict of testable objects
 */
export function or<
	TContext extends ContextFromTestableDict<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Testable<any, TState[K]>;
	} = {
		[K in keyof TState]: Testable<any, TState[K]>;
	},
>(
	nodes: {
		[K in keyof TState]: Testable<TContext, TState[K]>;
	} & TStateDict,
): Or<TContext, TState>;
/**
 * Create an `or` operation from a tuple of testable objects
 */
export function or<
	TContext = any,
	TState = any,
	TTuple extends Array<Testable<TContext>> = Array<Testable<TContext>>,
>(
	nodes: [Testable<TContext, TState>, ...TTuple],
): Or<TContext, [TState, ...StatesFromTestableTuple<TTuple, TContext>]>;
// Implementation
export function or<TContext = any, TState = any>(
	nodes:
		| [Testable<TContext>, ...Array<Testable<TContext>>]
		| { [K in keyof TState]: Testable<TContext, TState[K]> },
) {
	if (Array.isArray(nodes)) {
		return fromTuple('or', nodes);
	} else {
		return fromDict('or', nodes);
	}
}

/**
 * Create an `all` operation from a tuple of testable objects
 */
export function all<
	TContext extends ContextFromTestableDict<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Testable<any, TState[K]>;
	} = {
		[K in keyof TState]: Testable<any, TState[K]>;
	},
>(
	nodes: {
		[K in keyof TState]: Testable<TContext, TState[K]>;
	} & TStateDict,
): All<TContext, TState>;
/**
 * Create an `all` operation from a tuple of testable objects
 */
export function all<
	TContext = any,
	TState = any,
	TTuple extends Array<Testable<TContext>> = Array<Testable<TContext>>,
>(
	nodes: [Testable<TContext, TState>, ...TTuple],
): All<TContext, [TState, ...StatesFromTestableTuple<TTuple, TContext>]>;
// Implementation
export function all<TContext = any, TState = any>(
	nodes:
		| [Testable<TContext>, ...Array<Testable<TContext>>]
		| { [K in keyof TState]: Testable<TContext, TState[K]> },
) {
	if (Array.isArray(nodes)) {
		return fromTuple('all', nodes);
	} else {
		return fromDict('all', nodes);
	}
}

/**
 * Create an `any` operation from a tuple of testable objects
 */

export function any<
	TContext extends ContextFromTestableDict<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Testable<any, TState[K]>;
	} = {
		[K in keyof TState]: Testable<any, TState[K]>;
	},
>(
	nodes: {
		[K in keyof TState]: Testable<TContext, TState[K]>;
	} & TStateDict,
): Any<TContext, TState>;
/**
 * Create an `any` operation from a tuple of testable objects
 */
export function any<
	TContext = any,
	TState = any,
	TTuple extends Array<Testable<TContext>> = Array<Testable<TContext>>,
>(
	nodes: [Testable<TContext, TState>, ...TTuple],
): Any<TContext, [TState, ...StatesFromTestableTuple<TTuple, TContext>]>;
// Implementation
export function any<TContext = any, TState = any>(
	nodes:
		| [Testable<TContext>, ...Array<Testable<TContext>>]
		| { [K in keyof TState]: Testable<TContext, TState[K]> },
) {
	if (Array.isArray(nodes)) {
		return fromTuple('any', nodes);
	} else {
		return fromDict('any', nodes);
	}
}

export const Operation = {
	/**
	 * Type guard to check if an object is an operation
	 */
	is: (x: unknown): x is Operation =>
		Testable.is(x) &&
		Operations.includes((x as Operation).op) &&
		// QUESTION: should we validate the array elements?
		Array.isArray((x as Operation).nodes),

	/**
	 * Create a new operation from an input operation that receives a context TContext into an operation that receives
	 * a context TInputContext by applying a transformation function
	 *
	 * @param n - input node
	 * @param f - transformation function
	 */
	map: <TContext = any, TState = any, TInputContext = any>(
		op: Operation<TContext, TState>,
		f: (c: TInputContext) => TContext,
	): Operation<TInputContext, TState> => {
		return {
			op: op.op,
			...Testable.map(op, f),
			nodes: op.nodes.map((n) => Node.map(n, f)),
		};
	},
	and,
	or,
	all,
	any,
};

export default Operation;
