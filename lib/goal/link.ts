import { Seekable, isSeekable } from './seekable';

export const Combinators = ['tuple', 'dict'] as const;
export type Combinator = typeof Combinators[number];

export const Operators = ['and', 'or', 'any', 'all'] as const;
export type Operator = typeof Operators[number];

export const Types = [...Combinators, ...Operators];
export type Type = Combinator | Operator;

export interface Link<TContext = any, TState = any>
	extends Seekable<TContext, TState> {
	readonly type: Type;
	readonly goals: Array<Seekable<TContext>>;
}

export function isLink(x: unknown): x is Link {
	return (
		isSeekable(x) &&
		Types.includes((x as Link).type) &&
		// TODO: should we recursively validate the link goals?
		Array.isArray((x as Link).goals)
	);
}
