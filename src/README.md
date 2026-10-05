# Chrona Scheduler source

The source of the Chrona Scheduler control in release 0.1.24. To use the scheduler, install the managed solution from the [releases](https://github.com/konfigure8/chrona-scheduler/releases); you do not need to build it.

| Folder | What it holds |
| --- | --- |
| `pcf/ChronaSchedulerControl` | The Power Apps component framework (PCF) control: the manifest, the Dataverse binding and the strings for each language |
| `packages/scheduler-ui` | The scheduler the control shows: the layouts, drag and drop, collision detection, Optimize and the review |

## Build

You need Node.js 22 or later and pnpm 10.

```bash
pnpm install
pnpm run build
pnpm run test
```

`pnpm run build` builds the package, then the control into `pcf/ChronaSchedulerControl/out/controls`. `pnpm run build:production` makes the minified bundle that the release ships.

## Licence

[PolyForm Shield 1.0.0](https://github.com/konfigure8/chrona-scheduler/blob/main/LICENSE.md): use, change and share this code for any purpose except a product that competes with Chrona.

Required Notice: Copyright Konfigure8 Pty Ltd (https://chrona365.com)

## Questions and changes

This folder is a copy of the source at each release, so pull requests cannot be merged here. Report a problem in [issues](https://github.com/konfigure8/chrona-scheduler/issues/new/choose) and share an idea in [discussions](https://github.com/konfigure8/chrona-scheduler/discussions).
