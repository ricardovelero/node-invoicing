import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { InvoiceListComponent } from './invoice-list/invoice-list.component';

@NgModule({
  declarations: [InvoiceListComponent],
  imports: [BrowserModule],
  providers: [],
  bootstrap: [InvoiceListComponent],
})
export class AppModule {}
