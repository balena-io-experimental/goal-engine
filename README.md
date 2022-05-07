# Goal Engine (experimental, to be named)

A declarative toolkit for writing self-healing system agents.

This tool provides a library for creating control systems that need to operate with little to no feedback from a centralized control.
This is particularly useful in edge computing applications, where connectivity to the Internet may not be guaranteed, but system
operation needs to continue to function, and recover in the case of power outages and subsystem failures.

- **Fully declarative typescript API:** no need to write how the system will behave. Just declare the system goals and their dependencies and
  the library will figure out the best path between the current state of the system and a given target.
- **Integrated error management:** all operations failures are handled in a centralized way, the failing operation and the cause are communicated,
  and the overall execution is interrupted so it can be retried.
- **Monitor the state of the system:** as the declared system goals conform a graph, that makes it easy to observe state of the system and of the
  overall operation. Future improvements will make it easier to add a visualization layer for better observability.
- **Minimal dependencies:** the core library is mostly self contained and the API makes use of dependency injection for interaction with other systems.

## How does it work?

The unit of execution of the library is a `Goal`. A goal encodes a specific state of the underlying system that is desired. A goal is specified at minimum by

- a mechanism to get a piece of state, e.g. the directory contents,
- a way to test if the goal has been achieved, e.g. a given file exists in a directory.

Additionally a goal can be actionable, meaning it may specify a mechanism to reach the goal if it has not been met yet, e.g. create the file. Finally a goal may specify
dependencies, which are goals that need to be met before the goal action can be tried, e.g. target directory needs to allow write access.

Given a specific target goal, the runtime will backtrack from the target looking for unmet dependencies, and will try to seek those actionable dependencies
in order until the target is met.

Example:

```
import { Goal } from 'goal-engine';

const FileExists = Goal.of({
	state: (filePath: string) =>
		fs
			.access(filePath)
			.catch(() => false)
			.then(() => true),
	test: (_: string, exists: boolean) => exists,
	action: (filePath: string) => fs.open(filePath, 'w').then((fd) => fd.close()),
});

// This creates the file /tmp/hello if it doesn't exist
await FileExists.seek('/tmp/hello');
```

## Documentation

### State

TODO

### Test

### Action

TODO

### Pre-conditions

### Goal

#### Operations

#### Combinations

## Example

See directory `example/` for some sample code on how to use. Running

```
npm install && npm run example
```

Runs the example (requires docker installed);
