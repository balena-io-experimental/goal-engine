import { keys } from './utils';

// An action perfors an asynchronouse operation based on a given
// context and some current state
export type Action<TContext = any, TState = any> = (
	c: TContext,
	s: TState,
) => Promise<unknown>;

/**
 * Transform an action that receives a context A into an action that receives
 * a context B by applying a transformation function
 */
export const map =
	<TOtherContext = any, TContext = any, TState = any>(
		a: Action<TContext, TState>,
		f: (c: TOtherContext) => TContext,
	): Action<TOtherContext, TState> =>
	(c: TOtherContext, s: TState) =>
		a(f(c), s);

type TupleStates<
	T extends Array<Action<TContext>>,
	TContext = any,
> = T extends [Action<TContext, infer TState>, ...infer TTail]
	? TTail extends Array<Action<TContext>>
		? [TState, ...TupleStates<TTail, TContext>]
		: [TState]
	: [];

/**
 * Combine an array of action objects into an action that operates on a tuple
 * or states
 */
const tuple =
	<
		TContext = any,
		TState = any,
		TTuple extends Array<Action<TContext>> = Array<Action<TContext, any>>,
	>([head, ...tail]: [Action<TContext, TState>, ...TTuple]): Action<
		TContext,
		[TState, ...TupleStates<TTuple, TContext>]
	> =>
	(c: TContext, s: [TState, ...TupleStates<TTuple, TContext>]) =>
		Promise.all([head, ...tail].map((a, i) => a(c, s[i])));

// Infer the context from a dictionary. This will only make sense if all the actions
// have the same context otherwise it will return invalid types like `number & string`
type DictionaryContext<
	T extends { [K in keyof TState]: Action<any, TState[K]> },
	TState = any,
> = T extends {
	[K in keyof TState]: Action<infer TContext, TState[K]>;
}
	? TContext
	: never;

/**
 * Combine a dictionary of action objects into an action that operates on a dictionary of
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
			[K in keyof TState]: Action<any, TState[K]>;
		},
		TContext extends DictionaryContext<TStateDict, TState>,
		TState = any,
	>(actions: {
		[K in keyof TState]: Action<TContext, TState[K]>;
	}): Action<TContext, { [K in keyof TState]: TState[K] }> =>
	async (c: TContext, s: { [K in keyof TState]: TState[K] }) => {
		const res = await Promise.all(
			keys(actions).map((k) => actions[k](c, s[k]).then((r) => ({ [k]: r }))),
		);

		// Return the combined results even though we don't really care about the
		// result of an action
		return res.reduce((combined, r) => ({ ...combined, ...r }), {});
	};

/**
 * Combine an array of action objects into an action that operates on a tuple of
 * states
 */
export function of<
	TContext = any,
	TState = any,
	TTuple extends Array<Action<TContext>> = Array<Action<TContext, any>>,
>([head, ...tail]: [Action<TContext, TState>, ...TTuple]): Action<
	TContext,
	[TState, ...TupleStates<TTuple, TContext>]
>;
/**
 * Combine a dictionary of action objects into an action that operates on a dictionary of
 * states.
 *
 * **Note**: All state objects must have the same context type
 * TODO: we have not found a way to reliably validate the inputs to prevent creating
 * combinators from incompatible types, however such combinators are unusable as the type
 * signature won't match anything.
 */
export function of<
	TStateDict extends {
		[K in keyof TState]: Action<any, TState[K]>;
	},
	TContext extends DictionaryContext<TStateDict, TState>,
	TState = any,
>(
	actions: {
		[K in keyof TState]: Action<TContext, TState[K]>;
	} & TStateDict, // Unification is needed to infer arguments of output function
): Action<TContext, { [K in keyof TState]: TState[K] }>;
/**
 * Create an action from a function
 */
export function of<TContext = any, TState = any>(
	a: Action<TContext, TState>,
): Action<TContext, TState>;
export function of<
	T extends
		| { [K in keyof TState]: Action<TContext, TState[K]> }
		| [Action<TContext, TState>, ...Array<Action<TContext>>]
		| Action<TContext, TState>,
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
				[K in keyof TState]: Action<any, TState[K]>;
			},
		);
	}
}

// Utility export
export const Action = {
	of,
	map,
};

export default Action;
