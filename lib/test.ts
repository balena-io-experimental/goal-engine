import { keys } from './utils';

// A test checks checks a piece of test against a condition
export type Test<TContext = any, TState = any> = (
	c: TContext,
	s: TState,
) => boolean;

export const isTest = (x: unknown): x is Test =>
	x != null && typeof x === 'function';

/**
 * Transform a test that receives a context A into a test that receives
 * a context B by applying a transformation function
 */
export const map =
	<TOtherContext = any, TContext = any, TState = any>(
		t: Test<TContext, TState>,
		f: (c: TOtherContext) => TContext,
	): Test<TOtherContext, TState> =>
	(c: TOtherContext, s: TState) =>
		t(f(c), s);

/**
 * Utility type to calculate the combination of an array
 * of Test objects into a Test that returns a tuple of the individual
 * state elements.
 *
 * It is used by the `any()` and `all()` functions to calculate the combined type of the output .
 */
type StatesFromTestTuple<
	T extends Array<Test<TContext>>,
	TContext = any,
> = T extends [Test<TContext, infer TState>, ...infer TTail]
	? TTail extends Array<Test<TContext>>
		? [TState, ...StatesFromTestTuple<TTail, TContext>]
		: [TState]
	: [];

/**
 * Utility type to infer the unified context from a dictionary of Test objects. This is used to
 * infer the combined context for the `any()` and `all()` function and is not meant to be exported.
 *
 * Because of the way type inference works in conditional types works (see the link below), the
 * resulting type will be the intersection of the individual context types for each element in the dictionary.
 *
 * https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-8.html#type-inference-in-conditional-types
 */
type ContextFromTestDict<
	T extends { [K in keyof TState]: Test<any, TState[K]> },
	TState = any,
> = T[keyof TState] extends Test<infer TContext> ? TContext : never;

/**
 * Combine a dict of test objects into a test that returns true if all
 * tests succeed
 */
export function allFromDict<TContext = any, TState = any>(tests: {
	[K in keyof TState]: Test<TContext, TState[K]>;
}): Test<TContext, TState> {
	return (c: TContext, s: TState) =>
		keys(tests).filter((k) => !tests[k](c, s[k])).length === 0;
}

/**
 * Combine an array of test objects into a test that returns true if all
 * tests succeed
 */
export function allFromTuple<
	TContext = any,
	TState = any,
	TTuple extends Array<Test<TContext>> = Array<Test<TContext, any>>,
>(
	tests: [Test<TContext, TState>, ...TTuple],
): Test<TContext, [TState, ...StatesFromTestTuple<TTuple, TContext>]> {
	return (c: TContext, s: [TState, ...StatesFromTestTuple<TTuple, TContext>]) =>
		// The test will fail if there are any false results
		tests.filter((t, i) => !t(c, s[i])).length === 0;
}

/**
 * Combine a dict of test objects into a test that returns true if any
 * of the tests succeed
 */
export function anyFromDict<TContext = any, TState = any>(tests: {
	[K in keyof TState]: Test<TContext, TState[K]>;
}): Test<TContext, TState> {
	return (c: TContext, s: TState) =>
		keys(tests).filter((k) => tests[k](c, s[k])).length > 0;
}

/**
 * Combine an array of test objects into a test that returns true if any
 * of the tests succeed
 */
function anyFromTuple<
	TContext = any,
	TState = any,
	TTuple extends Array<Test<TContext>> = Array<Test<TContext, any>>,
>(
	tests: [Test<TContext, TState>, ...TTuple],
): Test<TContext, [TState, ...StatesFromTestTuple<TTuple, TContext>]> {
	return (c: TContext, s: [TState, ...StatesFromTestTuple<TTuple, TContext>]) =>
		// The test will pass if there are any true results
		tests.filter((t, i) => t(c, s[i])).length > 0;
}

/**
 * Combine an array of test objects into a test that returns true if
 * all tests succeed
 *
 * NOTE: All Test objects of the tuple need to have the same context type otherwise the
 * compiler infer the resulting context as `never`
 */
