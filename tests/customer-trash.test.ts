import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryCustomerTrashStore } from '../src/lib/customer-trash';

const baseCustomer = {
  name: 'Fulano de Tal',
  cpf: '123.456.789-09',
  phone: '(85) 99999-9999',
  email: 'fulano@example.com',
  zip: '60000-000',
  address: 'Rua A',
  number: '100',
  neighborhood: 'Centro',
  city: 'Fortaleza',
  state: 'CE',
};

test('Novos cadastros permanecem na tabela principal', () => {
  const store = new InMemoryCustomerTrashStore();
  store.create(baseCustomer);
  assert.equal(store.hasInMain(baseCustomer.cpf), true);
  assert.equal(store.hasInTrash(baseCustomer.cpf), false);
});

test('Apenas exclusões manuais movem registros para a lixeira', () => {
  const store = new InMemoryCustomerTrashStore();
  store.create(baseCustomer);
  assert.equal(store.hasInTrash(baseCustomer.cpf), false);

  store.deleteToTrash(baseCustomer.cpf, new Date().toISOString(), 'u1', 'Admin');
  assert.equal(store.hasInMain(baseCustomer.cpf), false);
  assert.equal(store.hasInTrash(baseCustomer.cpf), true);
});

test('Restauração devolve o registro para a tabela principal', () => {
  const store = new InMemoryCustomerTrashStore();
  store.create(baseCustomer);
  store.deleteToTrash(baseCustomer.cpf, new Date().toISOString(), 'u1', 'Admin');
  store.restore(baseCustomer.cpf);

  assert.equal(store.hasInMain(baseCustomer.cpf), true);
  assert.equal(store.hasInTrash(baseCustomer.cpf), false);
});

