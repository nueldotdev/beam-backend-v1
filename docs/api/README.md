# API Documentation

This directory contains the configuration for the Swagger/OpenAPI docs that are
served by the backend at `/docs/api`.

- **swagger.js** – builds the OpenAPI specification by scanning JSDoc comments
  in source files (see `apis` option).

## Adding new endpoints

1. Add a new route (or controller) as usual.
2. Document the route using `@swagger` JSDoc comments. Examples are provided in
   `routes/auth.js` and `src/index.js`.
3. The documentation will automatically update when the server restarts.

## Customizing the spec

Modify `docs/api/swagger.js` to change information such as API title, version,
servers, components, or to include additional files for scanning.

Front‑end developers can simply navigate to

```
http://localhost:3000/docs/api
```

to see a human‑friendly, interactive listing of all endpoints, schemas, and
authorization requirements.
