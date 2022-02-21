import { expect } from 'testing';
import { promises as fs } from 'fs';
import * as path from 'path';

import { Goal } from './goal';
import * as mockfs from 'mock-fs';

describe('Goal', function () {
	// Simple goal for a directory to exist
	const DirectoryExists = Goal(({ directory }) =>
		fs
			.access(directory)
			.then(() => true)
			.catch(() => false),
	)
		.try(({ directory }) => fs.mkdir(directory, { recursive: true }))
		.ready();

	// LockAcquired is achieved if the file exists and we have ownership of the lock
	const LockAcquired = Goal(
		({
			directory,
			uid = process.getuid(),
		}: {
			directory: string;
			uid?: number;
		}) =>
			Promise.all(
				['updates.lock']
					.map((f) => path.join(directory, f))
					.map((f) =>
						fs
							.access(f)
							.then(() => true)
							.then(() => fs.stat(f))
							.then((stat) => stat.uid === uid),
					),
			)
				.then((res) => res.filter((r) => !r).length === 0)
				.catch(() => false),
	)
		.try(({ directory }) =>
			// Try to take the lock (the test just uses touch, but )
			// TODO: what if multiple goals are trying to take the lock at the same time?
			// What if the goal that takes the lock releases it before the other goals are finished
			Promise.all(
				['updates.lock']
					.map((f) => path.join(directory, f))
					.map((f) => fs.open(f, 'w').then((fd) => fd.close())),
			),
		)
		.if(({ directory }) => DirectoryExists({ directory }))
		.ready();

	it('seeking the goal should do nothing if the goal has already been achieved', async function () {
		mockfs({ '/tmp': { 'updates.lock': '' } });

		await expect(LockAcquired({ directory: '/tmp' })).to.eventually.be.true;
		await expect(fs.access('/tmp/updates.lock')).to.not.be.rejected;

		mockfs.restore();
	});

	it('seeking the goal should try the given action if the goal has not been achieved', async function () {
		mockfs({ '/tmp': {} });

		await expect(LockAcquired({ directory: '/tmp' })).to.eventually.be.true;
		await expect(fs.access('/tmp/updates.lock')).to.not.be.rejected;

		mockfs.restore();
	});

	it('seeking the goal should try the before goals before peforming the given action', async function () {
		mockfs({ '/tmp': {} });

		await expect(LockAcquired({ directory: '/tmp/service-locks' })).to
			.eventually.be.true;
		await expect(fs.access('/tmp/service-locks/updates.lock')).to.not.be
			.rejected;

		mockfs.restore();
	});
});
