import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Invoice } from './invoice-list/invoice-list.component';
import { response } from 'express';

@Injectable({
  providedIn: 'root',
})
export class FzDataService {
  private apiBaseUrl = 'http://localhost:8080/api';

  public getInvoices(): Promise<Invoice[]> {
    const url: string = `${this.apiBaseUrl}/invoices`;
    return this.http
      .get(url)
      .toPromise()
      .then((response) => response as Invoice[])
      .catch(this.handleError);
  }

  private handleError(error: any): Promise<any> {
    console.error('Something has gone wrong', error);
    return Promise.reject(error.message || error);
  }

  constructor(private http: HttpClient) {}
}
