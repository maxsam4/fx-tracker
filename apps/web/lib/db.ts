// Re-export the shared DB from @fx/core. The web tier uses it for read-only
// queries from server components and a few admin writes.
export * from '@fx/core/db';
