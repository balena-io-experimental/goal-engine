import { keys } from './utils';

/**
 * A state is a function that reads some asynchronous state
 */
export type State<TContext = any, TState = any> = (
	c: TContext,
) => Promise<TState>;

export const isState = (x: unknown): x is State =>
	// TODO: figure out if there is a way to get the return type of the function to check
	// if it is a promise, without actually calling the function
	x != null && typeof x === 'function';

/**
 * State functions can throw this exception to indicate that
 * failure to get the state should be considered
 * a test failure and hence trigger an action
 */
export class StateNotFound extends Error {
	constructor(message?: string, cause?: Error) {
		// @ts-ignore this is not yet supported on typescript
		// 4.5.5 but is available in Node 16.
		// TODO: remove this when typescript adds supported
		super(message, { cause });
	}
}

/**
 * Transform a state that receives a context A into a state that receives
 * a context B by applying a transformation function
 */
export const map =
	<TOtherContext = any, TContext = any, TState = any>(
		s: State<TContext, TState>,
		f: (c: TOtherContext) => TContext,
	): State<TOtherContext, TState> =>
	(c: TOtherContext) =>
		s(f(c));

// Infer the context from a dictionary. This will only make sense if all the states
// have the same context otherwise it will return invalid types like `number & string`
type DictionaryContext<
	T extends { [K in keyof TState]: State<any, TState[K]> },
	TState = any,
> = T extends {
	[K in keyof TState]: State<infer TContext, TState[K]>;
}
	? TContext
	: never;

type TupleStates<
	T extends Array<State<TContext>> = [],
	TContext = any,
> = T extends [State<TContext, infer TState>, ...infer TTail]
	? TTail extends Array<State<TContext>>
		? [TState, ...TupleStates<TTail, TContext>]
		: [TState]
	: [];

/**
 * Combine an array of state objects into a state that returns a tuple of
 * results
 */
const fromTuple =
	<
		TContext = any,
		TState = any,
		TTuple extends Array<State<TContext>> = Array<State<TContext>>,
	>(
		states: [State<TContext, TState>, ...TTuple],
	): State<
		TContext,
		[State<TContext, TState>, ...TupleStates<TTuple, TContext>]
	> =>
	(c: TContext) =>
		Promise.all(states.map((s) => s(c))) as Promise<
			[State<TContext, TState>, ...TupleStates<TTuple, TContext>]
		>;

/**
 * Combine a dictionary of state objects into a state that returns a dictionary of
 * the results.
 *
 * **Note**: All state objects must have the same context type
 * TODO: we have not found a way to reliably validate the inputs to prevent creating
 * combinators from incompatible types, however such combinators are unusable as the type
 * signature won't match anything.
 */
const fromDict =
	<TContext = any, TState = any>(states: {
		[K in keyof TState]: State<TContext, TState[K]>;
	}): State<TContext, { [K in keyof TState]: TState[K] }> =>
	async (c: TContext) => {
		// Get the individual states first as an array
		const values = await Promise.all(
			keys(states).map((k) =>
				states[k](c).then(
					// The type assertion is needed as typescript is not smart enough
					// to figure it out
					(s) => ({ [k]: s } as { [K in keyof TState]: TState[K] }),
				),
			),
		);

		// Combine the individual states into a single object
		return values.reduce(
			(combined, s) => ({ ...combined, ...s }),
			{} as { [K in keyof TState]: TState[K] },
		);
	};

/**
 * Combine an array of state objects into a state that returns a tuple of
 * results
 */
export function of<
	TContext = any,
	TState = any,
	TTuple extends Array<State<TContext>> = Array<State<TContext>>,
>(
	states: [State<TContext, TState>, ...TTuple],
): State<TContext, [TState, ...TupleStates<TTuple, TContext>]>;
/**
 * Combine a dictionary of state objects into a state that returns a dictionary of
 * the results.
 *
 * **Note**: All state objects must have the same context type
 * TODO: we have not found a way to reliably validate the inputs to prevent creating
 * combinators from incompatible types, however such combinators are unusable as the type
 * signature won't match anything.
 *
 * @example
 * const hello = (x: string) => Promise.resolve(`Hello ${x}!!`);
 * const goodbye = (x: string) => Promise.resolve(`Goodbye ${x}!!`);
 *
 * const greetings = State.of({ hello, goodbye });
 *
 * expect(await greetings('world')).to.deep.equal({
 *   hello: 'Hello world!!',
 *   goodbye: 'Goodbye world!!',
 * });
 */
export function of<
	TContext extends DictionaryContext<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: State<any, TState[K]>;
	} = { [K in keyof TState]: State<any, TState[K]> },
>(
	states: {
		[K in keyof TState]: State<TContext, TState[K]>;
	} & TStateDict,
): State<TContext, { [K in keyof TState]: TState[K] }>;
/**
 * Create a state from a function
 */
export function of<TContext = any, TState = any>(
	s: State<TContext, TState>,
): State<TContext, TState>;
export function of<
	T extends
		| { [K in keyof TState]: State<TContext, TState[K]> }
		| [State<TContext, TState>, ...Array<State<TContext>>]
		| State<TContext, TState>,
	TContext = any,
	TState = any,
>(a: T) {
	if (Array.isArray(a)) {
		return fromTuple(a);
	} else if (typeof a === 'function') {
		return a;
	} else {
		return fromDict(
			a as {
				[K in keyof TState]: State<any, TState[K]>;
			},
		);
	}
}

export const State = {
	of,
	is: isState,
	map,
	fromDict,
	fromTuple,
};

export default State;
