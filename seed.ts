import { PrismaClient, CurrencyCode, StoreStatus, StaffRole, PromoStatus, PromoType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Roles
  const roles = [
    { code: "ADMIN", name: "المالك" },
    { code: "TENANT", name: "صاحب متجر" },
    { code: "CUSTOMER", name: "عميل" },
    { code: "STAFF", name: "موظف" },
  ];
  for (const r of roles) {
    await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name },
      create: r,
    });
  }

  const pw = await bcrypt.hash("123456", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@mall.com" },
    update: {},
    create: { name: "Admin", email: "admin@mall.com", passwordHash: pw },
  });

  const tenant = await prisma.user.upsert({
    where: { email: "tenant@mall.com" },
    update: {},
    create: { name: "Tenant Owner", email: "tenant@mall.com", passwordHash: pw },
  });

  const staffSales = await prisma.user.upsert({
    where: { email: "sales@mall.com" },
    update: {},
    create: { name: "Sales Staff", email: "sales@mall.com", passwordHash: pw },
  });

  const customer = await prisma.user.upsert({
    where: { email: "customer@mall.com" },
    update: {},
    create: { name: "Customer", email: "customer@mall.com", passwordHash: pw },
  });

  const roleByCode = async (code: string) => (await prisma.role.findUniqueOrThrow({ where: { code } })).id;

  const linkRole = async (userId: bigint, code: string) => {
    const rid = await roleByCode(code);
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: rid } },
      update: {},
      create: { userId, roleId: rid },
    });
  };

  await linkRole(admin.id, "ADMIN");
  await linkRole(tenant.id, "TENANT");
  await linkRole(customer.id, "CUSTOMER");
  await linkRole(staffSales.id, "STAFF");

  const wings = [
    { name: "الملابس", slug: "fashion", sortOrder: 1 },
    { name: "الإلكترونيات", slug: "electronics", sortOrder: 2 },
    { name: "المفروشات والأثاث", slug: "furniture", sortOrder: 3 },
  ];

  for (const w of wings) {
    await prisma.wing.upsert({
      where: { slug: w.slug },
      update: { name: w.name, sortOrder: w.sortOrder, status: true },
      create: { name: w.name, slug: w.slug, sortOrder: w.sortOrder, status: true },
    });
  }

  const furniture = await prisma.wing.findUniqueOrThrow({ where: { slug: "furniture" } });

  const store = await prisma.store.upsert({
    where: { slug: "jubi" },
    update: { status: StoreStatus.ACTIVE, currency: CurrencyCode.YER },
    create: {
      wingId: furniture.id,
      ownerUserId: tenant.id,
      name: "الجوبي للمفروشات",
      slug: "jubi",
      description: "متجر مفروشات وأثاث",
      currency: CurrencyCode.YER,
      status: StoreStatus.ACTIVE,
      signboardUrl: "https://example.com/signboard.png",
    },
  });

  await prisma.storeStaff.upsert({
    where: { storeId_userId: { storeId: store.id, userId: staffSales.id } },
    update: { role: StaffRole.SALES, status: true },
    create: { storeId: store.id, userId: staffSales.id, role: StaffRole.SALES, status: true },
  });

  const section = await prisma.storeSection.upsert({
    where: { storeId_name: { storeId: store.id, name: "غرف نوم" } },
    update: { status: true, sortOrder: 1 },
    create: { storeId: store.id, name: "غرف نوم", sortOrder: 1, status: true },
  });

  const product = await prisma.product.create({
    data: {
      storeId: store.id,
      sectionId: section.id,
      name: "غرفة نوم مودرن — 6 قطع",
      description: "وصف تجريبي",
      basePrice: "150000",
      currency: CurrencyCode.YER,
      status: true,
      images: {
        create: [
          { imageUrl: "https://images.unsplash.com/photo-1505691723518-36a5ac3b2d43?auto=format&fit=crop&w=1200&q=80", sortOrder: 1 },
        ],
      },
    },
  });

  const v1 = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: "BD-102-W-180",
      priceOverride: null,
      status: true,
      attributes: { create: [{ attributeName: "لون", attributeValue: "أبيض" }, { attributeName: "مقاس", attributeValue: "180×200" }] },
      inventory: { create: { stockQty: 5, lowStockThreshold: 3 } },
    },
  });

  await prisma.promotion.create({
    data: {
      storeId: store.id,
      title: "خصم 20% على غرف النوم",
      type: PromoType.PERCENT,
      value: "20",
      status: PromoStatus.ACTIVE,
      createdById: tenant.id,
      approvedById: admin.id,
      priority: 10,
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
