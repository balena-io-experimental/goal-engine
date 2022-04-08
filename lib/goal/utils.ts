/**
 * Utility function to work with Object keys
 */
export const keys = <T>(obj: T) => Object.keys(obj) as Array<keyof T>;

export const values = <T>(obj: T) => Object.values(obj) as Array<T[keyof T]>;
