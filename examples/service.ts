import { Goal, StateNotFound } from '~/lib';
import * as Docker from 'dockerode';
import { ImageExists } from './image';

export interface ServiceContext {
	readonly appName: string;
	readonly serviceName: string;
	readonly serviceImage: string;

	// Docker configurations
	readonly cmd: string[];

	// Additional dependencies to inject
	readonly docker: Docker;
}

export interface Service {
	readonly name: string;
	readonly status: string;
	readonly createdAt: Date;
	readonly containerId: string;
}

export const Service = async ({
	appName,
	serviceName,
	docker,
}: ServiceContext): Promise<Service> => {
	const services = await docker.listContainers({
		all: true,
		filters: {
			label: [
				`io.balena.app-name=${appName}`,
				`io.balena.service-name=${serviceName}`,
			],
		},
	});

	if (services.length === 0) {
		throw new StateNotFound(
			`No service found for application ${appName} and service ${serviceName}.`,
		);
	}

	const [svc] = services;

	try {
		const serviceInspect = await docker.getContainer(svc.Id).inspect();
		const { Id: containerId, Created, State, Name: name } = serviceInspect;

		return {
			name,
			status: State.Status,
			containerId,
			createdAt: new Date(Created),
		};
	} catch (e: any) {
		throw new StateNotFound(
			`No service found for application '${appName}' and service '${serviceName}'.`,
			e,
		);
	}
};

export const ServiceIsInstalled = Goal.describe(
	Goal.of({
		state: Service,
		// TODO; this test should also compare the current/target configurations
		test: (_: ServiceContext, { status }: Service) => status === 'created',
		action: async ({
			appName,
			cmd,
			serviceName,
			serviceImage,
			docker,
		}: ServiceContext) =>
			// Try to start the container
			docker.createContainer({
				name: `${appName}_${serviceName}`,
				Image: serviceImage,
				Cmd: cmd,
				Labels: {
					'io.balena.app-name': appName,
					'io.balena.service-name': serviceName,
				},
			}),
		before: ImageExists,
	}),
	({ appName, serviceName }) =>
		`Service container for ${appName}.${serviceName} should exist`,
);

export const ServiceIsRunning = Goal.describe(
	Goal.of({
		state: Service,
		// TODO; this test should also compare the current/target configurations
		test: (_: ServiceContext, { status }: Service) => status === 'running',
		action: ({ docker }: ServiceContext, { containerId }: Service) =>
			docker.getContainer(containerId).start(),
		before: ServiceIsInstalled,
	}),
	({ appName, serviceName }) =>
		`Service ${appName}.${serviceName} should be running`,
);
