// Goal descriptor
type GoalSpec<Context = any> = {
	// Goals that need to be achieved before the action for the current goal
	// can be run. These are only checked if the condition function returns false
	if?: Array<Goal<Context>>;

	// Condition function to verify that the goal has been reached. Other than the
	// id is the only required property. A goal with no action is just a condition
	test: (context: Context) => Promise<boolean>;

	// The try funtion will be run if the condition is false and all
	// the before goals have been achieved.
	// Running the action expects to make the next evaluation of the condition function
	// return `true` (although it is not guaranteed)
	try?: (context: Context) => any;

	// Set of goals that need to be achieved after the action is run
	// e.g. writing a file in the system requires a reboot for a configuration to apply
	// then a post-goal would be "boot-time > file-mtimem"
	after?: Array<Goal<Context>>;
};

// A Goal is function that will try to do something and will return true
// if the goal is achieved or false if the goal could not be achieved. It may
// return an error
// TODO: this might be a good place to return an Either
export type Goal<Context = any> = (context: Context) => Promise<boolean>;

export function Goal<Context = any>(
	test: (context: Context) => Promise<boolean>,
) {
	const GoalBuilder = (goal: GoalSpec<Context>) => ({
		try: (action: (context: Context) => Promise<any>) =>
			GoalBuilder({ ...goal, try: action }),

		if: (before: Goal<Context>) =>
			GoalBuilder({ ...goal, if: [...(goal.if ?? []), before] }),

		after: (after: Goal<Context>) =>
			GoalBuilder({ ...goal, after: [...(goal.after ?? []), after] }),

		/**
		 * The ready function creates the goal
		 */
		ready: (): Goal<Context> => async (context: Context) => {
			// Test the goal first
			if (await goal.test(context)) {
				return true;
			}

			if (goal.if) {
				const preConditionsMissing =
					(await Promise.all(goal.if.map((g) => g(context)))).filter((r) => !r)
						.length > 0;
				if (preConditionsMissing) {
					// Cannot try the goal action since some preconditions are not met
					return false;
				}
			}

			// If the goal has not been achieved yet and all preconditions have
			// been met
			if (goal.try) {
				// Perform the local action
				await goal.try(context);
			}

			// Test the goal one more time and return that
			if (!(await goal.test(context))) {
				return false;
			}

			// If there are any post conditions check that all post-conditions are
			// achieved
			if (goal.after) {
				return (
					(await Promise.all(goal.after.map((g) => g(context)))).filter(
						(r) => !r,
					).length > 0
				);
			}

			return true;
		},
	});

	return GoalBuilder({ test });
}
