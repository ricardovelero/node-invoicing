import { z } from "zod";

export const customerFormSchema = z.object({
  name: z.string().trim().min(2, "Customer name is required."),
  email: z.string().trim().email("Use a valid email address.").or(z.literal("")).optional(),
  taxId: z.string().trim().optional(),
  addressLine1: z.string().trim().optional(),
  city: z.string().trim().optional(),
  country: z.string().trim().optional(),
});

export type CustomerForm = z.infer<typeof customerFormSchema>;
