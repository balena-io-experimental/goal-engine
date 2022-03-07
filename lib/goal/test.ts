import { keys } from './utils';

// A test checks checks a piece of test against a condition
export type Test<TContext = any, TState = any> = (
	c: TContext,
	s: TState,
) => boolean;

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

type InferStates<T extends Array<Test<TContext>>, TContext = any> = T extends [
	Test<TContext, infer TState>,
	...infer TTail
]
	? TTail extends Array<Test<TContext>>
		? [TState, ...InferStates<TTail, TContext>]
		: [TState]
	: [];

// Infer the context from a dictionary. This will only make sense if all the states
// have the same context otherwise it will return invalid types like `number & string`
type InferContext<
	T extends { [K in keyof TState]: Test<any, TState[K]> },
	TState = any,
> = T extends {
	[K in keyof TState]: Test<infer TContext, TState[K]>;
}
	? TContext
	: never;

/**
 * Combine a dict of test objects into a test that returns true if all
 * tests succeed
 */
function allInDict<
	TStateDict extends {
		[K in keyof TState]: Test<any, TState[K]>;
	},
	TContext extends InferContext<TStateDict, TState>,
	TState = any,
>(tests: {
	[K in keyof TState]: Test<TContext, TState[K]>;
}): Test<TContext, { [K in keyof TState]: TState[K] }> {
	return (c: TContext, s: { [K in keyof TState]: TState[K] }) =>
		keys(tests).filter((k) => !tests[k](c, s[k])).length === 0;
}

/**
 * Combine an array of test objects into a test that returns true if all
 * tests succeed
 */
function allInTuple<
	TContext = any,
	TState = any,
	TRest extends Array<Test<TContext>> = Array<Test<TContext, any>>,
>([first, ...elems]: [Test<TContext, TState>, ...TRest]): Test<
	TContext,
	[TState, ...InferStates<TRest, TContext>]
> {
	return (c: TContext, s: [TState, ...InferStates<TRest, TContext>]) =>
		// The test will fail if there are any false results
		[first, ...elems].filter((t, i) => !t(c, s[i])).length === 0;
}

/**
 * Combine an array of test objects into a test that returns true if
 * all tests succeed
 */
export function all<
	TContext = any,
	TState = any,
	TRest extends Array<Test<TContext>> = Array<Test<TContext, any>>,
>([first, ...elems]: [Test<TContext, TState>, ...TRest]): Test<
	TContext,
	[TState, ...InferStates<TRest, TContext>]
>;
/**
 * Combine a dict of test objects into a test that returns true if all
 * tests succeed
 */
export function all<
	TStateDict extends {
		[K in keyof TState]: Test<any, TState[K]>;
	},
	TContext extends InferContext<TStateDict, TState>,
	TState = any,
>(
	tests: {
		[K in keyof TState]: Test<TContext, TState[K]>;
	} & TStateDict,
): Test<TContext, { [K in keyof TState]: TState[K] }>;
export function all<
	T extends
		| { [K in keyof TState]: Test<TContext, TState[K]> }
		| [Test<TContext, TState>, ...Array<Test<TContext>>],
	TContext = any,
	TState = any,
>(tests: T) {
	if (Array.isArray(tests)) {
		return allInTuple(tests);
	} else {
		// The alternative is a dict
		return allInDict(
			tests as {
				[K in keyof TState]: Test<any, TState[K]>;
			},
		);
	}
}

/**
 * Combine an array of test objects into a test that returns true if
 * any of the tests succeed
 */
function anyInTuple<
	TContext = any,
	TState = any,
	TRest extends Array<Test<TContext>> = Array<Test<TContext, any>>,
>([first, ...elems]: [Test<TContext, TState>, ...TRest]): Test<
	TContext,
	[TState, ...InferStates<TRest, TContext>]
> {
	return (c: TContext, s: [TState, ...InferStates<TRest, TContext>]) =>
		// The test will fail if there are any false results
		[first, ...elems].filter((t, i) => t(c, s[i])).length > 0;
}

/**
 * Combine a dict of test objects into a test that returns true if
 * any of the tests succeed
 */
function anyInDict<
	TStateDict extends {
		[K in keyof TState]: Test<any, TState[K]>;
	},
	TContext extends InferContext<TStateDict, TState>,
	TState = any,
>(tests: {
	[K in keyof TState]: Test<TContext, TState[K]>;
}): Test<TContext, { [K in keyof TState]: TState[K] }> {
	return (c: TContext, s: { [K in keyof TState]: TState[K] }) =>
		keys(tests).filter((k) => tests[k](c, s[k])).length > 0;
}

/**
 * Combine an array of test objects into a test that returns true if
 * any of the tests succeed
 */
export function any<
	TContext = any,
	TState = any,
	TRest extends Array<Test<TContext>> = Array<Test<TContext, any>>,
>([first, ...elems]: [Test<TContext, TState>, ...TRest]): Test<
	TContext,
	[TState, ...InferStates<TRest, TContext>]
>;
/**
 * Combine a dict of test objects into a test that returns true if
 * any of the tests succeed
 */
export function any<
	TStateDict extends {
		[K in keyof TState]: Test<any, TState[K]>;
	},
	TContext extends InferContext<TStateDict, TState>,
	TState = any,
>(
	tests: {
		[K in keyof TState]: Test<TContext, TState[K]>;
	} & TStateDict,
): Test<TContext, { [K in keyof TState]: TState[K] }>;
export function any<
	T extends
		| { [K in keyof TState]: Test<TContext, TState[K]> }
		| [Test<TContext, TState>, ...Array<Test<TContext>>],
	TContext = any,
	TState = any,
>(tests: T) {
	if (Array.isArray(tests)) {
		return anyInTuple(tests);
	} else {
		// The alternative is a dict
		return anyInDict(
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
	TRest extends Array<Test<TContext>> = Array<Test<TContext, any>>,
>([first, ...elems]: [Test<TContext, TState>, ...TRest]): Test<
	TContext,
	[TState, ...InferStates<TRest, TContext>]
>;
export function of<
	TStateDict extends {
		[K in keyof TState]: Test<any, TState[K]>;
	},
	TContext extends InferContext<TStateDict, TState>,
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
		return allInTuple(t);
	} else if (typeof t === 'function') {
		return t;
	} else {
		// The alternative is a dict
		return allInDict(
			t as {
				[K in keyof TState]: Test<any, TState[K]>;
			},
		);
	}
}

export const Test = {
	of,
	map,
	all,
	any,
};

export default Test;
