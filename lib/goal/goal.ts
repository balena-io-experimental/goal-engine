// Utility type to make some properties of a type optional
type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// A state is a function that reads some asynchronous state
export type State<TContext = any, TState = any> = (
	c: TContext,
) => Promise<TState>;

// A test checks checks a piece of test against a condition
type Test<TContext = any, TState = any> = (c: TContext, s: TState) => boolean;

// An action perfors an asynchronouse operation based on a given
// context and some current state
type Action<TContext = any, TState = any> = (
	c: TContext,
	s: TState,
) => Promise<unknown>;

export interface Seekable<TContext = any, TState = any> {
	// How to read the state
	readonly state: State<TContext, TState>;

	// How to test if the state matches the goal that we are seeking
	readonly test: Test<TContext, TState>;

	// If the goal has not been met, the action should let us reach the
	// goal given that all pre-conditions (or before-goals) are met
	readonly action: Action<TContext, TState>;

	// Requirements that need to be before entering the state
	// through the action
	readonly before: Array<Seekable<TContext>>;

	// Requirements that need to be met after entering the state
	readonly after: Array<Seekable<TContext>>;

	// TODO: should we add `always`, as invariants that need to be met both
	// before and after?
}

// This is the interface users will most likely operate with
export interface Goal<TContext = any, TState = any>
	extends Seekable<TContext, TState> {
	map<TInputContext>(
		f: (c: TInputContext) => TContext,
	): Goal<TInputContext, TState>;
	seek(c: TContext): Promise<boolean>;
}

/**
 * Create a goal from a given Seekable interface
 */
export function of<TContext = any, TState = any>({
	state,
	test,
	action = () => Promise.resolve(void 0),
	before = [],
	after = [],
}: WithOptional<
	Seekable<TContext, TState>,
	'action' | 'before' | 'after'
>): Goal<TContext, TState> {
	const goal = {
		state,
		test,
		action,
		before,
		after,
		map<TInputContext>(
			f: (c: TInputContext) => TContext,
		): Goal<TInputContext, TState> {
			return map(goal, f);
		},
		seek(c: TContext): Promise<boolean> {
			return seek(goal, c);
		},
	};

	return goal;
}

/**
 * Transform a goal that receives a context A  into a goal that receives
 * a context B by applying a transformation function
 */
export function map<TContext = any, TState = any, TInputContext = any>(
	g: Seekable<TContext, TState>,
	f: (c: TInputContext) => TContext,
): Goal<TInputContext, TState> {
	return of({
		state: (c: TInputContext) => g.state(f(c)),
		test: (c: TInputContext, s: TState) => g.test(f(c), s),
		action: (c: TInputContext, s: TState) => g.action(f(c), s),
	});
}

/**
 * Try to reach the goal given an initial context
 */
export async function seek<TContext = any, TState = any>(
	goal: Seekable<TContext, TState>,
	ctx: TContext,

	// TODO: use TaskEither<Error, boolean> as the re
): Promise<boolean> {
	const s = await goal.state(ctx);
	if (goal.test(ctx, s)) {
		// The goal has been met
		return true;
	}

	// Test the before goals. By default they will be
	// tested in parallel
	// TODO: we need a way to specify goals that need to be run in sequence
	const preconditions = await Promise.all(goal.before.map((g) => seek(g, ctx)));
	if (preconditions.filter((met) => !met).length > 0) {
		// Cannot try the goal action since some preconditions are not met
		return false;
	}

	// Run the action
	await goal.action(ctx, s);

	// Get the state again and run the test with the
	// new state. If the state could not be met, something
	// failed (reason is unknown at this point)
	if (!goal.test(ctx, await goal.state(ctx))) {
		return false;
	}

	// The goal is achieved if the postconditions are met. Postconditions are tested
	// in parallel, but a sequence can be tested if
	const postconditions = await Promise.all(goal.after.map((g) => seek(g, ctx)));
	return postconditions.filter((met) => !met).length === 0;
}

// A goal builder is a helper interface to build a goal
export interface Builder<TContext = any, TState = any> {
	try(a: Action<TContext, TState>): Builder<TContext, TState>;
	before(b: Seekable<TContext>): Builder<TContext, TState>;
	after(a: Seekable<TContext>): Builder<TContext, TState>;
	create(): Goal<TContext, TState>;
}

// Build a goal builder. This is not exported as it's meant
// to be used with the `Goal` helper function
function Builder<TContext, TState>(
	goal: Seekable<TContext, TState>,
): Builder<TContext, TState> {
	return {
		try(action: Action<TContext, TState>) {
			return Builder({ ...goal, action });
		},
		before(g: Seekable<TContext>) {
			return Builder({ ...goal, before: [...goal.before, g] });
		},
		after(g: Seekable<TContext>) {
			return Builder({ ...goal, after: [...goal.after, g] });
		},
		create() {
			return of(goal);
		},
	};
}

/**
 * Helper function to create a goal
 * starting from a state and an optional test
 *
 * @example
 * // Does not need a test because the state is either true or false
 * const DirectoryExists = Goal(({ directory }) =>
 *    fs
 *      .access(directory)
 *      .then(() => true)
 *      .catch(() => false),
 *  )
 *  .create()
 */
export function Goal<TContext>(
	state: State<TContext, boolean>,
): Builder<TContext, boolean>;
export function Goal<TContext, TState>(
	state: State<TContext, TState>,
	test: Test<TContext, TState>,
): Builder<TContext, TState>;
export function Goal<TContext, TState>(
	state: State<TContext, TState>,
	test?: Test<TContext, TState>,
) {
	return Builder({
		state,
		// The default will only be used if TState is a boolean
		test: test || ((_: TContext, s: TState) => !!s),
		action: () => Promise.resolve(void 0),
		before: [],
		after: [],
	});
}

export const identity = <A>(a: A): A => a;
