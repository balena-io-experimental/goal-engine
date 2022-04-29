# Goal Engine

This is an proof-of-concept framework for creating goal driven systems in typescript. Instead of
prescribing an execution path, this type of system defines a set of goals that can be achieved, and
the engine decides, based on a given target, on the best path to achieve the goal.

A goal is specified by

- a test function, which determines if the goal has been met, e.g. has file X been downlaoded
- an optional action, providing a mechanism to achieve the goal, e.g. download file X
- an optional set of pre-conditions, or "before goals" that need to be met before trying the action. e.g. does the target directory for file X exist? Are there at least Y bytes of disk available to download file X?.
- an optional set of post-conditions, or "after goals". e.g. is a reboot necessary to apply a configuration

Using this definition it is easy to see that goals in the system provide a graph, allowing the engine to calculate
paths to achieve one or more target goals. This way of describing goals also allows for easy extensibility,
as goals are not required to be "actionable" (only the test is required), but may become actionable if the system
requires the extra complexity. For instance, the goal of "there are at least Y bytes of disk available to download file X", could
become actionable by adding a mechanism to free-up disk space.

As a proof of concept, this implementation only provides a naive evaluation algorithm, described as follows

**Seek goal X**

1. Run goal X test. If the test succeeds, then the goal has already been achieved
2. Otherwise, seek all the "before goals", if one cannot be met, terminate as goal X cannot be met.
3. If all the pre-conditions have been met, run the action. Terminate if the action fails.
4. If the action suceeds, test the goal again. If the test fails terminate as the goal cannot be met.
5. If the test succeeds, seek all after goals. If all after goals have been met, the goal has been achieved.

A more advanced algorithm may optimize the order of evaluation of the goals, cache goal results where the state of the system is not
expected to change, etc.

## Example

See directory `example/` for some sample code on how to use. Running

```
npm install && npm run example
```

Runs the example (requires docker installed);
