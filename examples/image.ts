import { Goal, StateNotFound } from '~/lib';
import * as Docker from 'dockerode';

export interface ImageContext {
	readonly appName: string;
	readonly serviceName: string;
	readonly serviceImage: string;

	readonly docker: Docker;
}

export interface StatusError extends Error {
	statusCode: number;
}

export function isStatusError(x: unknown): x is StatusError {
	return x instanceof Error && Number.isInteger((x as any).statusCode);
}

export interface Image {
	readonly name: string;

	readonly imageId: string;
}

export const Image = async ({
	serviceImage,
	docker,
}: ImageContext): Promise<Image> => {
	try {
		const img = await docker.getImage(serviceImage).inspect();
		return {
			name: serviceImage,
			imageId: img.Id,
		};
	} catch (e) {
		if (isStatusError(e) && e.statusCode === 404) {
			throw new StateNotFound(`Image not found:  ${serviceImage}`, e);
		}
		throw e;
	}
};

export const ImageExists = Goal.describe(
	Goal.of({
		state: Image,
		test: (_: ImageContext, { imageId }) => !!imageId,
		action: ({ serviceImage, docker }: ImageContext) =>
			new Promise((resolve, reject) =>
				docker
					.pull(serviceImage)
					.catch(reject)
					.then((stream) => {
						stream.on('data', () => void 0);
						stream.on('error', reject);
						stream.on('close', resolve);
						stream.on('finish', resolve);
					}),
			),
	}),
	({ appName, serviceName }) =>
		`Image for service ${appName}.${serviceName} should exist`,
);
