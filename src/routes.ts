import type { CrudVerb, EndpointVariant, HttpMethod, Resource, RouteInfo, WpIndexResponse } from './types.js';
import { DiscoveryError } from './errors.js';

const PARAM_RE = /\(\?P<([a-zA-Z_][a-zA-Z0-9_]*)>([^)]*)\)/g;

export function normalizeRoutes(index: WpIndexResponse): RouteInfo[] {
  const entries = Object.entries(index.routes ?? {});
  if (entries.length === 0) {
    throw new DiscoveryError('The REST API index has no registered routes.');
  }
  return entries
    .map(([path, route]) => ({
      path,
      namespace: route.namespace,
      methods: [...new Set(route.endpoints.flatMap((e) => e.methods))],
      endpoints: route.endpoints,
    }))
    // The bare namespace index routes (e.g. "/wp/v2") aren't useful to browse/call.
    .filter((route) => route.path !== '/' && route.path !== `/${route.namespace}`)
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function extractPathParams(path: string): string[] {
  const names: string[] = [];
  for (const match of path.matchAll(PARAM_RE)) {
    names.push(match[1]!);
  }
  return names;
}

export function isNumericParam(path: string, name: string): boolean {
  for (const match of path.matchAll(PARAM_RE)) {
    if (match[1] === name) {
      const pattern = match[2] ?? '';
      return /^\\d\+?$|^\[\\d\]\+?$|^\[0-9\]\+?$/.test(pattern.trim());
    }
  }
  return false;
}

export function renderPath(path: string, values: Record<string, string>): string {
  return path.replace(PARAM_RE, (_full, name: string) => encodeURIComponent(values[name] ?? ''));
}

export function friendlyPath(path: string): string {
  return path.replace(PARAM_RE, (_full, name: string) => `:${name}`);
}

export function verbForMethod(method: HttpMethod, path: string): CrudVerb {
  switch (method) {
    case 'GET':
      return extractPathParams(path).length > 0 ? 'get' : 'list';
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return 'get';
  }
}

export function findVariantForMethod(
  route: RouteInfo,
  method: HttpMethod
): EndpointVariant | undefined {
  return route.endpoints.find((e) => e.methods.includes(method));
}

/**
 * The literal (non-dynamic) segments of a route's path, relative to its
 * namespace — used as the key that groups a collection route (e.g.
 * "/wp/v2/posts") together with its :id variant ("/wp/v2/posts/(?P<id>...)")
 * into a single browsable resource.
 */
export function resourceSkeleton(route: RouteInfo): string {
  const prefix = `/${route.namespace}`;
  const rest = route.path.startsWith(prefix) ? route.path.slice(prefix.length) : route.path;
  return rest
    .split('/')
    .filter((segment) => segment.length > 0 && !segment.startsWith('(?P<'))
    .join('/');
}

export function groupResources(routes: RouteInfo[]): Resource[] {
  const byKey = new Map<string, Resource>();
  for (const route of routes) {
    const key = resourceSkeleton(route);
    const mapKey = `${route.namespace}::${key}`;
    let resource = byKey.get(mapKey);
    if (!resource) {
      resource = { namespace: route.namespace, key, actions: [] };
      byKey.set(mapKey, resource);
    }
    for (const method of route.methods) {
      const verb = verbForMethod(method, route.path);
      if (!resource.actions.some((a) => a.verb === verb)) {
        resource.actions.push({ verb, method, route });
      }
    }
  }
  return [...byKey.values()].sort((a, b) =>
    `${a.namespace}/${a.key}`.localeCompare(`${b.namespace}/${b.key}`)
  );
}

export function namespacesOf(routes: RouteInfo[]): string[] {
  return [...new Set(routes.map((r) => r.namespace))].sort();
}

export function resourcesForNamespace(resources: Resource[], namespace: string): Resource[] {
  return resources.filter((r) => r.namespace === namespace);
}
