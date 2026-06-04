import { Router } from "express";
import {
  archiveItem,
  createItem,
  listItems,
  renderEditItem,
  renderNewItem,
  restoreItem,
  searchItems,
  updateItem,
} from "./item.controller";

export const itemRouter = Router();

itemRouter.get("/", listItems);
itemRouter.get("/search", searchItems);
itemRouter.get("/new", renderNewItem);
itemRouter.post("/", createItem);
itemRouter.get("/:itemId/edit", renderEditItem);
itemRouter.post("/:itemId/edit", updateItem);
itemRouter.post("/:itemId/archive", archiveItem);
itemRouter.post("/:itemId/restore", restoreItem);
