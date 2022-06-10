import { keys, IntersectTuple } from './utils';

/**
 * A state is a function that reads some asynchronous state
 */
export type State<TContext = any, TState = any> = (
	c: TContext,
) => Promise<TState>;

// Type guard for a State object
export const is = (x: unknown): x is State =>
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
		// @ts-ignore this as is not yet supported on typescript
		// 4.5.5 but is available in Node 16.
		// TODO: remove this when typescript adds the type support
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

/**
 * Utility type to calculate the combination of an array
 * of State objects into a State that returns a tuple of the individual
 * state elements.
 *
 * It is used by the function `of()` to calculate the combined type of the output .
 *
 * @example:
 * ````
 * const hello = (x: string) => Promise.resolve(`Hello ${x}!!`);
 * const length = (x: string) => Promise.resolve(x.length);
 *
 * // The resulting type is a State<string, [string, number]>
 * const combined = State.of([hello, length]);
 * ```
 */
type StatesFromStateTuple<
	T extends Array<State<TContext>> = [],
	TContext = any,
> = T extends [State<TContext, infer TState>, ...infer TTail]
	? TTail extends Array<State<TContext>>
		? [TState, ...StatesFromStateTuple<TTail, TContext>]
		: [TState]
	: [];

/**
 * Utility type to calculate the combination of an array
 * of State objects into a State that returns a tuple of the individual
 * state elements.
 *
 * It is used by the function `of()` to calculate the combined type of the output .
 *
 * @example:
 * ````
 * const hello = ({a}: {a: number}) => Promise.resolve(`Number is ${a}!!`);
 * const length = ({b}: {b: string}) => Promise.resolve(x.length);
 *
 * // The resulting type is a State<{a: number} & {b: string}, [string, number]>
 * const combined = State.of([hello, length]);
 * ```
 */
type ContextFromStateTuple<T extends State[] = []> = T extends [
	State<infer TContext>,
	...infer TTail,
]
	? TTail extends State[]
		? [TContext, ...ContextFromStateTuple<TTail>]
		: [TContext]
	: [];

/**
 * Combine an array of state objects into a state that returns a tuple of
 * results
 */
export const fromTuple =
	<
		TContext = any,
		TState = any,
		TTuple extends Array<State<TContext>> = Array<State<TContext>>,
	>(
		states: [State<TContext, TState>, ...TTuple],
	): State<
		TContext,
		[State<TContext, TState>, ...StatesFromStateTuple<TTuple, TContext>]
	> =>
	(c: TContext) =>
		Promise.all(states.map((s) => s(c))) as Promise<
			[State<TContext, TState>, ...StatesFromStateTuple<TTuple, TContext>]
		>;

/**
 * Combine a dictionary of state objects into a state that returns a dictionary of
 * the results.
 */
export const fromDict =
	<TContext = any, TState = any>(states: {
		[K in keyof TState]: State<TContext, TState[K]>;
	}): State<TContext, TState> =>
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
 * Utility type to infer the unified context from a dictionary of state objects. This is used to
 * infer the combined context for the `of()` function and is not meant to be exported.
 *
 * Because of the way type inference works in conditional types works (see the link below), the
 * resulting type will be the intersection of the individual context types for each element in the dictionary.
 *
 * https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-8.html#type-inference-in-conditional-types
 *
 * @example
 * ```
 * const hello = (a: string) => Promise.resolve(`Hello ${a}!!`);
 * const goodbye = (b: string) => Promise.resolve(`Goodbye ${b}!!`);
 *
 * // The combined context will be `string & string = string`
 * const combined = State.of({hello, goodbye});
 *
 * const num = (b: number) => Promise.resolve(`Value is ${b}!!`);
 *
 * // The combined2 context will be `string & number = never`
 * const combined2 = State.of({hello, num});
 * 	````
 */
type ContextFromStateDict<
	T extends { [K in keyof TState]: State<any, TState[K]> },
	TState = any,
> = T[keyof TState] extends State<infer TContext> ? TContext : never;

const hello = ({ a }: { a: number }) => Promise.resolve(`Hello ${a}!!`);
const length = ({ b }: { b: string }) => Promise.resolve(b.length);

const greetings = of([hello, length]);

/**
 * Combine an array of state objects into a state that returns a tuple of
 * results
 *
 * NOTE: All State objects of the tuple need to have the same context type otherwise the
 * compiler infer the resulting context as `never`
 */
export function of<
	TContext extends IntersectTuple<ContextFromStateTuple<TInput>>,
	TState = any,
	TTuple extends State[] = State[],
	TInput extends State[] = State[],
>(
	states: [State<TContext, TState>, ...TTuple] & TInput,
): State<TContext, [TState, ...StatesFromStateTuple<TTuple, TContext>]>;
/**
 * Combine a dictionary of State objects into a state that returns a dictionary of
 * the results.
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
	TContext extends ContextFromStateDict<TStateDict, TState>,
	TState = any,
	TStateDict extends {
		[K in keyof TState]: State<any, TState[K]>;
	} = { [K in keyof TState]: State<any, TState[K]> },
>(
	states: { [K in keyof TState]: State<TContext, TState[K]> } & TStateDict,
): State<TContext, TState>;
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
	is,
	map,
};

export default State;
