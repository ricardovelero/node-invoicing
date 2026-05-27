import { Router } from "express";
import { createCustomer, listCustomers, renderNewCustomer } from "./customer.controller";

export const customerRouter = Router();

customerRouter.get("/", listCustomers);
customerRouter.get("/new", renderNewCustomer);
customerRouter.post("/", createCustomer);
