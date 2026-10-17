#!/usr/bin/env node

/**
 * Chat On Steroids entry point.
 *
 * The normal dist/index.js remains compatible with existing direct MCP clients.
 * CoS uses this wrapper so public mutating tools fail closed unless they are
 * dispatched through the embedded durable Guard facade.
 */
process.env.PHOTOSHOP_GUARD_MODE ??= 'required';

// The ordinary COS Plugins transport does not expose a trustworthy Stop
// authority. Do not require an experimental, fork-only COS endpoint to paint.
// Guard, preflight and PaintPilot's own execution cancellation remain separate.

await import('./index.js');

export {};
