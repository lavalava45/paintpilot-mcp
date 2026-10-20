#!/usr/bin/env node

/** PaintPilot Painting Mode: require Guard for every public mutation. */
process.env.PHOTOSHOP_GUARD_MODE = 'required';

await import('./index.js');

export {};
