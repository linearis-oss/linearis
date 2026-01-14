/**
 * Export all GraphQL queries and fragments
 * 
 * This barrel export provides access to all GraphQL queries and
 * fragments from a single entry point. Includes common fragments,
 * issue queries, and optimized batch resolution queries.
 * 
 * Structure:
 * - common.js: Reusable fragments for consistent data structures
 * - issues.js: Optimized queries for issue operations
 */

// Common fragments for reusable field selections
export * from "./common.js";

// Optimized queries for issue CRUD operations and batch resolution
export * from "./issues.js";

// Document queries and mutations
export * from "./documents.js";

// Attachment queries and mutations
export * from "./attachments.js";

// Project queries and mutations
export * from "./projects.js";
