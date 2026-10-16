// Dados fictícios de demonstração (modo sem Supabase). Mesma estrutura de supabase/seed.sql.
import type * as T from "@/lib/types";

let seedN = 42;
const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
const pick = <X,>(a: X[]) => a[Math.floor(rnd() * a.length)];
const iso = (d: Date) => d.toISOString();
const day = (offset: number, h = 10) => {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};
const ymd = (d: Date) => d.toISOString().slice(0, 10);
// UUID válido e determinístico: hash do prefixo (por tabela) + número sequencial
const uid = (p: string, n: number) => {
  let h = 2166136261;
  for (const ch of p) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `${h.toString(16).padStart(8, "0")}-${n.toString(16).padStart(4, "0")}-4000-8000-000000000000`;
};

export function buildSeed() {
  seedN = 42;
  const created_at = iso(day(-120));

  const stores: T.Store[] = [
    { id: uid("aaaa0001", 1), created_at, name: "Loja 1 — Centro", code: "L1", phone: "(43) 3000-0001", address: "Rua Principal, 100", active: true },
    { id: uid("aaaa0002", 2), created_at, name: "Loja 2 — Shopping", code: "L2", phone: "(43) 3000-0002", address: "Shopping, loja 210", active: true },
  ];
  const [L1, L2] = stores.map((s) => s.id);

  const deptNames = ["Vendas", "Optometria", "Laboratório e montagem", "Financeiro", "Estoque e compras", "Administração"];
  const departments: T.Department[] = deptNames.map((name, i) => ({ id: uid("dddd0000", i + 1), created_at, name, active: true }));
  const D = (n: string) => departments.find((d) => d.name === n)!.id;

  const all = [...([
    "vender", "desconto", "caixa", "financeiro", "estoque", "compras", "os", "clientes", "fidelidade", "crm", "relatorios", "consolidado", "administrar",
  ] as T.Permission[])];
  const sellerPerms: T.Permission[] = ["vender", "desconto", "clientes", "fidelidade", "crm", "os"];
  const emp = (i: number, name: string, role: T.Role, store: string, dept: string, permissions: T.Permission[], discount: number): T.Employee => ({
    id: uid("eeee0000", i), created_at, name, email: `${name.split(" ")[0].toLowerCase()}@otica.demo`, role, store_id: store,
    department_id: D(dept), permissions, discount_limit: discount,
    commission_rules: role === "vendedor" || role === "gerente" ? [{ category: "*", percent: 3 }, { category: "lente", percent: 5 }] : [],
    active: true,
  });
  const employees: T.Employee[] = [
    emp(1, "Gestor Mundial", "admin", L1, "Administração", all, 100),
    emp(2, "Marina Duarte", "gerente", L2, "Vendas", all.filter((p) => p !== "administrar"), 20),
    emp(3, "Bruna Melo", "vendedor", L1, "Vendas", sellerPerms, 10),
    emp(4, "Alex Monteiro", "vendedor", L1, "Vendas", sellerPerms, 10),
    emp(5, "Carla Nunes", "vendedor", L2, "Vendas", sellerPerms, 10),
    emp(6, "Rosa Silveira", "caixa", L2, "Financeiro", ["caixa", "financeiro", "clientes"], 0),
    emp(7, "Dr. Paulo Lima", "optometrista", L1, "Optometria", ["clientes", "os"], 0),
    emp(8, "Daniel Costa", "tecnico", L1, "Laboratório e montagem", ["os", "estoque"], 0),
  ];
  const sellers = employees.filter((e) => e.role === "vendedor" || e.role === "gerente");

  const insurers: T.Insurer[] = [
    { id: uid("iiii0000", 1), created_at, name: "Convênio Servidores", discount_percent: 15, active: true },
    { id: uid("iiii0000", 2), created_at, name: "Empresa Parceira", discount_percent: 10, active: true },
  ];

  const suppliers: T.Supplier[] = [
    { id: uid("ssss0000", 1), created_at, name: "Laboratório Óptico Norte", kind: "laboratorio", lead_days: 7, phone: "(43) 3300-1000", active: true },
    { id: uid("ssss0000", 2), created_at, name: "Lab Digital Free-Form", kind: "laboratorio", lead_days: 10, active: true },
    { id: uid("ssss0000", 3), created_at, name: "Distribuidora de Armações Sul", kind: "distribuidor", lead_days: 5, active: true },
    { id: uid("ssss0000", 4), created_at, name: "Lentes de Contato Brasil", kind: "fornecedor", lead_days: 3, active: true },
  ];
  const [LAB1, LAB2, DIST, LC] = suppliers.map((s) => s.id);

  let pn = 0;
  const prod = (p: Omit<T.Product, "id" | "created_at" | "active" | "sku">): T.Product => ({
    id: uid("pppp0000", ++pn), created_at, sku: `SKU${String(pn).padStart(4, "0")}`, active: true, ...p,
  });
  const products: T.Product[] = [
    // lentes — pacotes (preço do par)
    prod({ name: "Visão simples 1.50 antirreflexo", category: "lente", brand: "Linha Própria", line: "VS Essencial", tier: "essencial", supplier_id: LAB1, price_cents: 29000, cost_cents: 9000, lens: { type: "visao_simples", index: 1.5, treatments: ["antirreflexo"], sph_min: -6, sph_max: 4, cyl_max: -2, lab_days: 5 } }),
    prod({ name: "Visão simples 1.59 filtro azul", category: "lente", brand: "Linha Própria", line: "VS Conforto", tier: "conforto", supplier_id: LAB1, price_cents: 49000, cost_cents: 15000, lens: { type: "visao_simples", index: 1.59, treatments: ["antirreflexo", "filtro_azul"], sph_min: -8, sph_max: 6, cyl_max: -4, lab_days: 7, blue_filter: true } }),
    prod({ name: "Visão simples 1.67 premium", category: "lente", brand: "Marca Premium", line: "VS Premium", tier: "premium", supplier_id: LAB2, price_cents: 89000, cost_cents: 30000, lens: { type: "visao_simples", index: 1.67, treatments: ["antirreflexo_premium", "filtro_azul", "hidrofobico"], sph_min: -12, sph_max: 8, cyl_max: -6, lab_days: 10, blue_filter: true } }),
    prod({ name: "Visão simples 1.74 ultrafina", category: "lente", brand: "Marca Premium", line: "VS Ultra", tier: "premium", supplier_id: LAB2, price_cents: 139000, cost_cents: 52000, lens: { type: "visao_simples", index: 1.74, treatments: ["antirreflexo_premium", "hidrofobico"], sph_min: -16, sph_max: 10, cyl_max: -6, lab_days: 12 } }),
    prod({ name: "Visão simples fotossensível", category: "lente", brand: "Marca Premium", line: "Foto", tier: "conforto", supplier_id: LAB2, price_cents: 79000, cost_cents: 27000, lens: { type: "visao_simples", index: 1.56, treatments: ["antirreflexo", "fotossensivel"], sph_min: -8, sph_max: 6, cyl_max: -4, lab_days: 10, photochromic: true } }),
    prod({ name: "Multifocal Essencial", category: "lente", brand: "Linha Própria", line: "Multi Essencial", tier: "essencial", supplier_id: LAB1, price_cents: 89000, cost_cents: 28000, lens: { type: "multifocal", index: 1.56, treatments: ["antirreflexo"], sph_min: -6, sph_max: 4, cyl_max: -2, lab_days: 7 } }),
    prod({ name: "Multifocal Digital Conforto", category: "lente", brand: "Marca Premium", line: "Multi Digital", tier: "conforto", supplier_id: LAB2, price_cents: 169000, cost_cents: 55000, lens: { type: "multifocal", index: 1.59, treatments: ["antirreflexo", "filtro_azul"], sph_min: -8, sph_max: 6, cyl_max: -4, lab_days: 10, blue_filter: true } }),
    prod({ name: "Multifocal Personalizada Premium", category: "lente", brand: "Marca Premium", line: "Multi Personalizada", tier: "premium", supplier_id: LAB2, price_cents: 289000, cost_cents: 98000, lens: { type: "multifocal", index: 1.67, treatments: ["antirreflexo_premium", "filtro_azul", "hidrofobico"], sph_min: -10, sph_max: 8, cyl_max: -6, lab_days: 12, blue_filter: true } }),
    prod({ name: "Ocupacional (computador)", category: "lente", brand: "Marca Premium", line: "Office", tier: "conforto", supplier_id: LAB2, price_cents: 119000, cost_cents: 40000, lens: { type: "ocupacional", index: 1.59, treatments: ["antirreflexo", "filtro_azul"], sph_min: -6, sph_max: 4, lab_days: 10, blue_filter: true } }),
    prod({ name: "Lente infantil policarbonato", category: "lente", brand: "Linha Própria", line: "Kids", tier: "conforto", supplier_id: LAB1, price_cents: 45000, cost_cents: 14000, lens: { type: "visao_simples", index: 1.59, treatments: ["antirreflexo", "antirrisco", "uv400"], sph_min: -8, sph_max: 6, lab_days: 7 }, tags: ["crianca", "resistente"] }),
    // armações
    ...[
      ["Aurora acetato", "Linha Própria", 32000, 9000, "acetato", "redondo", "F", "essencial"],
      ["Clássica metal", "Linha Própria", 28000, 8000, "metal", "retangular", "M", "essencial"],
      ["Urban TR90 flexível", "Marca Fashion", 45000, 15000, "TR90", "quadrado", "U", "conforto"],
      ["Titanium leve", "Marca Fashion", 79000, 28000, "titânio", "retangular", "M", "premium"],
      ["Gatinho acetato", "Marca Fashion", 52000, 17000, "acetato", "gatinho", "F", "conforto"],
      ["Kids flexível", "Linha Kids", 22000, 6000, "silicone", "redondo", "U", "essencial"],
      ["Grife acetato italiano", "Grife", 129000, 52000, "acetato", "quadrado", "U", "premium"],
      ["Sem aro (parafusada)", "Marca Fashion", 69000, 24000, "titânio", "oval", "U", "premium"],
    ].map(([n, b, p, c, mat, shape, gen, tier]) =>
      prod({ name: `Armação ${n}`, category: "armacao", brand: b as string, tier: tier as T.Product["tier"], supplier_id: DIST, price_cents: p as number, cost_cents: c as number, frame: { model: n as string, material: mat as string, shape: shape as string, gender: gen as string, size: "52-18-140" }, tags: shape === "redondo" && gen === "U" && (b as string).includes("Kids") ? ["crianca"] : [] }),
    ),
    // solares
    prod({ name: "Óculos de sol polarizado", category: "solar", brand: "Marca Fashion", tier: "conforto", supplier_id: DIST, price_cents: 39000, cost_cents: 12000, tags: ["polarizado", "uv400"] }),
    prod({ name: "Solar de grife", category: "solar", brand: "Grife", tier: "premium", supplier_id: DIST, price_cents: 99000, cost_cents: 45000, tags: ["uv400"] }),
    prod({ name: "Clip-on magnético polarizado", category: "acessorio", brand: "Marca Fashion", supplier_id: DIST, price_cents: 15000, cost_cents: 4000 }),
    // lentes de contato
    prod({ name: "Lente de contato mensal (cx 6)", category: "lente_contato", brand: "LC Brasil", supplier_id: LC, price_cents: 18000, cost_cents: 7000 }),
    prod({ name: "Lente de contato diária (cx 30)", category: "lente_contato", brand: "LC Brasil", supplier_id: LC, price_cents: 22000, cost_cents: 9000 }),
    prod({ name: "Lente de contato tórica (cx 6)", category: "lente_contato", brand: "LC Brasil", supplier_id: LC, price_cents: 26000, cost_cents: 10000 }),
    // acessórios e serviços
    prod({ name: "Solução multiuso 360 ml", category: "acessorio", brand: "LC Brasil", supplier_id: LC, price_cents: 4500, cost_cents: 1800 }),
    prod({ name: "Estojo rígido premium", category: "acessorio", brand: "Linha Própria", supplier_id: DIST, price_cents: 6000, cost_cents: 1500 }),
    prod({ name: "Spray limpa-lentes + flanela", category: "acessorio", brand: "Linha Própria", supplier_id: DIST, price_cents: 3500, cost_cents: 800 }),
    prod({ name: "Cordão / segura-óculos", category: "acessorio", brand: "Linha Própria", supplier_id: DIST, price_cents: 2500, cost_cents: 500 }),
    prod({ name: "Garantia estendida 12 meses", category: "servico", brand: "Ótica Mundial", price_cents: 9000, cost_cents: 0 }),
    prod({ name: "Exame de vista (optometria)", category: "servico", brand: "Ótica Mundial", price_cents: 12000, cost_cents: 0 }),
    prod({ name: "Ajuste e manutenção", category: "servico", brand: "Ótica Mundial", price_cents: 0, cost_cents: 0 }),
  ];

  const stock: T.StockItem[] = [];
  let sn = 0;
  for (const p of products.filter((p) => p.category !== "servico" && p.category !== "lente"))
    for (const s of [L1, L2])
      stock.push({ id: uid("kkkk0000", ++sn), created_at, product_id: p.id, store_id: s, qty: Math.floor(rnd() * 14), min_qty: 3 });

  const first = ["Helena", "Roberto", "Cláudia", "Antônio", "Beatriz", "Mariana", "Eduardo", "Lúcia", "Carlos", "Patrícia", "Ana", "José", "Renata", "Paulo", "Camila", "Márcia", "Fernando", "Juliana", "Ricardo", "Sofia", "Pedro", "Larissa", "Gustavo", "Aline", "Mateus"];
  const last = ["Almeida", "Martins", "Ribeiro", "Costa", "Oliveira", "Santos", "Lima", "Fernandes", "Souza", "Rodrigues", "Moreira", "Carvalho"];
  const customers: T.Customer[] = first.map((f, i) => {
    const birthYear = 1950 + Math.floor(rnd() * 60);
    const bd = new Date(birthYear, i % 12, (i % 27) + 1);
    if (i < 3) bd.setMonth(new Date().getMonth()); // aniversariantes do mês
    return {
      id: uid("cccc0000", i + 1), created_at, name: `${f} ${pick(last)}`, cpf: null,
      phone: `4399900${String(1000 + i)}`, email: null, birth: ymd(bd),
      gender: ["Helena", "Cláudia", "Beatriz", "Mariana", "Lúcia", "Patrícia", "Ana", "Renata", "Camila", "Márcia", "Juliana", "Sofia", "Larissa", "Aline"].includes(f) ? "F" : "M",
      store_id: i % 2 ? L2 : L1, seller_id: pick(sellers).id, insurer_id: i % 7 === 0 ? insurers[0].id : null,
      level: (["Novo", "Silver", "Gold", "Black", "VIP"] as T.CustomerLevel[])[i % 5],
      card_token: `card_${(i + 1).toString(36)}_${Math.floor(rnd() * 1e9).toString(36)}`,
      consent_program: true, consent_marketing: i % 3 !== 0, consent_version: "outubro/2026", city: "Londrina",
    };
  });

  const prescriptions: T.Prescription[] = customers.slice(0, 18).map((c, i) => {
    const exam = day(-(30 + i * 40));
    const presby = c.birth! < "1981-01-01";
    return {
      id: uid("rrrr0000", i + 1), created_at, customer_id: c.id, exam_date: ymd(exam),
      valid_until: ymd(new Date(exam.getTime() + 365 * 864e5)), professional: "Dr. Paulo Lima",
      od: { sph: -(i % 6) * 0.75, cyl: -(i % 3) * 0.5, axis: 180 - i * 5, add: presby ? 1.5 + (i % 3) * 0.5 : null, dnp: 31, height: 18 },
      oe: { sph: -(i % 5) * 0.75, cyl: -(i % 2) * 0.75, axis: 170, add: presby ? 1.5 + (i % 3) * 0.5 : null, dnp: 31.5, height: 18 },
    };
  });

  const lenses = products.filter((p) => p.category === "lente");
  const frames = products.filter((p) => p.category === "armacao");
  const extras = products.filter((p) => p.category === "acessorio" || p.category === "servico" || p.category === "solar");
  const sales: T.Sale[] = [];
  const lab_orders: T.LabOrder[] = [];
  const receivables: T.Receivable[] = [];
  const benefits: T.Benefit[] = [];
  const benefit_movements: T.BenefitMovement[] = [];
  const toItem = (p: T.Product, role: T.SaleItem["role"]): T.SaleItem => ({ product_id: p.id, name: p.name, category: p.category, qty: 1, price_cents: p.price_cents, cost_cents: p.cost_cents, role });
  for (let i = 0; i < 48; i++) {
    const c = customers[i % customers.length];
    const seller = sellers.find((s) => s.store_id === c.store_id) ?? sellers[0];
    const when = day(-Math.floor(i * 0.7), 9 + (i % 9));
    const items = [toItem(pick(frames), "principal"), toItem(pick(lenses), "principal")];
    if (i % 3 === 0) items.push(toItem(pick(extras), "adicional"));
    const subtotal = items.reduce((a, it) => a + it.price_cents, 0);
    const discount = i % 4 === 0 ? Math.round(subtotal * 0.05) : 0;
    const total = subtotal - discount;
    const method = pick<T.PaymentMethod>(["pix", "credito_parcelado", "debito", "dinheiro", "credito_parcelado", "crediario"]);
    const sale: T.Sale = {
      id: uid("vvvv0000", i + 1), created_at: iso(when), number: `V${1000 + i}`, store_id: c.store_id, customer_id: c.id, seller_id: seller.id,
      items, subtotal_cents: subtotal, discount_cents: discount, total_cents: total, cost_cents: items.reduce((a, it) => a + it.cost_cents, 0),
      payments: [{ method, amount_cents: total, installments: method === "credito_parcelado" ? 6 : 1 }],
      commission_cents: Math.round(total * 0.04), cashback_cents: total >= 29900 ? Math.round(total * 0.03) : 0, status: "concluida",
      warranty_until: ymd(new Date(when.getTime() + 365 * 864e5)),
    };
    sales.push(sale);
    if (method === "crediario")
      receivables.push({ id: uid("bbbb0000", i + 1), created_at: sale.created_at, store_id: sale.store_id, customer_id: c.id, sale_id: sale.id, description: `Crediário ${sale.number} 1/3`, due_at: ymd(day(-5 + (i % 20))), amount_cents: Math.round(total / 3), paid_cents: 0, status: i % 5 === 0 ? "vencido" : "aberto" });
    if (i < 14) {
      const st = T_LAB[i % T_LAB.length];
      lab_orders.push({
        id: uid("oooo0000", i + 1), created_at: sale.created_at, number: `OS${2000 + i}`, sale_id: sale.id, store_id: sale.store_id, customer_id: c.id,
        supplier_id: i % 2 ? LAB2 : LAB1, description: `${items[1].name} + ${items[0].name}`, status: st, due_at: ymd(day(-2 + i)),
        responsible_id: employees[7].id, checklist: {}, history: [{ at: sale.created_at, status: "aguardando_pedido" }, ...(st !== "aguardando_pedido" ? [{ at: iso(day(-1)), status: st }] : [])],
      });
    }
    if (sale.cashback_cents && i < 20) {
      const b: T.Benefit = { id: uid("ffff0000", i + 1), created_at: sale.created_at, customer_id: c.id, kind: "cashback", name: "Cashback Mundial vale Mais", initial_cents: sale.cashback_cents, remaining_cents: sale.cashback_cents, available_at: sale.created_at, expires_at: iso(new Date(when.getTime() + 60 * 864e5)), campaign_id: uid("gggg0000", 1), sale_id: sale.id };
      benefits.push(b);
      benefit_movements.push({ id: uid("hhhh0000", i + 1), created_at: sale.created_at, benefit_id: b.id, customer_id: c.id, amount_cents: b.initial_cents, reason: `Compra ${sale.number}`, sale_id: sale.id });
    }
  }

  const campaigns: T.Campaign[] = [
    { id: uid("gggg0000", 1), created_at, name: "Mundial vale Mais", active: true, percent: 3, min_cents: 29900, max_cents: 20000, valid_days: 60, delay_days: 0, max_use_percent: 30, categories: [], store_id: null, starts_at: ymd(day(-30)), ends_at: "2026-12-31" },
  ];

  const payCats = ["Aluguel", "Fornecedor - lentes", "Fornecedor - armações", "Energia", "Folha", "Marketing", "Impostos"];
  const payables: T.Payable[] = payCats.flatMap((cat, i) =>
    [L1, L2].map((s, j) => ({ id: uid("qqqq0000", i * 2 + j + 1), created_at, store_id: s, supplier_id: cat.startsWith("Fornecedor") ? (cat.includes("lentes") ? LAB1 : DIST) : null, category: cat, description: `${cat} ${s === L1 ? "Loja 1" : "Loja 2"}`, due_at: ymd(day(-3 + i * 4 + j)), amount_cents: [450000, 380000, 210000, 65000, 900000, 120000, 230000][i], paid_cents: 0, status: (i < 1 ? "vencido" : "aberto") as T.Payable["status"] })),
  );

  const month = ymd(new Date()).slice(0, 7);
  const goals: T.Goal[] = [
    { id: uid("mmmm0000", 1), created_at, store_id: L1, employee_id: null, month, target_cents: 6000000 },
    { id: uid("mmmm0000", 2), created_at, store_id: L2, employee_id: null, month, target_cents: 5000000 },
    ...sellers.map((s, i) => ({ id: uid("mmmm0000", i + 3), created_at, store_id: s.store_id, employee_id: s.id, month, target_cents: 2500000 })),
  ];

  const appointments: T.Appointment[] = customers.slice(0, 6).map((c, i) => ({
    id: uid("jjjj0000", i + 1), created_at, store_id: c.store_id, customer_id: c.id, customer_name: c.name, phone: c.phone,
    professional_id: employees[6].id, starts_at: iso(day(i % 3, 9 + i)), kind: i % 4 === 3 ? "entrega" : "exame", status: i % 2 ? "confirmado" : "agendado",
  }));

  const opportunities: T.Opportunity[] = [
    { id: uid("llll0000", 1), created_at, customer_id: customers[6].id, store_id: L1, owner_id: employees[2].id, kind: "cashback", status: "nova", next_contact_at: ymd(day(0)), note: "Cashback disponível — convidar para conhecer coleção" },
    { id: uid("llll0000", 2), created_at, customer_id: customers[11].id, store_id: L2, owner_id: employees[4].id, kind: "reexame", status: "em_contato", next_contact_at: ymd(day(1)), note: "Receita vencendo — agendar exame" },
    { id: uid("llll0000", 3), created_at, customer_id: customers[3].id, store_id: L1, owner_id: employees[3].id, kind: "orcamento", status: "nova", next_contact_at: ymd(day(2)), note: "Orçou multifocal digital, ficou de pensar" },
  ];

  const messages: T.Message[] = [
    { id: uid("nnnn0000", 1), created_at, customer_id: customers[6].id, kind: "cashback", channel: "whatsapp", text: `Olá, ${customers[6].name.split(" ")[0]}! Você tem cashback para usar na Ótica Mundial. 😊`, status: "para_validar", prepared_by: employees[2].id },
    { id: uid("nnnn0000", 2), created_at, customer_id: customers[2].id, kind: "oculos_pronto", channel: "whatsapp", text: `Olá, ${customers[2].name.split(" ")[0]}! Seus óculos estão prontos para retirada.`, status: "para_validar", prepared_by: employees[7].id },
  ];

  const cash_sessions: T.CashSession[] = [
    { id: uid("xxxx0000", 1), created_at: iso(day(0, 8)), store_id: L1, opened_by: employees[0].id, opening_cents: 20000, status: "aberto" },
  ];

  return {
    stores, departments, employees, customers, prescriptions, suppliers, products, stock,
    stock_movements: [] as T.StockMovement[], transfers: [] as T.Transfer[], purchase_orders: [] as T.PurchaseOrder[],
    sales, lab_orders, quotes: [] as T.Quote[], opportunities, messages, receivables, payables, cash_sessions,
    cash_movements: [] as T.CashMovement[], campaigns, benefits, benefit_movements, goals, appointments, insurers,
    audit_log: [] as T.AuditLog[], agent_tokens: [] as T.AgentToken[],
  } satisfies { [K in T.TableName]: T.TableMap[K][] };
}

const T_LAB: T.LabStatus[] = ["aguardando_pedido", "pedido_enviado", "em_producao", "em_montagem", "conferencia", "pronto", "entregue"];
