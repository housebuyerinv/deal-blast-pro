export const excludedProjects: Set<string>;
export function syntheticProject(ref: string): string;
export function bindNetlifyOrigin(env: Record<string, string | undefined>, context: unknown): string;
export function netlifyStagingOrigin(env: Record<string, string | undefined>): string;
export function netlifyProfile(env: Record<string, string | undefined>, context: unknown, now?: number): {origin: string; supabase: string; end: number; project: string};
