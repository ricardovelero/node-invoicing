import { Router } from "express";
import {
  createCustomer,
  listCustomers,
  renderNewCustomer,
  showCustomer,
} from "./customer.controller";

export const customerRouter = Router();

customerRouter.get("/", listCustomers);
customerRouter.get("/new", renderNewCustomer);
customerRouter.post("/", createCustomer);
customerRouter.get("/:customerId", showCustomer);
