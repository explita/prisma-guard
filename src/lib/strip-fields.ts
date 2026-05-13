import { ModelFields } from "../types.js";

/**
 * Recursively strips extra fields from Prisma nested write operations
 * @param data - Input data from Prisma create/update args
 * @param modelName - Current Prisma model being processed
 * @param allFields - Schema definition mapping model names to their fields
 * @returns Sanitized data containing only valid schema fields
 */
export function stripExtraFields(
  data: any,
  modelName: string,
  allFields: Record<string, ModelFields>,
  onStrip?: (field: string, model: string) => void,
  depth = 0,
): any {
  if (depth > 10) return data; // Depth limiting to prevent stack overflow
  if (!data || typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map((item) =>
      stripExtraFields(item, modelName, allFields, onStrip, depth + 1),
    );
  }

  const model = allFields[modelName];
  if (!model) return data;

  const sanitized: any = {};

  // 1. Log stripped fields
  if (onStrip) {
    const allowedNames = [
      ...model.scalar,
      ...model.relations.map((r) => r.name),
    ];
    for (const key of Object.keys(data)) {
      if (!allowedNames.includes(key)) {
        onStrip(key, modelName);
      }
    }
  }

  // 2. Sanitize scalar fields
  for (const field of model.scalar) {
    if (field in data) {
      sanitized[field] = data[field];
    }
  }

  // 3. Sanitize relation fields
  for (const relation of model.relations) {
    if (relation.name in data) {
      const relationData = data[relation.name];
      if (!relationData || typeof relationData !== "object") {
        sanitized[relation.name] = relationData;
        continue;
      }

      const sanitizedRelation: any = {};

      // Handle common nested writes
      const nestedOps = [
        "create",
        "update",
        "upsert",
        "connectOrCreate",
        "createMany",
        "updateMany",
      ];
      for (const op of nestedOps) {
        if (op in relationData) {
          if (op === "upsert") {
            const upsertData = relationData[op];
            sanitizedRelation[op] = Array.isArray(upsertData)
              ? upsertData.map((u: any) => ({
                  ...u,
                  create: stripExtraFields(
                    u.create,
                    relation.model,
                    allFields,
                    onStrip,
                    depth + 1,
                  ),
                  update: stripExtraFields(
                    u.update,
                    relation.model,
                    allFields,
                    onStrip,
                    depth + 1,
                  ),
                }))
              : {
                  ...upsertData,
                  create: stripExtraFields(
                    upsertData.create,
                    relation.model,
                    allFields,
                    onStrip,
                    depth + 1,
                  ),
                  update: stripExtraFields(
                    upsertData.update,
                    relation.model,
                    allFields,
                    onStrip,
                    depth + 1,
                  ),
                };
          } else if (op === "connectOrCreate") {
            const coData = relationData[op];
            sanitizedRelation[op] = Array.isArray(coData)
              ? coData.map((c: any) => ({
                  ...c,
                  create: stripExtraFields(
                    c.create,
                    relation.model,
                    allFields,
                    onStrip,
                    depth + 1,
                  ),
                }))
              : {
                  ...coData,
                  create: stripExtraFields(
                    coData.create,
                    relation.model,
                    allFields,
                    onStrip,
                    depth + 1,
                  ),
                };
          } else if (op === "createMany" || op === "updateMany") {
            const mData = relationData[op];
            if (mData && typeof mData === "object" && mData.data) {
              sanitizedRelation[op] = {
                ...mData,
                data: stripExtraFields(
                  mData.data,
                  relation.model,
                  allFields,
                  onStrip,
                  depth + 1,
                ),
              };
            } else {
              sanitizedRelation[op] = mData;
            }
          } else {
            // create, update
            sanitizedRelation[op] = stripExtraFields(
              relationData[op],
              relation.model,
              allFields,
              onStrip,
              depth + 1,
            );
          }
        }
      }

      // Keep other non-nested-write keys as-is (e.g. connect, disconnect, set, delete)
      const otherOps = ["connect", "disconnect", "set", "delete"];
      for (const op of otherOps) {
        if (op in relationData) {
          sanitizedRelation[op] = relationData[op];
        }
      }

      sanitized[relation.name] = sanitizedRelation;
    }
  }

  return sanitized;
}
