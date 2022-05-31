import { Action } from './action';

// This establishes a circular dependency with the node module, however there is no way
// to really avoid it other than putting all the definitions in the same file
import { Node } from './node';
import { Testable } from './testable';

/**
 * An actionable describes a mechanism to change a system's state that does not
 * meet an expected condition. Given a set of preconditions is met, running the actions
 * should modify the system state to meet the condition.
 *
 * Examples:
 * - Is process with pid X running? If not, run the binary Y
 * - Is configuration X set to true? If not, modify the file to enable
 * - Does dependency X exist? If not, install the dependency
 * - Does the system have connectivity to URL X? If not, change the default network interface
 */
export interface Actionable<TContext = any, TState = any>
	extends Testable<TContext, TState> {
	/**
	 * If the goal has not been met, the action should let us reach the
	 * goal given that all pre-conditions (or before-goals) are met
	 */
	readonly action: Action<TContext, TState>;

	/**
	 * Conditions that need to be met before running the action.
	 */
	readonly requires?: Node<TContext>;
}

export const Actionable = {
	/**
	 * Type guard to check if a given object is a seekable
	 */
	is: (x: unknown): x is Actionable =>
		Testable.is(x) && Action.is((x as Actionable).action),

	/**
	 * Create a new actionable from an input actionable that receives a context TContext into an actionable that receives
	 * a context TInputContext by applying a transformation function
	 *
	 * @param n - input node
	 * @param f - transformation function
	 */
	map: <TContext = any, TState = any, TInputContext = any>(
		n: Actionable<TContext, TState>,
		f: (c: TInputContext) => TContext,
	): Actionable<TInputContext, TState> => {
		return {
			...Testable.map(n, f),
			action: Action.map(n.action, f),
			...(n.requires && {
				requires: Node.map(n.requires, f),
			}),
		};
	},
};
