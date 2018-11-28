## Is types-publisher working right now?

If the badge below is green, then the average latency for the last 30
PRs is below 10,000
seconds:

[![Build Status](https://typescript.visualstudio.com/TypeScript/_apis/build/status/sandersn.types-publisher-watchdog)](https://typescript.visualstudio.com/TypeScript/_build/latest?definitionId=13)

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

1. Find the 30 most recently updated DefinitelyTyped PRs.
2. Record the merge time of each PR, remembering to dedupe multiple
   PRs to the same package.
3. Find the publish time of each corresponding `@types` package.
4. Compare the two times, using the current time if the package hasn't
   published yet.
5. Print the times, plus the average time across all packages.

Eventually, I'll add:

6. Raise an alert if the average time goes over some threshold &mdash;
probably an hour or two.

## Limitations

The watchdog is simple, and probably shouldn't get much more complex
so that it doesn't end up with bugs. Currently, it only looks at
changed file *names* from the PR, not file contents. And it only looks
at files that changed at the top-level of a package. That means that
updates to old versions are skipped. It also means that I don't
inspect the DefinitelyTyped header so I can compare the npm version. I
just assume that npm's latest matches the change. I think this is
usually true, but it may not be.


