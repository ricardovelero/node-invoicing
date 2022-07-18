import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';

import { InvoiceListComponent } from './invoice-list/invoice-list.component';

@NgModule({
  declarations: [InvoiceListComponent],
  imports: [BrowserModule, HttpClientModule],
  providers: [],
  bootstrap: [InvoiceListComponent],
})
export class AppModule {}
