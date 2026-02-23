# beam-backend-v1

A simple Express API boilerplate with authentication support.

## Environment Variables

Make sure to create a `.env` file at the project root with the following values:

```
PORT=3000
MONGO_URI=mongodb://localhost:27017/beam
JWT_SECRET=your_secret_here
```

## Authentication Endpoints

The API provides simple JWT-based authentication:

- `POST /api/auth/register` – create a new user (`username`, `email`, `password`).
- `POST /api/auth/login` – obtain a JWT (`email`, `password`).

Use the returned token in an `Authorization: Bearer <token>` header for protected routes such as `GET /api/profile`.

## Getting Started

Install dependencies:

```sh
pnpm install
```

Run in development:

```sh
pnpm run dev
```

### API Documentation 📄

Frontend developers can access live API docs rendered with Swagger UI at:

```
http://localhost:3000/docs/api
```

The documentation is generated from JSDoc comments in the route files and will
keep track of all registered endpoints, request/response schemas, and any
security requirements. Feel free to open `docs/api/swagger.js` to tweak the
spec or add more tags/descriptions as the project grows.
