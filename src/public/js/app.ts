import Alpine from "alpinejs";
import { invoiceForm } from "./alpine/invoice-form";

Alpine.data("invoiceForm", invoiceForm);

window.Alpine = Alpine;
Alpine.start();
