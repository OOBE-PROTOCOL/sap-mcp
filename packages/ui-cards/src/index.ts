/**
 * @name ui/index
 * @description Public barrel for the SAP MCP Apps Card rendering boundary.
 *
 * Keep this module rendering-only. It must not import remote server, signer,
 * payment execution, or wallet side-effect code.
 *
 * @module ui/index
 */

export * from './card-builder.js';
export * from './card-shell.js';
export * from './card-templates.js';
export * from './protocol-logos.js';
export * from './runtime-logo-resolver.js';
export * from './tool-card-registry.js';
export * from './ui-resources.js';
