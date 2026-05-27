import { z } from "zod";

const dateInput = (requiredMessage: string, invalidMessage: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim().min(1, requiredMessage).pipe(z.coerce.date({ error: invalidMessage })),
  );

export const invoiceFormSchema = z.object({
  customerId: z.string().uuid("Choose a customer."),
  issueDate: dateInput("Enter an issue date.", "Enter a valid issue date."),
  dueDate: dateInput("Enter a due date.", "Enter a valid due date."),
  lineDescription: z.string().trim().min(1, "Line description is required."),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  unitPrice: z.coerce.number().nonnegative("Unit price cannot be negative."),
});

export type InvoiceForm = z.infer<typeof invoiceFormSchema>;
