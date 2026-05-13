export const defaultTypeMap = {
  String: "z.string().trim()",
  Int: "z.number()",
  BigInt: "z.string().trim()",
  Float: "z.number()",
  Decimal: "z.union([z.number(), z.string()])",
  Boolean: "z.boolean()",
  DateTime: "z.coerce.date()",
  Json: "z.unknown()",
  Bytes: "z.instanceof(Buffer)",
} as const;
