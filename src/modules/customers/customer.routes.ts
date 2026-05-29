import { Router } from "express";
import {
  createCustomer,
  listCustomers,
  renderEditCustomer,
  renderNewCustomer,
  showCustomer,
  updateCustomer,
} from "./customer.controller";

export const customerRouter = Router();

customerRouter.get("/", listCustomers);
customerRouter.get("/new", renderNewCustomer);
customerRouter.post("/", createCustomer);
customerRouter.get("/:customerId/edit", renderEditCustomer);
customerRouter.post("/:customerId/edit", updateCustomer);
customerRouter.get("/:customerId", showCustomer);
