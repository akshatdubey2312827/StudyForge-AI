import { Request, Response, NextFunction } from "express";
import { z, ZodTypeAny, ZodError } from "zod";

type ParseTarget = "body" | "query" | "params";

/**
 * Middleware factory: validate req[target] against a Zod schema.
 * Uses ZodType<O, D, any> so schemas with .transform() (different input/output
 * types) are accepted without a type error.
 *
 * On success, replaces req[target] with the parsed (coerced) value.
 * On failure, returns 422 with a structured error list.
 */
export function validate<S extends ZodTypeAny>(
  schema: S,
  target: ParseTarget = "body",
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const errors = (result.error as ZodError).errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      }));
      res.status(422).json({ error: "Validation failed", details: errors });
      return;
    }

    // Replace with validated/coerced value so downstream handlers get clean data
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}
