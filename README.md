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

### Domain Structure
Each feature is encapsulated within its own isolated domain inside the `src/domains/` directory:

```text
src/domains/
└── rides/
    ├── rides.routes.ts      # Express endpoint definitions & middleware mapping
    ├── rides.controller.ts  # Request parsing, service invocation, and response formatting
    ├── rides.service.ts     # Core business logic and Prisma ORM data access
    └── rides.validation.ts  # Zod schemas for strict request body/query validation
```

---

## 🔌 API Contract

To ensure seamless frontend and mobile integration, all API endpoints must adhere to a strict, predictable JSON response format.

**✅ Success Response (2XX):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-1234",
    "status": "COMPLETED"
  }
}
```

**❌ Error Response (4XX / 5XX):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Invalid license plate format provided."
  }
}
```

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

# Push schema changes to PostgreSQL
npx prisma db push

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
- **Database Migrations:** Any modification to `prisma/schema.prisma` must be immediately followed by `npx prisma db push` and `npx prisma generate` to ensure type definitions remain synchronized.
- **Service Isolation:** Controllers should never interact with the database directly. All Prisma logic must be abstracted into the respective Domain Service.