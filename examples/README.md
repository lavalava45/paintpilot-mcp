# MCP host examples

These examples point directly at this repository's built Windows stdio entry point:
`dist/index.js`. Replace `C:\\Tools\\photoshop-mcp-digital-painting` and, when needed,
`PHOTOSHOP_PATH` with local paths before use.

For Chat On Steroids, do not use these generic stdio examples. The canonical route is the
dedicated `dist/cos-plugin.js` entry point, which enables required embedded-Guard mode.

The configuration key `photoshop-digital-painting` is only a local MCP client label. It is not
an npm package or MCP Registry identifier.
