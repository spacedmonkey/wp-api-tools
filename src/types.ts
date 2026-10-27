export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | string;

export type CrudVerb = 'list' | 'get' | 'create' | 'update' | 'delete';

export interface WpArgSchema {
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object' | string;
  required?: boolean;
  default?: unknown;
  enum?: (string | number)[];
  description?: string;
}

export interface EndpointVariant {
  methods: HttpMethod[];
  args: Record<string, WpArgSchema>;
}

export interface RouteInfo {
  path: string;
  namespace: string;
  methods: HttpMethod[];
  endpoints: EndpointVariant[];
}

export interface ResourceAction {
  verb: CrudVerb;
  method: HttpMethod;
  route: RouteInfo;
}

export interface Resource {
  namespace: string;
  key: string;
  actions: ResourceAction[];
}

export interface RequestConfig {
  method: HttpMethod;
  url: URL;
  headers: Record<string, string>;
  body?: unknown;
}

export interface WpErrorResponse {
  code: string;
  message: string;
  data?: { status?: number; [key: string]: unknown };
}

export interface WpIndexRoute {
  namespace: string;
  methods: HttpMethod[];
  endpoints: EndpointVariant[];
}

export interface WpIndexResponse {
  name?: string;
  description?: string;
  routes: Record<string, WpIndexRoute>;
}

export interface PaginationInfo {
  total: number | null;
  totalPages: number | null;
  currentPage: number;
}

export type OutputFormat = 'table' | 'json' | 'yaml';

export type AuthCredentials =
  | { type: 'basic'; username: string; password: string }
  | { type: 'bearer'; token: string };
