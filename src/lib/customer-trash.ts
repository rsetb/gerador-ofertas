import type { CustomerInfo } from './types';

export function normalizeCpf(cpf: string): string {
  return (cpf || '').replace(/\D/g, '');
}

type CustomerTrashEntry = CustomerInfo & {
  deletedAt: string;
  deletedBy?: string;
  deletedByName?: string;
};

export class InMemoryCustomerTrashStore {
  private customers = new Map<string, CustomerInfo>();
  private trash = new Map<string, CustomerTrashEntry>();

  create(customer: CustomerInfo): string {
    const cpf = normalizeCpf(customer.cpf || '');
    if (cpf.length !== 11) throw new Error('CPF inválido.');
    if (this.customers.has(cpf) || this.trash.has(cpf)) throw new Error('Cliente já existe.');
    this.customers.set(cpf, { ...customer, cpf });
    return cpf;
  }

  hasInMain(cpf: string): boolean {
    return this.customers.has(normalizeCpf(cpf));
  }

  hasInTrash(cpf: string): boolean {
    return this.trash.has(normalizeCpf(cpf));
  }

  deleteToTrash(cpf: string, deletedAt: string, deletedBy?: string, deletedByName?: string): void {
    const id = normalizeCpf(cpf);
    const existing = this.customers.get(id);
    if (!existing) throw new Error('Cliente não encontrado na tabela principal.');
    this.customers.delete(id);
    this.trash.set(id, { ...existing, deletedAt, deletedBy, deletedByName });
  }

  restore(cpf: string): void {
    const id = normalizeCpf(cpf);
    const existing = this.trash.get(id);
    if (!existing) throw new Error('Cliente não encontrado na lixeira.');
    this.trash.delete(id);
    const { deletedAt: _deletedAt, deletedBy: _deletedBy, deletedByName: _deletedByName, ...customer } = existing;
    this.customers.set(id, customer);
  }
}

