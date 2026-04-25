import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("login", "routes/login.tsx"),
  route("setup", "routes/setup.tsx"),
  layout("routes/_authenticated.tsx", [
    route("projects", "routes/_authenticated/projects.tsx"),
    route("projects/:id", "routes/_authenticated/projects.$id.tsx"),
  ]),
] satisfies RouteConfig;
