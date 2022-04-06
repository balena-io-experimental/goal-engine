import { Link } from './link';
import { Seekable } from './seekable';

import { State } from './state';
import { Test } from './test';
import { Action } from './action';

export type TupleStates<
	T extends Array<Seekable<TContext>>,
	TContext = any,
> = T extends [Seekable<TContext, infer TState>, ...infer TTail]
	? TTail extends Array<Seekable<TContext>>
		? [TState, ...TupleStates<TTail, TContext>]
		: [TState]
	: [];

/**
 * Combine an array of state objects into a state that returns a tuple of
 * results
 */
export const tuple = <
	TContext = any,
	TState = any,
	TTuple extends Array<Seekable<TContext>> = Array<Seekable<TContext>>,
>(
	goals: [Seekable<TContext, TState>, ...TTuple],
): Link<TContext, [TState, ...TupleStates<TTuple, TContext>]> => {
	const bgoals = goals.map((g) => g.before).filter((g) => !!g);
	const agoals = goals.map((g) => g.after).filter((g) => !!g);
	return {
		type: 'tuple',
		goals,
		state: State.of(goals.map((g) => g.state)) as State<
			TContext,
			[TState, ...TupleStates<TTuple, TContext>]
		>,
		test: Test.all(goals.map((g) => g.test)),
		action: Action.of(goals.map((g) => g.action)),
		before:
			bgoals.length > 1
				? // TODO: this should be an `all` operation instead of a tuple as we don't care about
				  // the combined state
				  tuple(bgoals as [Seekable<TContext>, ...Array<Seekable<TContext>>])
				: bgoals[0],
		after:
			agoals.length > 1
				? tuple(agoals as [Seekable<TContext>, ...Array<Seekable<TContext>>])
				: agoals[0],
	};
};
