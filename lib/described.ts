import { AssertionError } from 'assert';

// Utility type to prevent an input from being null
type NotNull<T> = T extends null ? never : T;

// A description is any function returning a string from an input argument
export type Description<TContext = any> = (ctx: TContext) => string;

/**
 * A described is an object or a function with a
 * `description` property
 */
export interface Described<TContext = any> {
	description: Description<TContext>;
}

/**
 * Type guard to check if an object is a described
 */
export const is = (x: unknown): x is Described =>
	x != null &&
	Object.getOwnPropertyNames(x).includes('description') &&
	typeof (x as any).description === 'function';

/**
 * Create a described object from either a non-null object
 * or a function input
 */
export const of = <
	T extends NotNull<object> | ((...args: any[]) => any),
	TContext = any,
>(
	x: T,
	description: Description<TContext>,
): T & Described<TContext> => {
	if (typeof x === 'object' && x !== null) {
		return { ...x, description };
	} else if (typeof x === 'function') {
		// clone the function and add the property to the clone
		const f = x.bind({});
		return Object.assign(f, { ...x, description });
	}

	// Should never be callsed
	throw new AssertionError({
		message: 'Expected first parameter to be a non-null object or a function',
		actual: x,
	});
};

/**
 * Transform an action that receives a context A into an action that receives
 * a context B by applying a transformation function
 */
export const map = <TOtherContext = any, TContext = any>(
	a: Described<TContext>,
	f: (c: TOtherContext) => TContext,
): Described<TOtherContext> => ({
	description: (c: TOtherContext) => a.description(f(c)),
});

export const Described = {
	is,
	of,
	map,
};

export default Described;
