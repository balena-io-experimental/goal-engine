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

type TupleStates<T extends Array<Test<TContext>>, TContext = any> = T extends [
	Test<TContext, infer TState>,
	...infer TTail
]
	? TTail extends Array<Test<TContext>>
		? [TState, ...TupleStates<TTail, TContext>]
		: [TState]
	: [];

// Infer the context from a dictionary. This will only make sense if all the states
// have the same context otherwise it will return invalid types like `number & string`
type DictionaryContext<
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
function fromDict<TContext = any, TState = any>(tests: {
	[K in keyof TState]: Test<TContext, TState[K]>;
}): Test<TContext, { [K in keyof TState]: TState[K] }> {
	return (c: TContext, s: { [K in keyof TState]: TState[K] }) =>
		keys(tests).filter((k) => !tests[k](c, s[k])).length === 0;
}

/**
 * Combine an array of test objects into a test that returns true if all
 * tests succeed
 */
function fromTuple<
	TContext = any,
	TState = any,
	TTuple extends Array<Test<TContext>> = Array<Test<TContext, any>>,
>(
	tests: [Test<TContext, TState>, ...TTuple],
): Test<TContext, [TState, ...TupleStates<TTuple, TContext>]> {
	return (c: TContext, s: [TState, ...TupleStates<TTuple, TContext>]) =>
		// The test will fail if there are any false results
		tests.filter((t, i) => !t(c, s[i])).length === 0;
}

/**
 * Combine an array of test objects into a test that returns true if
 * all tests succeed
 */
export function all<
	TContext = any,
	TState = any,
	TTuple extends Array<Test<TContext>> = Array<Test<TContext, any>>,
>(
	tests: [Test<TContext, TState>, ...TTuple],
): Test<TContext, [TState, ...TupleStates<TTuple, TContext>]>;
/**
 * Combine a dict of test objects into a test that returns true if all
 * tests succeed
 */
export function all<
	TContext extends DictionaryContext<TStateDict, TState>,
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
): Test<TContext, { [K in keyof TState]: TState[K] }>;
export function all<
	T extends
		| { [K in keyof TState]: Test<TContext, TState[K]> }
		| [Test<TContext, TState>, ...Array<Test<TContext>>],
	TContext = any,
	TState = any,
>(tests: T) {
	if (Array.isArray(tests)) {
		return fromTuple(tests);
	} else {
		// The alternative is a dict
		return fromDict(
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
): Test<TContext, [TState, ...TupleStates<TTuple, TContext>]>;
export function of<
	TStateDict extends {
		[K in keyof TState]: Test<any, TState[K]>;
	},
	TContext extends DictionaryContext<TStateDict, TState>,
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
		return fromTuple(t);
	} else if (typeof t === 'function') {
		return t;
	} else {
		// The alternative is a dict
		return fromDict(
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
	fromDict,
};

export default Test;
