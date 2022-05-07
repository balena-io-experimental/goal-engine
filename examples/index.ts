import { ServiceIsRunning } from './service';
import * as Docker from 'dockerode';

const docker = new Docker();

(async () => {
	// Try to reach the goal
	await ServiceIsRunning.seek({
		appName: 'my-project',
		serviceName: 'main',
		serviceImage: 'alpine:latest',
		cmd: ['sleep', 'infinity'],
		docker,
	});
})();

const FileExists = Goal.of({
	state: (filePath: string) =>
		fs
			.access(filePath)
			.catch(() => false)
			.then(() => true),
	test: (_: string, exists: boolean) => exists,
	action: (filePath: string) => fs.open(filePath, 'w').then((fd) => fd.close()),
});
