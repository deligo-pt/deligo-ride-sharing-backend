# 🚕 Deligo Ride-Sharing Backend

![Node.js](https://img.shields.io/badge/Node.js-18.x-green?style=flat-square&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict_Mode-blue?style=flat-square&logo=typescript)
![Express.js](https://img.shields.io/badge/Express.js-Framework-lightgray?style=flat-square&logo=express)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue?style=flat-square&logo=postgresql)
![Prisma](https://img.shields.io/badge/Prisma-ORM-teal?style=flat-square&logo=prisma)
![Zod](https://img.shields.io/badge/Zod-Validation-darkblue?style=flat-square)

The core backend microservice for the **Deligo Ride-Sharing** platform. Built for high scalability and rapid iteration, this service handles the ride-booking engine, vehicle registration, driver compliance (KYC), and user profiling. 

> **Note:** Deligo utilizes a microservices architecture, offloading identity and authentication to an external service to ensure this application remains lightweight and domain-focused.

---

## 📑 Table of Contents
- [System Architecture](#-system-architecture)
- [API Contract](#-api-contract)
- [Authentication Strategy](#-authentication-strategy-local-development)
- [Getting Started](#-getting-started)
- [Engineering Standards](#-engineering-standards)

---

## 🏗️ System Architecture

We strictly adhere to a **Domain-Driven, Layered Architecture**. This ensures a clear separation of concerns, making the codebase predictable, testable, and highly scalable.

### Module Structure
Each feature is encapsulated in its own module inside `src/modules/`, one folder per singular domain name. Files follow `<module>.<layer>.ts`:

```text
src/modules/
└── ride/
    ├── ride.route.ts        # Express endpoint definitions & middleware mapping
    ├── ride.controller.ts   # Request parsing, service invocation, and response formatting
    ├── ride.service.ts      # Core business logic and Prisma ORM data access
    └── ride.validation.ts   # Zod schemas for strict request body/query validation
```

All module routers are registered in one place, `src/routes/index.ts`, which `src/app.ts` mounts at `/api/v1`.

---

## 🔌 API Contract

To ensure seamless frontend and mobile integration, all API endpoints must adhere to a strict, predictable JSON response format.

**✅ Success Response (2XX):** built with `sendResponse` (`src/utils/sendResponse.ts`)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Ride accepted successfully",
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPage": 3 },
  "data": { "id": "uuid-1234", "status": "ACCEPTED" }
}
```
`meta` is only present on paginated lists.

**❌ Error Response (4XX / 5XX):** produced only by the global `errorHandler`
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "errorSources": [{ "path": "body.licensePlate", "message": "Invalid license plate format." }]
}
```
`errorSources` is always an array (non-field errors get one entry with an empty `path`); `stack` appears only when `NODE_ENV=development`.

Server errors (5xx) are also persisted, redacted and non-blocking, to the `error_logs` table (`ErrorLog` model). Passwords, tokens, OTPs, secrets, `authorization`/`cookie` values and sensitive query-string params are replaced with `[REDACTED]` first (`src/utils/redact.ts`). Which statuses are stored is controlled by `shouldPersistError()` in `src/utils/errorLogger.ts`.

---

## 🔐 Authentication Strategy

In production, Deligo utilizes a centralized **Identity Microservice**. Therefore, this repository contains no password hashing (`bcrypt`) or JWT generation logic.

Instead, this service acts as a resource server. Authentication and Role-Based Access Control (RBAC) are enforced using a dedicated authentication middleware (`src/middlewares/auth.ts`). 

To interact with protected routes, clients must obtain a JWT from the Identity Service and inject it into the HTTP headers:

| Header | Description | Example Value |
| :--- | :--- | :--- |
| `Authorization` | Bearer token containing user identity and role claims | `Bearer eyJhbGciOiJIUzI1NiIsInR...` |

### Role-Based Access Control (RBAC)
The decoded JWT payload provides the user's `role`. The middleware enforces strict RBAC across the API:
- `CUSTOMER`: Can book rides and view their own history.
- `DRIVER`: Can accept rides, update coordinates, and manage KYC documents.
- `ADMIN` / `SUPER_ADMIN`: Have elevated access to review KYC documents, suspend users, and view global analytics.

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have the following installed on your machine:
- **Node.js** (v18.x or higher)
- **PostgreSQL** (v14.x or higher)
- **Cloudinary Account** (for KYC document & asset storage)

### 2. Environment Configuration
Clone the repository and set up your local environment variables:
```bash
cp .env.example .env
```
Be sure to populate the `.env` file with your local `DATABASE_URL` and external storage API credentials.

### 3. Installation & Database Sync
Install dependencies and align your local database with the Prisma schema:
```bash
# Install Node modules
npm install

# Apply committed migrations to PostgreSQL (use `npx prisma migrate dev` to create a new one)
npx prisma migrate deploy

# Generate the Prisma Client types
npx prisma generate
```

*(Optional)* Seed your local database with dummy users and drivers:
```bash
node prisma/seed_drivers.js
```

### 4. Bootstrapping the Server
Start the application in development mode with hot-reloading enabled:
```bash
npm run dev
```

To visualize and directly interact with your local database, launch Prisma Studio:
```bash
npx prisma studio
```

---

## 📝 Engineering Standards

When contributing to this repository, please adhere to the following guidelines:

- **Strict Type Safety:** The use of `any` is strictly prohibited. Define explicit TypeScript interfaces or infer them dynamically using Prisma and Zod.
- **Graceful Error Handling:** Controllers must wrap execution in `try/catch` blocks. Unhandled exceptions should be passed to `next(error)` to be caught and formatted by the global error handler.
- **Database Migrations:** Any modification to the Prisma schema (`prisma/schema/*.prisma`) must ship with a migration (`npx prisma migrate dev`), followed by `npx prisma generate`. Never use `prisma db push --accept-data-loss` against shared or production databases to ensure type definitions remain synchronized.
- **Service Isolation:** Controllers should never interact with the database directly. All Prisma logic must be abstracted into the respective Domain Service.