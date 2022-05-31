import { State } from './state';
import { Test } from './test';

/**
 * An testable describes a repeatable test on a piece of a system state.
 *
 * Examples:
 * - Is process with pid X running?
 * - Is configuration X set to true?
 * - Does dependency X exist?
 * - Does the system have connectivity to URL X?
 */
export interface Testable<TContext = any, TState = any> {
	/**
	 * Provides the mechanism to read a specific piece of state
	 */
	readonly state: State<TContext, TState>;

	/**
	 * The test acts on the state in order to check for the desired condition
	 */
	readonly test: Test<TContext, TState>;
}

export const Testable = {
	/**
	 * Type guard to check if a given object is a testable
	 */
	is: (x: unknown): x is Testable =>
		x != null &&
		State.is((x as Testable).state) &&
		Test.is((x as Testable).test),

	/**
	 * Create a new testable from an input testable that receives a context TContext into a testable that receives
	 * a context TInputContext by applying a transformation function
	 *
	 * @param n - input node
	 * @param f - transformation function
	 */
	map: <TContext = any, TState = any, TInputContext = any>(
		n: Testable<TContext, TState>,
		f: (c: TInputContext) => TContext,
	): Testable<TInputContext, TState> => {
		return { state: State.map(n.state, f), test: Test.map(n.test, f) };
	},
};
