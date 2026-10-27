import { extractPathParams, friendlyPath, groupResources, namespacesOf } from './routes.js';
import type { ResourceAction, RouteInfo, WpArgSchema } from './types.js';

export interface SchemaAction {
  verb: string;
  method: string;
  path: string;
  pathParams: string[];
  args: Record<string, WpArgSchema>;
}

export interface SchemaResource {
  namespace: string;
  resource: string;
  actions: SchemaAction[];
}

export interface ApiSchema {
  site: string;
  apiRoot: string;
  namespaces: string[];
  resources: SchemaResource[];
}

export function buildApiSchema(routes: RouteInfo[], apiRoot: string, site: string): ApiSchema {
  const resources = groupResources(routes);
  return {
    site,
    apiRoot,
    namespaces: namespacesOf(routes),
    resources: resources.map((resource) => ({
      namespace: resource.namespace,
      resource: resource.key || '/',
      actions: resource.actions.map(toSchemaAction),
    })),
  };
}

function toSchemaAction(action: ResourceAction): SchemaAction {
  const variant = action.route.endpoints.find((e) => e.methods.includes(action.method));
  return {
    verb: action.verb,
    method: action.method,
    path: friendlyPath(action.route.path),
    pathParams: extractPathParams(action.route.path),
    args: variant?.args ?? {},
  };
}
