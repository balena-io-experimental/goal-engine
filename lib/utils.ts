/**
 * Utility function to work with Object keys
 */
export const keys = <T>(obj: T) => Object.keys(obj) as Array<keyof T>;

export const values = <T>(obj: T) => Object.values(obj) as Array<T[keyof T]>;

// Utility type to intersect the types of a tuple
export type IntersectTuple<T extends any[] = []> = T extends [
	infer U,
	...infer TTail,
]
	? TTail extends []
		? U
		: U & IntersectTuple<TTail>
	: never;
