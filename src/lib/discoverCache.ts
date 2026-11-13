/**
 * Generation counter for Discover's short-lived candidate cache (src/lib/discover.ts). Bumping it makes every
 * cached list stale, so a newly finished profile shows up for others straight away. Kept in its own module so
 * sign-up code can call it without importing Discover.
 */
let generation = 0;
export const discoverGeneration = () => generation;
export function invalidateDiscover() { generation++; }
