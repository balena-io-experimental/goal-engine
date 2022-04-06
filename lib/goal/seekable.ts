import { State } from './state';
import { Test } from './test';
import { Action } from './action';

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
	readonly before?: Seekable<TContext>;

	// Requirements that need to be met after entering the state
	readonly after?: Seekable<TContext>;
}

export const isSeekable = (x: unknown): x is Seekable =>
	x != null &&
	typeof (x as Seekable).state === 'function' &&
	typeof (x as Seekable).test === 'function' &&
	typeof (x as Seekable).action === 'function' &&
	isSeekable((x as Seekable).before) &&
	isSeekable((x as Seekable).after);
