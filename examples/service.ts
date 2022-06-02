import { Goal, StateNotFound } from '~/lib';
import * as Docker from 'dockerode';
import { ImageExists } from './image';

import { isStatusError } from './errors';

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
	readonly cmd: string[];
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
		const {
			Id: containerId,
			Created,
			State,
			Name: name,
			Config,
		} = serviceInspect;

		return {
			name,
			status: State.Status,
			containerId,
			createdAt: new Date(Created),
			cmd: Config.Cmd,
		};
	} catch (e: any) {
		if (isStatusError(e)) {
			throw new StateNotFound(
				`No service found for application '${appName}' and service '${serviceName}'.`,
				e,
			);
		}
		throw e;
	}
};

// compare current and target configurations
const isEqualConfig = (ctx: ServiceContext, svc: Service) =>
	ctx.cmd.length === svc.cmd.length &&
	ctx.cmd.every((v, i) => v === svc.cmd[i]);

export const ServiceIsStopped = Goal.describe(
	Goal.of({
		state: Service,
		test: (_: ServiceContext, { status }: Service) =>
			['stopped', 'exited', 'dead'].includes(status.toLowerCase()),
		// Getting the service could fail, as there are no preconditions
		// requiring the container to exist before, so we prepare for that by checking for undefined
		action: async ({ docker }: ServiceContext, s?: Service) => {
			if (s === undefined) {
				return;
			}

			try {
				await docker.getContainer(s.containerId).stop();
			} catch (e) {
				if (isStatusError(e) && [304, 404].includes(e.statusCode)) {
					return;
				}
				throw e;
			}
		},
	}),
	({ appName, serviceName }) => `${appName}.services.${serviceName}.is_stopped`,
);

export const ServiceContainerDoesNotExist = Goal.describe(
	Goal.of({
		state: async (ctx: ServiceContext) => {
			try {
				return await Service(ctx);
			} catch (e) {
				// If getting the state fails then the container does not
				// exist
				if (e instanceof StateNotFound) {
					return true;
				}
				throw e;
			}
		},
		test: (_: ServiceContext, s: Service | true) => s === true,
		action: async ({ docker }: ServiceContext, s: Service | true) => {
			// This should never happen
			if (s === true) {
				return;
			}

			try {
				await docker.getContainer(s.containerId).remove({ v: true });
			} catch (e) {
				if (isStatusError(e) && e.statusCode === 404) {
					// The container was already removed
					return;
				}
				throw e;
			}
		},
	}).requires(ServiceIsStopped),
	({ appName, serviceName }) =>
		`${appName}.services.${serviceName}.container_deleted`,
);

export const ServiceContainerExists = Goal.describe(
	Goal.of({
		state: Service,
		// If service exist but is dead, the test needs to fail as we cannot
		// start the container, and it needs to be deleted first
		test: (ctx: ServiceContext, svc: Service) =>
			svc.status !== 'dead' && isEqualConfig(ctx, svc),
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
	}).requires(
		Goal.and({
			ImageExists,
			ServiceContainerDoesNotExist,
		}),
	),
	({ appName, serviceName }) =>
		`${appName}.services.${serviceName}.container_exists`,
);

export const ServiceIsRunning = Goal.of({
	description: ({ appName, serviceName }) =>
		`${appName}.services.${serviceName}.is_running`,
	state: Service,
	test: (ctx: ServiceContext, svc: Service) =>
		svc.status === 'running' && isEqualConfig(ctx, svc),
})
	.action(({ docker }: ServiceContext, { containerId }: Service) =>
		docker.getContainer(containerId).start(),
	)
	.requires(ServiceContainerExists);
