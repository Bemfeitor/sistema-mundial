import type { Permission } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // nome do ícone lucide (mapeado em Sidebar)
  perm?: Permission;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: "Atendimento",
    items: [
      { href: "/atendimento", label: "Balcão (ajuda ao vendedor)", icon: "Sparkles", perm: "vender" },
      { href: "/simulador", label: "Simulador de lentes", icon: "Glasses" },
    ],
  },
  {
    title: "Vendas",
    items: [
      { href: "/vendas/nova", label: "Nova venda", icon: "ShoppingCart", perm: "vender" },
      { href: "/vendas", label: "Vendas", icon: "Receipt", perm: "vender" },
      { href: "/orcamentos", label: "Orçamentos", icon: "FileText", perm: "vender" },
      { href: "/os", label: "Óculos / laboratório", icon: "Wrench", perm: "os" },
      { href: "/caixa", label: "Caixa", icon: "Wallet", perm: "caixa" },
    ],
  },
  {
    title: "Clientes",
    items: [
      { href: "/clientes", label: "Clientes", icon: "Users", perm: "clientes" },
      { href: "/fidelidade", label: "Fidelidade e cashback", icon: "Gift", perm: "fidelidade" },
      { href: "/crm", label: "CRM", icon: "Target", perm: "crm" },
      { href: "/mensagens", label: "Mensagens", icon: "MessageCircle", perm: "crm" },
      { href: "/agenda", label: "Agenda de exames", icon: "CalendarDays", perm: "clientes" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { href: "/", label: "Painel", icon: "LayoutDashboard" },
      { href: "/estoque", label: "Estoque", icon: "Boxes", perm: "estoque" },
      { href: "/compras", label: "Compras", icon: "Truck", perm: "compras" },
      { href: "/fornecedores", label: "Fornecedores e labs", icon: "Factory", perm: "compras" },
      { href: "/financeiro", label: "Financeiro", icon: "Landmark", perm: "financeiro" },
      { href: "/metas", label: "Metas e comissões", icon: "Trophy", perm: "relatorios" },
      { href: "/relatorios", label: "Relatórios", icon: "BarChart3", perm: "relatorios" },
    ],
  },
  {
    title: "Administração",
    items: [
      { href: "/admin/usuarios", label: "Usuários e vendedores", icon: "UserCog", perm: "administrar" },
      { href: "/admin/departamentos", label: "Departamentos", icon: "Network", perm: "administrar" },
      { href: "/admin/lojas", label: "Lojas", icon: "Store", perm: "administrar" },
      { href: "/admin/catalogo", label: "Catálogo", icon: "Package", perm: "administrar" },
      { href: "/admin/convenios", label: "Convênios", icon: "Handshake", perm: "administrar" },
      { href: "/admin/agente", label: "Agente de IA (MCP)", icon: "Bot", perm: "administrar" },
      { href: "/admin/auditoria", label: "Auditoria", icon: "ShieldCheck", perm: "administrar" },
    ],
  },
];
