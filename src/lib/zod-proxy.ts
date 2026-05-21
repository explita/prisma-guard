/**
 * A proxy that mimics Zod for IntelliSense but returns strings of the calls.
 * Used in prisma-guard.config.js for typed decorators.
 */
function deepStringify(val: any): string {
  if (typeof val === "function") {
    let str = val.toString();
    // Unwrap ref("constants.X") -> __GUARD_REF__constants.X
    str = str.replace(/ref\(['"]constants\.([a-zA-Z0-9_.]+)['"]\)/g, "__GUARD_REF__constants.$1");
    // Unwrap ref("X") -> __GUARD_REF__X
    str = str.replace(/ref\(['"]([a-zA-Z0-9_.]+)['"]\)/g, "__GUARD_REF__$1");
    return str;
  }
  if (val instanceof RegExp) return val.toString();
  if (typeof val === "string") return `"${val}"`;
  if (val === null || typeof val !== "object") return JSON.stringify(val);

  if (Array.isArray(val)) {
    return `[${val.map(deepStringify).join(", ")}]`;
  }

  const entries = Object.entries(val)
    .map(([k, v]) => `${k}: ${deepStringify(v)}`)
    .join(", ");
  return `{ ${entries} }`;
}

export function createProxy(
  path: string = "",
  isRef = false,
  importPath?: string,
) {
  const getPath = () => {
    if (isRef) {
      const base = `__GUARD_REF__${path}`;
      return importPath ? `${base}__FROM__${importPath}` : base;
    }
    return path;
  };

  const proxy = (...args: any[]) => {
    const stringifiedArgs = args.map(deepStringify).join(", ");
    return createProxy(`${path}(${stringifiedArgs})`, isRef, importPath);
  };

  return new Proxy(proxy, {
    get(target, prop) {
      if (
        prop === "toString" ||
        prop === "valueOf" ||
        prop === Symbol.toPrimitive
      ) {
        return getPath;
      }
      const newPath = path ? `${path}.${String(prop)}` : `.${String(prop)}`;
      return createProxy(newPath, isRef, importPath);
    },
  });
}
