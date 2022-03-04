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

/**
 * Combine a dictionary of state objects into a state that returns a dictionary of
 * the results.
 *
 * **Note**: All state objects must have the same type
 * TODO: we have not found a way to reliably validate the inputs to prevent creating
 * combinators from incompatible types, however such combinators are unusable as the type
 * signature won't match anything.
 *
 * @example
 * const one: State<number, number> = (x: number) => Promise.resolve(x)
 * const two: State<number, string> = (x: number) => Promise.resolve(String(x + 1))
 *
 * const combined = state({one, two})
 *
 * await combined(1) // returns {one: 1, two: "2"}
 */
export const state =
	<
		TStateDict extends {
			[K in keyof TState]: State<any, TState[K]>;
		},
		TContext extends InferContext<TStateDict, TState>,
		TState = any,
	>(
		props: {
			[K in keyof TState]: State<TContext, TState[K]>;
		} & TStateDict,
	): State<TContext, { [K in keyof TState]: TState[K] }> =>
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
