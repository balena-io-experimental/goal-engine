import { ServiceIsRunning } from './service';
import * as Docker from 'dockerode';

const docker = new Docker();

(async () => {
	// Try to reach the goal
	await ServiceIsRunning.seek({
		appName: 'my-project',
		serviceName: 'main',
		serviceImage: 'alpine:latest',
		cmd: ['sleep', '10'],
		docker,
	});
})();
