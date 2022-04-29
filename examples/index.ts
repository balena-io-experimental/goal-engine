import { ServiceIsRunning } from './service';
import * as Docker from 'dockerode';

const docker = new Docker();

(async () => {
	await ServiceIsRunning.seek({
		appName: 'my-project',
		serviceName: 'main',
		serviceImage: 'alpine:latest',
		cmd: ['sleep', 'infinity'],
		docker,
	});
})();
