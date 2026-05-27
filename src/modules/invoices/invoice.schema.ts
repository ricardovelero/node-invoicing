import { z } from "zod";

export const invoiceFormSchema = z.object({
  customerId: z.string().uuid("Choose a customer."),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  lineDescription: z.string().trim().min(1, "Line description is required."),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  unitPrice: z.coerce.number().nonnegative("Unit price cannot be negative."),
});

export type InvoiceForm = z.infer<typeof invoiceFormSchema>;
