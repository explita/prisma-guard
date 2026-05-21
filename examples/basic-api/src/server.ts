import fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { prismaGuard } from "@explita/prisma-guard";
import {
  UserCreateScalarSchema,
  LoginCreateSchema,
} from "./generated/zod/schema.js";
import { ZodError } from "zod";

const app = fastify({ logger: false });

// Instantiate better-sqlite3 database and driver adapter for Prisma 7
const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });

// Instantiate Prisma Client and extend it with prismaGuard runtime protection
const prisma = new PrismaClient({ adapter }).$extends(prismaGuard());

// POST /register - Registers a new user
// Validates using UserCreateScalarSchema (which contains all database fields including password)
app.post("/register", async (request, reply) => {
  try {
    const data = UserCreateScalarSchema.parse(request.body);

    const user = await prisma.user.create({
      data,
    });

    // Return the created user (in production, omit the password)
    const { password, ...userWithoutPassword } = user;
    return reply.status(201).send(userWithoutPassword);
  } catch (error: any) {
    console.error("Error in /register:", error);

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "Validation Error",
        details: error.issues.reduce(
          (acc, issue) => {
            acc[issue.path.join(".")] = issue.message;
            return acc;
          },
          {} as Record<string, string>,
        ),
      });
    }

    return reply.status(500).send({ error: error.message });
  }
});

// POST /login - Simulates a user login
// Validates using LoginCreateSchema (our named pick that bypasses the global password omission)
app.post("/login", async (request, reply) => {
  try {
    const credentials = LoginCreateSchema.parse(request.body);

    // Look up the user by email
    const user = await prisma.user.findUnique({
      where: { email: credentials.email },
    });

    if (!user || user.password !== credentials.password) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    return { message: "Login successful!", userId: user.id };
  } catch (error: any) {
    console.error("Error in /login:", error);
    if (error.issues) {
      return reply
        .status(400)
        .send({ error: "Validation Error", details: error.issues });
    }
    return reply.status(500).send({ error: error.message });
  }
});

// GET /users - Lists all users
// Demonstrates how the prismaGuard extension automatically strips unknown/extra fields at runtime
app.post("/users/test-strip", async (request, reply) => {
  try {
    // If request.body contains extra fields (e.g. { email: 'x@x.com', password: '123', poisonField: 'hacked' }),
    // the prismaGuard client extension will silently strip 'poisonField' before sending the write to the database.
    const user = await prisma.user.create({
      data: request.body as any,
    });

    const { password, ...userWithoutPassword } = user;
    return reply.send({
      message: "User created! Extra fields (if any) were stripped.",
      user: userWithoutPassword,
    });
  } catch (error: any) {
    console.error("Error in /users/test-strip:", error);
    return reply.status(500).send({ error: error.message });
  }
});

const start = async () => {
  try {
    await app.listen({ port: 3005, host: "0.0.0.0" });
    console.log("Server listening on http://localhost:3005");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
