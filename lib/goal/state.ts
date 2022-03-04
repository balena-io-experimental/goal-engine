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
