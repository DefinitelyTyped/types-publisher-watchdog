## Is types-publisher working right now?

If the badge below is green, then no PR has gone unpublished for more
than 10,000 seconds (about 2.5 hours)::

[![Build Status](https://dev.azure.com/definitelytyped/DefinitelyTyped/_apis/build/status/DefinitelyTyped.types-publisher-watchdog)](https://dev.azure.com/definitelytyped/DefinitelyTyped/_build?definitionId=5)

## What is it?

types-publisher-watchdog reports how long it takes for types-publisher
to publish packages to `@types` once a PR has been merged on
Definitely Typed. Currently it prints the results to the terminal, but
the intent is for it to run as a real watchdog that can issue alerts
to the Typescript team members who work on Definitely Typed.

The watchdog pays attention to two kinds of data from DefinitelyTyped
PRs: the date and the filenames. It could also use the declared
version number from the header, but does not currently.

## How it works

1. Find the 30 most recently updated DefinitelyTyped PRs, and the 30
   most recently opened, of those that are merged.
2. Record the merge time of each PR, remembering to dedupe multiple
   PRs to the same package.
3. Find the publish time of each corresponding `@types` package.
4. If the publish time is before the merge time, record the difference
   between the merge time and current time.
5. Find the longest time from step (4) of all the recorded PRs.
6. `npm run check` fails if the longest time is over 10,000 seconds,
   about 2.5 hours.

## Limitations

The watchdog is simple, and probably shouldn't get much more complex
so that it doesn't end up with bugs. Currently, it only looks at
changed file *names* from the PR, not file contents. And it only looks
at files that changed at the top-level of a package. That means that
updates to old versions are skipped. It also means that I don't
inspect the DefinitelyTyped header so I can compare the npm version. I
just assume that npm's latest matches the change. I think this is
usually true, but it may not be.
