import { Actionable } from './actionable';
import { Described } from './described';
import { Node } from './node';
import { Operation } from './operation';
import { StateNotFound } from './state';
import { Testable } from './testable';

/**
 * Tries to reach a goal given an context.
 *
 * This function will follow the dependency graph to perform the necessary
 * actions from preconditions in order to reach the goal. If any of the operations fail
 * the function will throw.
 *
 * @param goal - the goal to seek
 * @param context - context to provide to the goal
 * @returns true if the goal has been met
 */
export async function seek<TContext = any, TState = any>(
	goal: Node<TContext, TState>,
	ctx: TContext,
): Promise<boolean> {
	// Evaluate operations and combinations first
	if (Operation.is(goal)) {
		switch (goal.op) {
			case 'and':
				return goal.nodes.reduce(
					(promise, node) =>
						// Terminate the chain when the first link fails
						promise.then((success) => success && seek(node, ctx)),
					Promise.resolve(true),
				);
			case 'or':
				return goal.nodes.reduce(
					(promise, node) =>
						// Terminate the chain  when the first link succeeds
						promise
							.then((success) => success || seek(node, ctx))
							// TODO: what to do with this error
							.catch(() => seek(node, ctx)),
					Promise.resolve(false),
				);
			case 'all':
				return (
					(await Promise.all(goal.nodes.map((node) => seek(node, ctx)))).filter(
						(r) => !r,
					).length === 0
				);
			case 'any':
				return (
					// At least one of the goals need to be fulfilled and return true
					(
						await Promise.allSettled(goal.nodes.map((node) => seek(node, ctx)))
					).filter((r) => r.status === 'fulfilled' && r.value).length > 0
				);
			default:
				return false;
		}
	}

	const description = Described.is(goal)
		? goal.description(ctx)
		: 'anonymous goal';
	if (Testable.is(goal)) {
		const hasGoalBeenMet = (c: TContext) =>
			goal
				.state(c)
				.then((s) => goal.test(c, s))
				.catch((e) => {
					if (e instanceof StateNotFound) {
						return false;
					}
					throw e;
				});

		console.log(`${description}: checking...`);
		if (await hasGoalBeenMet(ctx)) {
			console.log(`${description}: ready!`);
			// The goal has been met
			return true;
		}

		if (Actionable.is(goal)) {
			console.log(`${description}: not ready`);

			// Check if pre-conditions are met
			if (goal.requires) {
				console.log(`${description}: seeking preconditions...`);
				if (!(await seek(goal.requires, ctx))) {
					return false;
				}
				console.log(`${description}: preconditions met!`);
			}

			// Run the action. State may have changed after running the before
			// goals so get the state again. T
			// TODO: is there a way to know ahead of time
			// if seeking the before goal is expected to change the state? That would
			// avoid having to do this extra call to state
			const state = await goal.state(ctx).catch(() => undefined);
			console.log(`${description}: running the action...`);
			await goal.action(ctx, state);

			// Get the state again and run the test with the
			// new state. If the state could not be met, something
			// failed (reason is unknown at this point)
			if (!(await hasGoalBeenMet(ctx))) {
				console.log(`${description}: failed!`);
				return false;
			}

			// The goal is achieved.
			console.log(`${description}: ready!`);
			return true;
		}
	}

	// If we get here, then the test failed
	console.log(`${description}: failed!`);
	return false;
}
