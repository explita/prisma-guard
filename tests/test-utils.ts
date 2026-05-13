import { stripExtraFields } from "../src/lib/utils";
import { ModelFields } from "../src/types";

const mockFields: Record<string, ModelFields> = {
  User: {
    scalar: ["id", "email", "name"],
    relations: [
      { name: "posts", model: "Post" },
      { name: "profile", model: "Profile" },
    ],
  },
  Post: {
    scalar: ["id", "title", "content", "published"],
    relations: [{ name: "author", model: "User" }],
  },
  Profile: {
    scalar: ["id", "bio", "userId"],
    relations: [{ name: "user", model: "User" }],
  },
};

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

function runTests() {
  console.log("🚀 Running Prisma Guard Utils Tests...\n");

  // Test 1: Simple scalar stripping
  const input1 = { id: 1, email: "test@example.com", extra: "should-be-gone" };
  const result1 = stripExtraFields(input1, "User", mockFields);
  assert(!("extra" in result1), "Should strip extra scalar field");
  assert(
    result1.email === "test@example.com",
    "Should keep valid scalar field",
  );

  // Test 2: Nested create relation
  const input2 = {
    name: "John",
    posts: {
      create: {
        title: "Hello World",
        ignored: "bad-data",
      },
    },
  };
  const result2 = stripExtraFields(input2, "User", mockFields);
  assert(
    result2.posts.create.title === "Hello World",
    "Should keep valid nested title",
  );
  assert(
    !("ignored" in result2.posts.create),
    "Should strip extra field in nested create",
  );

  // Test 3: Nested upsert with arrays
  const input3 = {
    posts: {
      upsert: [
        {
          where: { id: 1 },
          create: { title: "New Post", meta: "strip-me" },
          update: { content: "Updated", hack: "strip-me" },
        },
      ],
    },
  };
  const result3 = stripExtraFields(input3, "User", mockFields);
  assert(
    result3.posts.upsert[0].create.title === "New Post",
    "Should keep upsert create title",
  );
  assert(
    !("meta" in result3.posts.upsert[0].create),
    "Should strip extra field in upsert create",
  );
  assert(
    !("hack" in result3.posts.upsert[0].update),
    "Should strip extra field in upsert update",
  );

  // Test 4: createMany with data array
  const input4 = {
    posts: {
      createMany: {
        data: [
          { title: "Post 1", extra: "1" },
          { title: "Post 2", extra: "2" },
        ],
        skipDuplicates: true,
      },
    },
  };
  const result4 = stripExtraFields(input4, "User", mockFields);
  assert(
    result4.posts.createMany.data.length === 2,
    "Should keep both items in createMany",
  );
  assert(
    !("extra" in result4.posts.createMany.data[0]),
    "Should strip extra field in first createMany item",
  );
  assert(
    result4.posts.createMany.skipDuplicates === true,
    "Should keep skipDuplicates property",
  );

  // Test 5: Handling of connect/disconnect (should be preserved as-is)
  const input5 = {
    posts: {
      connect: { id: 10 },
      disconnect: [{ id: 5 }],
    },
  };
  const result5 = stripExtraFields(input5, "User", mockFields);
  assert(result5.posts.connect.id === 10, "Should preserve connect object");
  assert(
    result5.posts.disconnect[0].id === 5,
    "Should preserve disconnect array",
  );

  // EDGE CASES
  console.log("\n🧪 Testing Edge Cases...");

  // Edge 1: Null/Undefined inputs
  assert(
    stripExtraFields(null, "User", mockFields) === null,
    "Should handle null",
  );
  assert(
    stripExtraFields(undefined, "User", mockFields) === undefined,
    "Should handle undefined",
  );

  // Edge 2: Unknown model
  const unknownInput = { some: "data" };
  assert(
    stripExtraFields(unknownInput, "Unknown", mockFields) === unknownInput,
    "Should return data as-is for unknown models",
  );

  // Edge 3: Empty objects
  assert(
    Object.keys(stripExtraFields({}, "User", mockFields)).length === 0,
    "Should handle empty objects",
  );

  // Edge 4: Deeply nested recursion
  const inputDeep = {
    name: "A",
    posts: {
      create: {
        title: "B",
        author: {
          create: {
            name: "C",
            posts: {
              create: { title: "D", extra: "X" },
            },
          },
        },
      },
    },
  };
  const resultDeep = stripExtraFields(inputDeep, "User", mockFields);
  assert(
    resultDeep.posts.create.author.create.posts.create.title === "D",
    "Should handle deep recursion",
  );
  assert(
    !("extra" in resultDeep.posts.create.author.create.posts.create),
    "Should strip extra fields in deep recursion",
  );

  console.log("\n🎉 All tests passed!");
}

try {
  runTests();
} catch (e: any) {
  console.error(`\n❌ Test failed: ${e.message}`);
  process.exit(1);
}
