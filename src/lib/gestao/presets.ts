import type { Permission, Role } from "@/lib/types";

export const ROLES: Role[] = ["admin", "gerente", "vendedor", "caixa", "optometrista", "tecnico", "financeiro", "estoquista"];

export const PERMISSION_LABEL: Record<Permission, string> = {
  vender: "Vender (balcão, vendas, orçamentos)",
  desconto: "Conceder desconto",
  caixa: "Operar caixa",
  financeiro: "Financeiro",
  estoque: "Estoque",
  compras: "Compras e fornecedores",
  os: "OS / laboratório",
  clientes: "Clientes e agenda",
  fidelidade: "Fidelidade e cashback",
  crm: "CRM e mensagens",
  relatorios: "Relatórios, metas e comissões",
  consolidado: "Ver todas as lojas (consolidado)",
  administrar: "Administração do sistema",
};

export const ROLE_PRESETS: Record<Role, Permission[]> = {
  admin: ["vender", "desconto", "caixa", "financeiro", "estoque", "compras", "os", "clientes", "fidelidade", "crm", "relatorios", "consolidado", "administrar"],
  gerente: ["vender", "desconto", "caixa", "financeiro", "estoque", "compras", "os", "clientes", "fidelidade", "crm", "relatorios", "consolidado"],
  vendedor: ["vender", "desconto", "clientes", "fidelidade", "crm", "os"],
  caixa: ["caixa", "financeiro", "clientes", "vender"],
  optometrista: ["clientes", "os"],
  tecnico: ["os", "estoque"],
  financeiro: ["financeiro", "caixa", "relatorios", "compras", "consolidado"],
  estoquista: ["estoque", "compras", "os"],
};

export const DISCOUNT_PRESETS: Record<Role, number> = {
  admin: 100, gerente: 20, vendedor: 10, caixa: 0, optometrista: 0, tecnico: 0, financeiro: 0, estoquista: 0,
};
