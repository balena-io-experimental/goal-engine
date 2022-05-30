import { Goal, StateNotFound } from '~/lib';
import { promises as fs } from 'fs';

const FileExists = Goal.of({
	state: (filePath: string) =>
		fs
			.access(filePath)
			.catch(() => false)
			.then(() => true),
	test: (_: string, exists: boolean) => exists,
	action: (filePath: string) => fs.open(filePath, 'w').then((fd) => fd.close()),
});

type LogContext = {
	configPath: string;
	level: 'info' | 'error';
};

const LogLevel = Goal.of({
	state: ({ configPath }: LogContext) =>
		fs.readFile(configPath, { encoding: 'utf8' }).catch((e) => {
			throw new StateNotFound(`Configuration file not found: ${configPath}`, e);
		}),
	test: ({ level }: LogContext, contents: string) =>
		contents
			.split(/\r?\n/)
			// Look for a line with the given level
			.some((line) => new RegExp(`loglevel=${level}`).test(line)),
	action: ({ configPath, level }: LogContext, contents = '') =>
		fs.writeFile(
			configPath,
			contents
				.split(/\r?\n/)
				// Remove any lines with log configuration
				.filter(
					(line) =>
						line.trim().length > 0 && !new RegExp(`loglevel=.+`).test(line),
				)
				// Add the new configuration line
				.concat(`loglevel=${level}`)
				// Join the file lines again
				.join('\n'),
			'utf8',
		),
	// FileExists.map creates a new goal that receives a LogContext as input
	// we need to use map so the expected inputs match
	before: FileExists.map(({ configPath }: LogContext) => configPath),
});

(async () => {
	// Try to reach the goal
	await LogLevel.seek({
		configPath: '/tmp/dummy.conf',
		level: 'info',
	});
})();
