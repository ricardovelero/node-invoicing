import { Router } from "express";
import {
  archiveCustomer,
  createCustomer,
  deleteCustomer,
  listCustomers,
  renderEditCustomer,
  renderNewCustomer,
  restoreCustomer,
  showCustomer,
  updateCustomer,
} from "./customer.controller";

export const customerRouter = Router();

customerRouter.get("/", listCustomers);
customerRouter.get("/new", renderNewCustomer);
customerRouter.post("/", createCustomer);
customerRouter.get("/:customerId/edit", renderEditCustomer);
customerRouter.post("/:customerId/edit", updateCustomer);
customerRouter.post("/:customerId/delete", deleteCustomer);
customerRouter.post("/:customerId/archive", archiveCustomer);
customerRouter.post("/:customerId/restore", restoreCustomer);
customerRouter.get("/:customerId", showCustomer);
