import { Component, OnInit } from '@angular/core';
import { FzDataService } from '../fz-data.service';

export class Invoice {
  invoice_number: string = '';
  invoice_date: string = '';
  due_date: string = '';
  subtotal: number = 0;
  discount_percentage: number = 0;
  discount_amount: number = 0;
  tax_amount: number = 0;
  total: number = 0;
  is_recurrent: boolean = false;
  invoice_notes: string = '';
  invoice_status: string = '';
  tax_id: number = 0;
  billing_month: string = '';
}

@Component({
  selector: 'app-invoice-list',
  templateUrl: './invoice-list.component.html',
  styleUrls: ['./invoice-list.component.css'],
})
export class InvoiceListComponent implements OnInit {
  constructor(private FzDataService: FzDataService) {}

  public invoices: Invoice[] | any;

  private getInvoices(): void {
    this.FzDataService.getInvoices().then(
      (foundInvoices) => (this.invoices = foundInvoices)
    );
  }

  ngOnInit(): void {
    this.getInvoices();
  }
}
