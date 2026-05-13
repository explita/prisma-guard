export class PrismaGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrismaGuardError";
    Object.setPrototypeOf(this, PrismaGuardError.prototype);
  }
}
