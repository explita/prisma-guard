const { stripExtraFields } = require("../dist/lib/strip-fields.js");
const { performance } = require("perf_hooks");

const mockAllFields = {
  Laundry: {
    scalar: [
      "id",
      "companyId",
      "branchId",
      "userId",
      "customerId",
      "reference",
      "totalItems",
      "subtotal",
      "totalTax",
      "grandTotal",
      "amountPaid",
      "balance",
      "status",
      "paymentStatus",
      "receivedDate",
      "dueDate",
      "pickedUpDate",
      "metadata",
      "createdAt",
      "updatedAt"
    ],
    relations: [
      { name: "branch", model: "Branch" },
      { name: "customer", model: "Customer" },
      { name: "items", model: "LaundryItem" },
      { name: "timeline", model: "LaundryTimeline" }
    ]
  },
  LaundryItem: {
    scalar: [
      "id",
      "companyId",
      "laundryId",
      "serviceId",
      "title",
      "quantity",
      "price",
      "color",
      "brand",
      "condition",
      "metadata",
      "createdAt",
      "updatedAt"
    ],
    relations: [
      { name: "laundry", model: "Laundry" }
    ]
  }
};

const mockPayload = {
  customerId: "cust_123456",
  amountPaid: 10,
  paymentStatus: "PENDING",
  receivedDate: "2026-05-17",
  dueDate: "2026-05-20",
  poisonField1: "attack",
  items: {
    create: [
      { serviceId: "srv_1", quantity: 2, price: 5, color: "blue", brand: "nike", poisonField2: "nested attack" },
      { serviceId: "srv_2", quantity: 1, price: 10, color: "red", brand: "adidas", poisonField3: "another nested attack" }
    ]
  }
};

console.log("Warming up V8 compiler...");
for (let i = 0; i < 20000; i++) {
  stripExtraFields(mockPayload, "Laundry", mockAllFields);
}

console.log("Running benchmark (100,000 iterations)...");
const iterations = 100000;
const start = performance.now();
for (let i = 0; i < iterations; i++) {
  stripExtraFields(mockPayload, "Laundry", mockAllFields);
}
const end = performance.now();

const totalDuration = end - start;
const averageTime = totalDuration / iterations;

console.log("\n=========================================");
console.log("📊 PRISMA GUARD RUNTIME BENCHMARK RESULTS");
console.log("=========================================");
console.log(`Total duration: ${totalDuration.toFixed(2)}ms`);
console.log(`Average per query: ${(averageTime * 1000).toFixed(3)} microseconds (${averageTime.toFixed(6)}ms)`);
console.log("=========================================");
