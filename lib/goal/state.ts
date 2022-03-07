import { keys } from './utils';

/**
 * A state is a function that reads some asynchronous state
 */
export type State<TContext = any, TState = any> = (
	c: TContext,
) => Promise<TState>;

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
type InferContext<
	T extends { [K in keyof TState]: State<any, TState[K]> },
	TState = any,
> = T extends {
	[K in keyof TState]: State<infer TContext, TState[K]>;
}
	? TContext
	: never;

type InferStates<T extends Array<State<TContext>>, TContext = any> = T extends [
	State<TContext, infer TState>,
	...infer TTail
]
	? TTail extends Array<State<TContext>>
		? [TState, ...InferStates<TTail, TContext>]
		: [TState]
	: [];

/**
 * Combine an array of state objects into a state that returns a tuple of
 * results
 */
const tuple =
	<
		TContext = any,
		TState = any,
		TRest extends Array<State<TContext>> = Array<State<TContext, any>>,
	>([first, ...elems]: [State<TContext, TState>, ...TRest]): State<
		TContext,
		[TState, ...InferStates<TRest, TContext>]
	> =>
	(c: TContext) =>
		Promise.all([first, ...elems].map((s) => s(c))) as Promise<
			[TState, ...InferStates<TRest, TContext>]
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
const dict =
	<
		TStateDict extends {
			[K in keyof TState]: State<any, TState[K]>;
		},
		TContext extends InferContext<TStateDict, TState>,
		TState = any,
	>(props: {
		[K in keyof TState]: State<TContext, TState[K]>;
	}): State<TContext, { [K in keyof TState]: TState[K] }> =>
	async (c: TContext) => {
		// Get the individual states first as an array
		const states = await Promise.all(
			keys(props).map((k) =>
				props[k](c).then(
					// The type assertion is needed as typescript is not smart enough
					// to figure it out
					(s) => ({ [k]: s } as { [K in keyof TState]: TState[K] }),
				),
			),
		);

		// Combine the individual states into a single object
		return states.reduce(
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
	TRest extends Array<State<TContext>> = Array<State<TContext, any>>,
>([first, ...elems]: [State<TContext, TState>, ...TRest]): State<
	TContext,
	[TState, ...InferStates<TRest, TContext>]
>;
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
	TStateDict extends {
		[K in keyof TState]: State<any, TState[K]>;
	},
	TContext extends InferContext<TStateDict, TState>,
	TState = any,
>(
	props: {
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
		return tuple(a);
	} else if (typeof a === 'function') {
		return a;
	} else {
		return dict(
			a as {
				[K in keyof TState]: State<any, TState[K]>;
			},
		);
	}
}

export const State = {
	of,
	map,
};

export default State;
