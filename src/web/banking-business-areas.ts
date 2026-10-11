export const BANKING_BUSINESS_AREAS = [
  { id: "prudential-supervision", label: "Prudential & Supervision" },
  {
    id: "resolution-deposit-protection",
    label: "Resolution & Deposit Protection",
  },
  { id: "payments-consumer", label: "Payments & Consumer" },
  { id: "markets-infrastructure", label: "Markets & Infrastructure" },
  { id: "aml-financial-crime", label: "AML & Financial Crime" },
  { id: "digital-operational", label: "Digital & Operational" },
] as const;

export type BankingBusinessAreaId =
  (typeof BANKING_BUSINESS_AREAS)[number]["id"];

/** Editorial Reader navigation only; it does not express legal applicability. */
const FAMILY_BUSINESS_AREAS: Record<string, readonly BankingBusinessAreaId[]> =
  {
    "family:crd": ["prudential-supervision"],
    "family:crr": ["prudential-supervision"],
    "family:ssm": ["prudential-supervision"],
    "family:eba": ["prudential-supervision"],
    "family:cssf": ["prudential-supervision"],
    "family:covered-bonds": [
      "prudential-supervision",
      "markets-infrastructure",
    ],
    "family:brrd": ["resolution-deposit-protection"],
    "family:srmr": ["resolution-deposit-protection"],
    "family:dgsd": ["resolution-deposit-protection"],
    "family:crisis-management": ["resolution-deposit-protection"],
    "family:psd": ["payments-consumer"],
    "family:payments": ["payments-consumer"],
    "family:consumer-credit": ["payments-consumer"],
    "family:mifid": ["markets-infrastructure"],
    "family:market-infrastructure": ["markets-infrastructure"],
    "family:securitisation": ["markets-infrastructure"],
    "family:mica": ["markets-infrastructure"],
    "family:aml": ["aml-financial-crime"],
    "family:dora": ["digital-operational"],
    "family:ai-act": ["digital-operational"],
    "family:data-act": ["digital-operational"],
    "family:gdpr": ["digital-operational"],
    "family:nis2": ["digital-operational"],
  };

export function familyBelongsToBusinessArea(
  familyId: string,
  businessArea: BankingBusinessAreaId,
): boolean {
  return FAMILY_BUSINESS_AREAS[familyId]?.includes(businessArea) ?? false;
}
