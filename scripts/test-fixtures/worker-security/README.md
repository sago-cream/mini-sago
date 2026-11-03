# Production policy fixtures

These smoke-test fixtures match `sago-cream/sago-cloud` commit `56a25ac`, used by the
production MiniSago worker. Keep both repositories in sync when changing them.

- The seccomp profile is based on [Moby `seccomp/v0.2.1`'s default allowlist](https://github.com/moby/profiles/blob/seccomp/v0.2.1/seccomp/default.json),
  adding `clone`, `clone3`, `mount`, `pivot_root`, `setns`, `umount`, `umount2`,
  and `unshare` for Codex's nested Bubblewrap sandbox. Other syscall restrictions
  remain active; no extra container capabilities are granted.
- The AppArmor profile is derived from Docker's default container profile.
  It allows namespace/mount setup while retaining the `/proc` and `/sys`
  restrictions. It requires AppArmor 4 for `userns` support.

These profiles remain applicable to the restricted chat worker. T3 coding uses
its own environment's provider configuration; see [T3 coding](../../../docs/t3-coding.md).

Moby profiles are distributed under the [Apache 2.0 license](LICENSE.moby).
