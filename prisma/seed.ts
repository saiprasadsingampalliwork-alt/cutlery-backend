import { hash } from "bcryptjs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { DEFAULT_CATEGORIES, productGender, products } from "../../lib/catalog";
import { defaultSiteContent } from "../../lib/site";
import { DEFAULT_AUDIENCES } from "../src/audiences";
import { cleanFabricLabel, freeSlug, splitFabric } from "../src/fabrics";
import { DEFAULT_STYLES } from "../src/styles";
import { categorySlug } from "../src/category-slug";

const prisma = new PrismaClient();

const settings = {
  freeShippingAt: 1999,
  standardShipping: 99,
  expressShipping: 149,
  deliveryEstimate: "3–5 days",
  codEnabled: true,
  codFee: 40,
  codMax: 10000,
  returnWindowDays: 7,
  refundMethod: "Original payment",
  exchanges: true,
  businessName: "Earthen",
  gstin: "29AABCE1234F1Z5",
  pricesIncludeGst: true,
  announcementEnabled: true,
  announcementText: "",
  announcementHref: "",
  saleEnabled: false,
  saleName: "",
  salePercent: 0,
  saleStart: "",
  saleEnd: "",
  content: defaultSiteContent,
};

async function main() {
  for (const [sort, label] of DEFAULT_STYLES.entries()) {
    await prisma.style.upsert({
      where: { label },
      create: { slug: categorySlug(label), label, sort, active: true },
      update: { sort, active: true },
    });
  }
  await prisma.style.updateMany({ where: { slug: { in: ["casual", "formal", "ethnic", "dinner", "festive", "traditional"] } }, data: { active: false } });

  for (const audience of DEFAULT_AUDIENCES) {
    await prisma.audience.upsert({
      where: { slug: audience.slug },
      create: { ...audience, sizes: audience.sizes as string[] },
      update: {
        label: audience.label,
        group: audience.group,
        shared: audience.shared,
        sizes: audience.sizes as string[],
        active: audience.active,
        sort: audience.sort,
      },
    });
  }

  for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: { ...category, sort: index },
      update: { label: category.label, blurb: category.blurb, image: category.image, chart: category.chart, sort: index },
    });
  }
  await prisma.category.deleteMany({ where: { slug: { notIn: DEFAULT_CATEGORIES.map((category) => category.slug) } } });

  const kept = new Set(products.map((product) => product.slug));
  await prisma.product.deleteMany({ where: { slug: { notIn: [...kept] } } });

  for (const product of products) {
    const fabricLabel = cleanFabricLabel(product.fabricDetail ? product.fabric : splitFabric(product.fabric).fabric);
    const detail = product.fabricDetail ?? splitFabric(product.fabric).detail;
    await prisma.fabric.upsert({ where: { label: fabricLabel }, create: { slug: await freeSlug(prisma, fabricLabel), label: fabricLabel }, update: {} });
    const data = {
      name: product.name,
      price: product.price,
      category: product.category,
      gender: productGender(product),
      fabric: fabricLabel,
      fabricDetail: detail,
      styles: product.styles ?? ["everyday"],
      description: product.description,
      details: product.details,
      care: product.care,
      rating: product.rating,
      reviewCount: product.reviewCount,
      isNew: Boolean(product.isNew),
      reviews: product.reviews as Prisma.InputJsonValue,
      colors: product.colors as Prisma.InputJsonValue,
      sizes: product.sizes as Prisma.InputJsonValue,
      stock: product.stock as Prisma.InputJsonValue,
      status: "active",
      silhouette: product.silhouette,
      origin: product.origin,
      fit: product.fit,
      model: product.model as Prisma.InputJsonValue,
      photos: (product.photos ?? []) as Prisma.InputJsonValue,
    };
    await prisma.product.upsert({
      where: { slug: product.slug },
      create: { slug: product.slug, ...data },
      update: data,
    });
  }

  const materials = [...new Set(products.map((product) => cleanFabricLabel(product.fabric)))];
  await prisma.fabric.deleteMany({ where: { label: { notIn: materials } } });

  const password = await hash("quietclothes", 10);
  await prisma.customer.upsert({
    where: { email: "aisha@earthen.in" },
    create: {
      name: "Aisha Menon",
      email: "aisha@earthen.in",
      phone: "9876543210",
      passwordHash: password,
      addresses: [
        {
          id: "addr-home",
          label: "Home",
          name: "Aisha Menon",
          phone: "9876543210",
          line1: "14, Coconut Avenue",
          line2: "Indiranagar",
          city: "Bengaluru",
          state: "Karnataka",
          pin: "560038",
          isDefault: true,
        },
      ],
    },
    update: {},
  });

  const studio = await hash("studio", 10);
  const staff = [
    { id: "staff-owner", name: "Sai", email: "owner@earthen.in", role: "Owner" },
    { id: "staff-catalog", name: "Anika Rao", email: "catalog@earthen.in", role: "Catalog manager" },
    { id: "staff-orders", name: "Kabir Sen", email: "orders@earthen.in", role: "Order and support" },
  ];
  for (const member of staff) {
    await prisma.staff.upsert({
      where: { email: member.email },
      create: { ...member, passwordHash: studio },
      update: {},
    });
  }

  const coupons = [
    { code: "WELCOME10", type: "percent", value: 10, minOrder: 0, usageLimit: 500, used: 0, starts: "", ends: "", active: true },
    { code: "EARTHEN200", type: "fixed", value: 200, minOrder: 1999, usageLimit: 200, used: 0, starts: "", ends: "", active: true },
    { code: "FREESHIP", type: "free_shipping", value: 0, minOrder: 0, usageLimit: 200, used: 0, starts: "", ends: "", active: true },
  ];
  for (const coupon of coupons) {
    await prisma.coupon.upsert({ where: { code: coupon.code }, create: coupon, update: {} });
  }

  await prisma.banner.upsert({
    where: { id: "banner-aw26" },
    create: {
      id: "banner-aw26",
      title: "The kitchen, 2026",
      subtitle: "Bakeware, knives, and grills",
      href: "/shop?category=new",
      starts: "",
      ends: "",
    },
    update: { title: "The kitchen, 2026", subtitle: "Bakeware, knives, and grills", href: "/shop?category=new" },
  });

  const existing = await prisma.setting.findUnique({ where: { id: "store" } });
  const previous = (existing?.data ?? {}) as Record<string, unknown>;
  await prisma.setting.upsert({
    where: { id: "store" },
    create: { id: "store", data: settings as Prisma.InputJsonValue },
    update: { data: { ...settings, ...previous, content: defaultSiteContent } as Prisma.InputJsonValue },
  });

  await prisma.sequence.upsert({
    where: { id: "order" },
    create: { id: "order", value: 10423 },
    update: {},
  });

  const aisha = await prisma.customer.findUnique({ where: { email: "aisha@earthen.in" } });
  const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
  const orders = [
    {
      id: "order-seed",
      number: "EH-10421",
      createdAt: new Date(daysAgo(4)),
      email: "aisha@earthen.in",
      phone: "9876543210",
      address: { id: "addr-home", name: "Aisha Menon", phone: "9876543210", line1: "14, Coconut Avenue", line2: "Indiranagar", city: "Bengaluru", state: "Karnataka", pin: "560038" },
      items: [{ slug: "cake-mould-round", name: "Teflon Cake Mould, Round", price: 860, color: "Black", hex: "#2A2925", size: "20 cm", quantity: 1 }],
      delivery: "standard",
      payment: "upi",
      subtotal: 860,
      discount: 0,
      shipping: 99,
      codFee: 0,
      total: 959,
      status: "Delivered",
      timeline: [
        { status: "Confirmed", date: daysAgo(4) },
        { status: "Delivered", date: daysAgo(2) },
      ],
      customerId: aisha?.id,
    },
    {
      id: "order-pack",
      number: "EH-10423",
      createdAt: new Date(daysAgo(1)),
      email: "leela@example.com",
      phone: "9811122233",
      address: { name: "Leela Nair", phone: "9811122233", line1: "14, Coconut Avenue", line2: "", city: "Kochi", state: "Kerala", pin: "682001" },
      items: [{ slug: "grill-round", name: "Charcoal Grill, Round", price: 5290, color: "Black", hex: "#2A2925", size: "Standard", quantity: 1 }],
      delivery: "standard",
      payment: "upi",
      subtotal: 5290,
      discount: 0,
      shipping: 0,
      codFee: 0,
      total: 5290,
      status: "Packed",
      timeline: [
        { status: "Confirmed", date: daysAgo(1) },
        { status: "Packed", date: daysAgo(0) },
      ],
    },
  ];
  for (const order of orders) {
    await prisma.order.upsert({
      where: { id: order.id },
      create: order,
      update: { items: order.items, subtotal: order.subtotal, total: order.total },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
