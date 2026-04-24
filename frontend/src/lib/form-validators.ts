import { z } from "zod";

/**
 * Common field validators for platform forms.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Please enter a valid email address")
  .max(255, "Email must be less than 255 characters");

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/, "Please enter a valid phone number (e.g., 555-123-4567)")
  .or(z.literal(""))
  .optional();

export const npiSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, "NPI must be exactly 10 digits")
  .or(z.literal(""))
  .optional();

export const einSchema = z
  .string()
  .trim()
  .regex(/^\d{2}-?\d{7}$/, "EIN must be in the format XX-XXXXXXX")
  .or(z.literal(""))
  .optional();

export const currencySchema = z
  .number({ invalid_type_error: "Must be a number" })
  .min(0, "Amount must be positive")
  .or(
    z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Please enter a valid amount").transform(Number)
  );

export const requiredText = (fieldName: string, max = 255) =>
  z
    .string()
    .trim()
    .min(1, `${fieldName} is required`)
    .max(max, `${fieldName} must be less than ${max} characters`);

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Must be less than ${max} characters`)
    .optional()
    .or(z.literal(""));

export const dateSchema = z
  .string()
  .refine(
    (val) => !val || !isNaN(Date.parse(val)),
    "Please enter a valid date"
  );

/**
 * Helper: show validation toast when form has errors.
 */
export function showValidationErrors(errors: Record<string, any>) {
  const { toast } = require("sonner");
  const messages = Object.values(errors)
    .map((e: any) => e?.message)
    .filter(Boolean)
    .slice(0, 3);
  
  if (messages.length) {
    toast.error("Please fix the errors above", {
      description: messages.join(". "),
    });
  }
}
