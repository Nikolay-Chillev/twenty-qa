import { z } from 'zod';

// Contracts for the records the suite works with, as Twenty's REST and GraphQL APIs
// return them. Unknown fields are allowed (Twenty adds fields often); the ones listed
// must be present with these types.

const Links = z.object({
  primaryLinkUrl: z.string(),
  primaryLinkLabel: z.string(),
  secondaryLinks: z.array(z.unknown()).nullable(),
});

const Address = z.object({
  addressStreet1: z.string(),
  addressStreet2: z.string(),
  addressCity: z.string(),
  addressPostcode: z.string(),
  addressState: z.string(),
  addressCountry: z.string(),
  addressLat: z.number().nullable(),
  addressLng: z.number().nullable(),
});

/** Who created or last updated a record: a user, an API key, the system or an import. */
const Actor = z.object({
  source: z.string(),
  workspaceMemberId: z.uuid().nullable(),
  name: z.string(),
});

const RecordBase = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  position: z.number(),
  createdBy: Actor,
  updatedBy: Actor,
});

export const Company = RecordBase.extend({
  name: z.string(),
  domainName: Links,
  address: Address,
  linkedinLink: Links,
  annualRevenue: z.object({
    amountMicros: z.number().nullable(),
    currencyCode: z.string().nullable(),
  }),
  accountOwnerId: z.uuid().nullable(),
});
export type Company = z.infer<typeof Company>;

export const Person = RecordBase.extend({
  name: z.object({ firstName: z.string(), lastName: z.string() }),
  emails: z.object({ primaryEmail: z.string(), additionalEmails: z.array(z.string()).nullable() }),
  phones: z.object({
    primaryPhoneNumber: z.string(),
    primaryPhoneCountryCode: z.string(),
    primaryPhoneCallingCode: z.string(),
    additionalPhones: z.array(z.unknown()).nullable(),
  }),
  linkedinLink: Links,
  jobTitle: z.string(),
  companyId: z.uuid().nullable(),
});
export type Person = z.infer<typeof Person>;

export const OPPORTUNITY_STAGES = ['NEW', 'SCREENING', 'MEETING', 'PROPOSAL', 'CUSTOMER'] as const;

export const Opportunity = RecordBase.extend({
  name: z.string(),
  /** Money in millionths of the currency unit: 12.5 EUR is 12_500_000. */
  amount: z.object({
    amountMicros: z.number().nullable(),
    currencyCode: z.string().nullable(),
  }),
  closeDate: z.iso.datetime().nullable(),
  stage: z.enum(OPPORTUNITY_STAGES),
  companyId: z.uuid().nullable(),
  pointOfContactId: z.uuid().nullable(),
  ownerId: z.uuid().nullable(),
});
export type Opportunity = z.infer<typeof Opportunity>;

/** Fields a test may set when it creates or updates a company. */
export interface CompanyInput {
  name?: string;
  domainName?: Partial<z.infer<typeof Links>>;
  address?: Partial<z.infer<typeof Address>>;
  accountOwnerId?: string | null;
}

/** Fields a test may set when it creates or updates a person. */
export interface PersonInput {
  name?: { firstName?: string; lastName?: string };
  emails?: { primaryEmail?: string; additionalEmails?: string[] };
  phones?: { primaryPhoneNumber?: string; primaryPhoneCallingCode?: string };
  jobTitle?: string;
  companyId?: string | null;
}

/** Fields a test may set when it creates or updates an opportunity. */
export interface OpportunityInput {
  name?: string;
  amount?: { amountMicros?: number | null; currencyCode?: string | null };
  closeDate?: string | null;
  stage?: (typeof OPPORTUNITY_STAGES)[number];
  companyId?: string | null;
  pointOfContactId?: string | null;
}
