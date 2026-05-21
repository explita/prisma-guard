import { setTimeout } from "timers/promises";

async function runTests() {
  const baseUrl = "http://localhost:3005";

  console.log("=== Starting Verification Tests ===\n");

  // Step 1: Register a new user
  console.log("1. Testing POST /register...");
  const uniqueEmail = `test-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: uniqueEmail,
      password: "securepassword123",
      name: "Test User",
    }),
  });
  
  if (registerRes.status === 201) {
    const user = await registerRes.json();
    console.log("   [SUCCESS] Registered user successfully! Response (password omitted):", user);
  } else {
    console.error("   [FAILURE] Failed to register user:", await registerRes.text());
  }

  // Step 2: Attempt Login with correct credentials
  console.log("\n2. Testing POST /login with correct credentials...");
  const loginRes = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: uniqueEmail,
      password: "securepassword123",
    }),
  });

  if (loginRes.status === 200) {
    const loginData = await loginRes.json();
    console.log("   [SUCCESS] Logged in successfully! Response:", loginData);
  } else {
    console.error("   [FAILURE] Login failed:", await loginRes.text());
  }

  // Step 3: Attempt Login with incorrect credentials
  console.log("\n3. Testing POST /login with incorrect credentials...");
  const badLoginRes = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: uniqueEmail,
      password: "wrongpassword",
    }),
  });

  if (badLoginRes.status === 401) {
    console.log("   [SUCCESS] Server correctly rejected bad credentials with 401.");
  } else {
    console.error("   [FAILURE] Unexpected response for bad login:", badLoginRes.status, await badLoginRes.text());
  }

  // Step 4: Test field stripping with POST /users/test-strip
  console.log("\n4. Testing POST /users/test-strip (field stripping at runtime)...");
  const stripRes = await fetch(`${baseUrl}/users/test-strip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `strip-${Date.now()}@example.com`,
      password: "password123",
      name: "Strip Test User",
      poisonField: "hacked-payload-should-be-stripped", // Extra field not in Prisma schema
    }),
  });

  if (stripRes.status === 200) {
    const stripData = await stripRes.json();
    console.log("   [SUCCESS] User created! Response:", stripData);
  } else {
    console.error("   [FAILURE] Failed to create user with extra fields:", await stripRes.text());
  }

  console.log("\n=== All Tests Completed ===");
}

// Add a tiny delay to ensure the server has fully booted
await setTimeout(500);
runTests().catch(console.error);