export function all<
	TContext = any,
	TState = any,
	TTuple extends Array<Test<TContext>> = Array<Test<TContext, any>>,
>(
	tests: [Test<TContext, TState>, ...TTuple],
): Test<TContext, [TState, ...StatesFromTestTuple<TTuple, TContext>]>;
/**
 * Combine a dict of test objects into a test that returns true if all
 * tests succeed
 */
export function all<
	TContext extends ContextFromTestDict<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Test<any, TState[K]>;
	} = {
		[K in keyof TState]: Test<any, TState[K]>;
	},
>(
	tests: {
		[K in keyof TState]: Test<TContext, TState[K]>;
	} & TStateDict,
): Test<TContext, TState>;
export function all<
	T extends
		| { [K in keyof TState]: Test<TContext, TState[K]> }
		| [Test<TContext, TState>, ...Array<Test<TContext>>],
	TContext = any,
	TState = any,
>(tests: T) {
	if (Array.isArray(tests)) {
		return allFromTuple(tests);
	} else {
		// The alternative is a dict
		return allFromDict(
			tests as {
				[K in keyof TState]: Test<any, TState[K]>;
			},
		);
	}
}

/**
 * Combine an array of test objects into a test that returns true if
 * any of the tests succeed
 *
 * NOTE: All Test objects of the tuple need to have the same context type otherwise the
 * compiler infer the resulting context as `never`
 */
export function any<
	TContext = any,
	TState = any,
	TTuple extends Array<Test<TContext>> = Array<Test<TContext, any>>,
>(
	tests: [Test<TContext, TState>, ...TTuple],
): Test<TContext, [TState, ...StatesFromTestTuple<TTuple, TContext>]>;
/**
 * Combine a dict of test objects into a test that returns true if any of the
 * tests succeed
 */
export function any<
	TContext extends ContextFromTestDict<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: Test<any, TState[K]>;
	} = {
		[K in keyof TState]: Test<any, TState[K]>;
	},
>(
	tests: {
		[K in keyof TState]: Test<TContext, TState[K]>;
	} & TStateDict,
): Test<TContext, TState>;
export function any<
	T extends
		| { [K in keyof TState]: Test<TContext, TState[K]> }
		| [Test<TContext, TState>, ...Array<Test<TContext>>],
	TContext = any,
	TState = any,
>(tests: T) {
	if (Array.isArray(tests)) {
		return anyFromTuple(tests);
	} else {
		// The alternative is a dict
		return anyFromDict(
			tests as {
				[K in keyof TState]: Test<any, TState[K]>;
			},
		);
	}
}

/**
 * Create a test that succeeds when all arguments succeed
 */
export function of<
	TContext = any,
	TState = any,
	TTuple extends Array<Test<TContext>> = Array<Test<TContext, any>>,
>(
	tests: [Test<TContext, TState>, ...TTuple],
): Test<TContext, [TState, ...StatesFromTestTuple<TTuple, TContext>]>;
export function of<
	TStateDict extends {
		[K in keyof TState]: Test<any, TState[K]>;
	},
	TContext extends ContextFromTestDict<TStateDict, TState>,
	TState = any,
>(tests: {
	[K in keyof TState]: Test<TContext, TState[K]>;
}): Test<TContext, { [K in keyof TState]: TState[K] }>;
export function of<TContext = any, TState = any>(
	s: Test<TContext, TState>,
): Test<TContext, TState>;
export function of<
	T extends
		| { [K in keyof TState]: Test<TContext, TState[K]> }
		| [Test<TContext, TState>, ...Array<Test<TContext>>],
	TContext = any,
	TState = any,
>(t: T) {
	if (Array.isArray(t)) {
		return allFromTuple(t);
	} else if (typeof t === 'function') {
		return t;
	} else {
		// The alternative is a dict
		return allFromDict(
			t as {
				[K in keyof TState]: Test<any, TState[K]>;
			},
		);
	}
}

export const Test = {
	is: isTest,
	of,
	map,
	all,
	any,
};

export default Test;
