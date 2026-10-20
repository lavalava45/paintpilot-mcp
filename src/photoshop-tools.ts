#!/usr/bin/env node

/** PaintPilot Photoshop Tools: direct MCP-to-UXP command dispatch. */
process.env.PHOTOSHOP_GUARD_MODE = 'off';

await import('./index.js');

export {};
