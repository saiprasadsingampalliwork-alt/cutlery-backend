import { BadRequestException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

export const GROUPS = ["adults", "kids", "baby"] as const;
export type Group = (typeof GROUPS)[number];

export const GROUP_SIZES: Record<Group, string[]> = {
  adults: ["Small", "Medium", "Large"],
  kids: ["Small", "Medium"],
  baby: ["Small"],
};

export type AudienceRow = { slug: string; label: string; group: string; shared: boolean; sizes: unknown; active: boolean; sort: number };

// Everyday, Baking, Parties, and Commercial are the shop. Older audiences stay so an existing database can be switched off.
export const DEFAULT_AUDIENCES: AudienceRow[] = [
  { slug: "everyday", label: "Everyday", group: "adults", shared: false, sizes: ["Small", "Medium", "Large"], active: true, sort: 0 },
  { slug: "baking", label: "Baking", group: "adults", shared: false, sizes: ["Small", "Medium", "Large"], active: true, sort: 1 },
  { slug: "parties", label: "Parties", group: "adults", shared: false, sizes: ["Lite", "Heavy"], active: true, sort: 2 },
  { slug: "commercial", label: "Commercial", group: "adults", shared: false, sizes: ["Standard"], active: true, sort: 3 },
  { slug: "hosting", label: "Hosting", group: "adults", shared: false, sizes: GROUP_SIZES.adults, active: false, sort: 4 },
  { slug: "open-stock", label: "Open stock", group: "adults", shared: true, sizes: GROUP_SIZES.adults, active: false, sort: 5 },
  { slug: "women", label: "Women", group: "adults", shared: false, sizes: GROUP_SIZES.adults, active: false, sort: 6 },
  { slug: "men", label: "Men", group: "adults", shared: false, sizes: GROUP_SIZES.adults, active: false, sort: 7 },
  { slug: "unisex", label: "Unisex", group: "adults", shared: false, sizes: GROUP_SIZES.adults, active: false, sort: 8 },
  { slug: "girls", label: "Girls", group: "kids", shared: false, sizes: GROUP_SIZES.kids, active: false, sort: 9 },
  { slug: "boys", label: "Boys", group: "kids", shared: false, sizes: GROUP_SIZES.kids, active: false, sort: 10 },
  { slug: "kids-unisex", label: "Kids unisex", group: "kids", shared: false, sizes: GROUP_SIZES.kids, active: false, sort: 11 },
  { slug: "baby", label: "Baby", group: "baby", shared: false, sizes: GROUP_SIZES.baby, active: false, sort: 12 },
];

/** Creates the default audiences the first time the API starts against a database without any. */
export async function ensureAudiences(prisma: PrismaClient) {
  if ((await prisma.audience.count()) > 0) return;
  await prisma.audience.createMany({ data: DEFAULT_AUDIENCES.map((row) => ({ ...row, sizes: row.sizes as string[] })) });
}

export function presentAudience(row: AudienceRow) {
  return {
    slug: row.slug,
    label: row.label,
    group: (GROUPS as readonly string[]).includes(row.group) ? row.group : "adults",
    shared: row.shared,
    sizes: cleanSizes(row.sizes) ?? GROUP_SIZES.adults,
    active: row.active,
    sort: row.sort,
  };
}

/** Sizes are short labels such as M, 4-5Y, or 0-3M. Returns null when the list is unusable. */
export function cleanSizes(value: unknown) {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const sizes: string[] = [];
  for (const item of value) {
    const size = String(item ?? "").replace(/\|/g, "").trim().replace(/\s+/g, " ").slice(0, 12);
    if (!size || seen.has(size.toLowerCase())) continue;
    seen.add(size.toLowerCase());
    sizes.push(size);
  }
  return sizes.length && sizes.length <= 20 ? sizes : null;
}

export function requireSizes(value: unknown) {
  const sizes = cleanSizes(value);
  if (!sizes) throw new BadRequestException("Add between 1 and 20 options, for example Small, Medium, Large.");
  return sizes;
}

/**
 * Picks the audience for a product. Accepts a slug or a name ("Everyday", "Baking"),
 * then the shared audience for the table.
 */
export async function resolveAudience(prisma: PrismaClient, value: string | undefined, silhouette?: string) {
  const audiences = await prisma.audience.findMany();
  const text = (value ?? "").trim().toLowerCase();
  const wanted = text;
  const found = audiences.find((row) => row.slug === wanted || row.label.toLowerCase() === wanted || row.slug === wanted.replace(/\s+/g, "-"));
  if (found) return found;
  if (text) throw new BadRequestException(`"${value}" is not an audience. Add it under Audiences first.`);
  void silhouette;
  return audiences.find((row) => row.group === "adults" && row.shared && row.active) ?? audiences.find((row) => row.active) ?? audiences[0];
}

/** Selected audiences also show the shared pieces of their own group, such as Open stock. */
export function audienceMatcher(audiences: AudienceRow[], selected: string[]) {
  if (!selected.length) return () => true;
  const chosen = new Set(selected);
  const groups = new Set(audiences.filter((row) => chosen.has(row.slug)).map((row) => row.group));
  const shared = new Set(audiences.filter((row) => row.shared && groups.has(row.group)).map((row) => row.slug));
  return (audience: string) => chosen.has(audience) || shared.has(audience);
}

/** Products are on sale only when Active and their audience is switched on. Use as a Prisma `where`. */
export async function onSaleWhere(prisma: PrismaClient) {
  const off = await prisma.audience.findMany({ where: { active: false }, select: { slug: true } });
  return { status: "active", gender: { notIn: off.map((row) => row.slug) } };
}

export async function isOnSale(prisma: PrismaClient, product: { status: string; gender: string }) {
  if (product.status !== "active") return false;
  const audience = await prisma.audience.findUnique({ where: { slug: product.gender } });
  return !audience || audience.active;
}
