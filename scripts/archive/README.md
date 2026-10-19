# Historical diagnostic scripts

These scripts were originally standalone, manually invoked diagnostics. They
are not registered as package scripts, used by the current test suite, or part
of the supported Photoshop MCP entrypoints. They were moved here during
repository cleanup to preserve the investigation history without presenting
them alongside maintained commands.

- `editable-atmosphere-live-evidence.mjs`
- `task19-live-vmp-cache-evidence.mjs`
- `test-preview-pipeline.mjs`

The working directory and active Photoshop document may matter for live tests;
do not assume archival scripts are safe or supported to run against an active
painting session. Maintained tests and tools remain in their original folders.
