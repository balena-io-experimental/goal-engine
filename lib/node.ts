import { Actionable } from './actionable';
import { Operation } from './operation';
import { Testable } from './testable';

/**
 * A node is any of the possible elements in the execution graph.
 *
 * - Assertions are graph leafs. Their state cannot be changed
 * - Actionables are intermediate nodes, they link to other nodes through the `requires` property
 * - Operations are intermediate nodes, they provide a branching point in the execution graph
 */
export type Node<TContext = any, TState = any> =
	| Testable<TContext, TState>
	| Actionable<TContext, TState>
	| Operation<TContext>;

export const Node = {
	is: (x: unknown): x is Node => Testable.is(x),

	/**
	 * Create a new node from an input node that receives a context TContext into an node that receives
	 * a context TInputContext by applying a transformation function
	 *
	 * @param n - input node
	 * @param f - transformation function
	 */
	map: <TContext = any, TState = any, TInputContext = any>(
		n: Node<TContext, TState>,
		f: (c: TInputContext) => TContext,
	): Node<TInputContext, TState> => {
		if (Operation.is(n)) {
			return Operation.map(n, f);
		} else if (Actionable.is(n)) {
			return Actionable.map(n, f);
		} else {
			return Testable.map(n, f);
		}
	},
};
