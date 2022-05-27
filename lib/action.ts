// An action perfors an asynchronouse operation based on a given
// context and some current state
export type Action<TContext = any, TState = any> =
	| ((c: TContext) => Promise<unknown>)
	| ((c: TContext, s: TState) => Promise<unknown>);

export const isAction = (x: unknown): x is Action =>
	x != null && typeof x === 'function';

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
	return a;
}

// Utility export
export const Action = {
	is: isAction,
	of,
	map,
};

export default Action;
