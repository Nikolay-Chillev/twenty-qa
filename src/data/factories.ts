import { randomUUID } from 'node:crypto';

import { faker } from '@faker-js/faker';

import { uniqueAddress } from '../mail/mailbox';
import type { CompanyInput, OpportunityInput, PersonInput } from '../schemas/records';

// Bulgarian names and companies in Cyrillic, so every test also exercises encoding,
// search and sorting beyond ASCII. Surnames take the female form for women.
const MEN = ['Георги', 'Иван', 'Димитър', 'Николай', 'Петър', 'Стоян', 'Йордан'];
const WOMEN = ['Мария', 'Елена', 'Ивана', 'Десислава', 'Гергана', 'Радост', 'Цветелина'];
const SURNAMES = ['Петров', 'Иванов', 'Георгиев', 'Димитров', 'Николов', 'Стоянов', 'Тодоров'];
const TRADES = ['Технологии', 'Софт', 'Логистик', 'Агро', 'Медия', 'Строй', 'Трейд'];
const LEGAL_FORMS = ['ООД', 'ЕООД', 'АД'];
const CITIES = ['София', 'Пловдив', 'Варна', 'Бургас', 'Русе'];

/** A short random tag that keeps names unique across parallel tests. */
const tag = (): string => randomUUID().slice(0, 8);

export function personName(): { firstName: string; lastName: string } {
  const female = faker.datatype.boolean();
  const surname = faker.helpers.arrayElement(SURNAMES);
  return female
    ? { firstName: faker.helpers.arrayElement(WOMEN), lastName: `${surname}а` }
    : { firstName: faker.helpers.arrayElement(MEN), lastName: surname };
}

export function companyInput(overrides: CompanyInput = {}): CompanyInput {
  const id = tag();
  return {
    name: `${faker.helpers.arrayElement(TRADES)} ${id} ${faker.helpers.arrayElement(LEGAL_FORMS)}`,
    domainName: { primaryLinkUrl: `qa-${id}.bg` },
    address: { addressCity: faker.helpers.arrayElement(CITIES), addressCountry: 'Bulgaria' },
    ...overrides,
  };
}

export function personInput(overrides: PersonInput = {}): PersonInput {
  return {
    name: personName(),
    emails: { primaryEmail: uniqueAddress() },
    phones: {
      primaryPhoneNumber: `88${faker.string.numeric(7)}`,
      primaryPhoneCallingCode: '+359',
    },
    jobTitle: 'Мениджър продажби',
    ...overrides,
  };
}

export function opportunityInput(overrides: OpportunityInput = {}): OpportunityInput {
  return {
    name: `Сделка ${tag()}`,
    amount: { amountMicros: 12_500_000_000, currencyCode: 'EUR' },
    stage: 'MEETING',
    closeDate: '2026-12-31T00:00:00.000Z',
    ...overrides,
  };
}
