export type CatalogName = 'data' | 'task' | 'commercial';
export type SchemaName = 'company' | 'organization' | 'family-office' | 'institutional-investor' | 'person' | 'fund' | 'transaction' | 'relationship' | 'commitment' | 'event' | 'evidence' | 'task-result';
export type DocumentName = 'developers' | 'pricing' | 'methodology' | 'coverage' | 'platform' | 'ai' | 'agents' | 'auth';
export type ResourceName = `catalog:${CatalogName}` | `schema:${SchemaName}` | `document:${DocumentName}` | 'openapi';
export type JsonObject = { [key: string]: unknown };
export type ReadOptions = { etag?: string; signal?: AbortSignal };
export type PublicResponse<T> = { url: string; etag: string | null; lastModified: string | null; cacheControl: string | null; environment?: 'production' | 'sandbox'; rateLimit?: { limit: string | null; remaining: string | null; resetSeconds: string | null } } & ({ status: 200; data: T } | { status: 304; data: null });
export type ProfileSummary = { slug: string; name: string; url: string; type?: string; location?: string };
export type ProfileSearch = { query: string; results: ProfileSummary[]; citations: { title: string; url: string }[]; pagination: { limit: number; returned: number; hasMore: boolean; nextCursor: string | null; windowLimit: 10 }; scope: string };
export type ProfileRead = { profile: ProfileSummary & { description?: string; yearFounded?: number; pageUpdatedAt?: string }; citations: { title: string; url: string }[]; dateMeaning: string };
export declare const resources: Readonly<Record<ResourceName, string>>;
export declare class AltssHttpError extends Error { readonly status: number; readonly retryAfter: string | null; constructor(status: number, retryAfter?: string | null); }
export declare class AltssPublicClient {
  constructor(options?: { timeoutMs?: number; fetch?: typeof fetch; sandbox?: boolean });
  searchProfiles(query: string, options?: { limit?: number; cursor?: string; signal?: AbortSignal }): Promise<PublicResponse<ProfileSearch>>;
  getProfile(slug: string, options?: { signal?: AbortSignal }): Promise<PublicResponse<ProfileRead>>;
  getCatalog(name: CatalogName, options?: ReadOptions): Promise<PublicResponse<JsonObject>>;
  getSchema(name: SchemaName, options?: ReadOptions): Promise<PublicResponse<JsonObject>>;
  getDocument(name: DocumentName, options?: ReadOptions): Promise<PublicResponse<string>>;
  read<R extends ResourceName>(resource: R, options?: ReadOptions): Promise<PublicResponse<R extends `document:${DocumentName}` ? string : JsonObject>>;
}
