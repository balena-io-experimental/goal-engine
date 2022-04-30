export interface StatusError extends Error {
	statusCode: number;
}

export function isStatusError(x: unknown): x is StatusError {
	return x instanceof Error && Number.isInteger((x as any).statusCode);
}
