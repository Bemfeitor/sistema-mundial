import Link from "next/link";
import { Mail } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, LinkButton, Notice, PageHeader, Select, Table, Td } from "@/components/ui";
import { Flash } from "@/components/gestao/kit";
import { PermissionsEditor } from "@/components/gestao/permissions-editor";
import { requireUser } from "@/lib/session";
import { db, isSupabaseConfigured } from "@/lib/db";
import { label } from "@/lib/format";
import { CATEGORY_KEYS, mapBy, one, type SearchParams } from "@/lib/gestao/util";
import { alternarUsuario, convidarUsuario, salvarUsuario } from "@/lib/gestao/admin-actions";

export default async function Usuarios({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireUser("administrar");
  const sp = await searchParams;
  const d = db();
  const [employees, departments] = await Promise.all([d.list("employees", { order: { column: "name" } }), d.list("departments", { order: { column: "name" } })]);
  const dept = mapBy(departments);
  const edit = employees.find((e) => e.id === one(sp.edit));
  const showForm = !!edit || one(sp.novo) === "1";
  const q = one(sp.q).toLowerCase();
  const list = employees.filter((e) => !q || `${e.name} ${e.email}`.toLowerCase().includes(q));
  const storeName = (id: string) => ctx.stores.find((s) => s.id === id)?.name ?? "—";
  const rule = (cat: string) => edit?.commission_rules.find((r) => r.category === cat)?.percent;
  const supa = isSupabaseConfigured();

  return (
    <div>
      <PageHeader title="Usuários e vendedores" subtitle="Cadastro, perfis, permissões, limite de desconto e comissões" actions={<LinkButton href="/admin/usuarios?novo=1">Novo usuário</LinkButton>} />
      <Flash sp={sp} />
      <div className="mb-4">
        <Notice tone={supa ? "blue" : "amber"}>
          {supa
            ? "Com o Supabase conectado, o login usa e-mail e senha do Supabase Auth. O vínculo com o cadastro é feito pelo e-mail — use “Enviar convite” para o usuário definir a senha."
            : "Modo demonstração: o login é feito escolhendo o usuário na tela de entrada. Quando o Supabase for conectado, o login passa a ser por e-mail/senha (Supabase Auth), vinculado pelo e-mail cadastrado aqui."}
        </Notice>
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <Card className={showForm ? "xl:col-span-3" : "xl:col-span-5"}>
          <CardHeader
            title={`${employees.length} usuários`}
            action={
              <form className="flex gap-2">
                <Input name="q" defaultValue={one(sp.q)} placeholder="Buscar nome ou e-mail" className="py-1.5" />
              </form>
            }
          />
          <Table head={["Nome", "Perfil", "Loja", "Departamento", "Desconto", "Situação", ""]}>
            {list.map((e) => (
              <tr key={e.id} className={e.id === edit?.id ? "bg-brand-50/50" : ""}>
                <Td>
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-slate-500">{e.email}</div>
                </Td>
                <Td><Badge tone={e.role === "admin" ? "violet" : e.role === "gerente" ? "blue" : "slate"}>{label(e.role)}</Badge></Td>
                <Td className="text-xs">{storeName(e.store_id)}</Td>
                <Td className="text-xs">{e.department_id ? dept.get(e.department_id)?.name ?? "—" : "—"}</Td>
                <Td>{e.discount_limit}%</Td>
                <Td>{e.active ? <Badge tone="green">Ativo</Badge> : <Badge>Inativo</Badge>}</Td>
                <Td>
                  <div className="flex gap-1">
                    <Link href={`/admin/usuarios?edit=${e.id}`} className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50">Editar</Link>
                    {e.id !== ctx.user.id && (
                      <form action={alternarUsuario}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">{e.active ? "Desativar" : "Ativar"}</button>
                      </form>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
        {showForm && (
          <Card className="xl:col-span-2">
            <CardHeader
              title={edit ? `Editar: ${edit.name}` : "Novo usuário"}
              action={
                edit && (
                  <form action={convidarUsuario}>
                    <input type="hidden" name="id" value={edit.id} />
                    <Button variant="secondary" className="px-2.5 py-1 text-xs" title={edit.auth_user_id ? "Usuário já vinculado ao Supabase Auth" : undefined}>
                      <Mail className="size-3.5" /> {edit.auth_user_id ? "Reenviar convite" : "Enviar convite"}
                    </Button>
                  </form>
                )
              }
            />
            <form action={salvarUsuario} className="grid gap-3 p-5" key={edit?.id ?? "novo"}>
              {edit && <input type="hidden" name="id" value={edit.id} />}
              <Field label="Nome completo"><Input name="name" required defaultValue={edit?.name} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="E-mail (login)"><Input name="email" type="email" required defaultValue={edit?.email} /></Field>
                <Field label="Telefone"><Input name="phone" defaultValue={edit?.phone ?? ""} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Loja padrão">
                  <Select name="store_id" defaultValue={edit?.store_id ?? ctx.storeId ?? ctx.user.store_id}>
                    {ctx.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
                <Field label="Departamento">
                  <Select name="department_id" defaultValue={edit?.department_id ?? ""}>
                    <option value="">—</option>
                    {departments.filter((x) => x.active || x.id === edit?.department_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </Select>
                </Field>
              </div>
              <PermissionsEditor role={edit?.role ?? "vendedor"} permissions={edit?.permissions ?? ["vender", "desconto", "clientes", "fidelidade", "crm", "os"]} discount={edit?.discount_limit ?? 10} isNew={!edit} />
              <div>
                <div className="mb-1 text-sm font-medium text-slate-700">Comissão por categoria (%)</div>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-4">
                  {["*", ...CATEGORY_KEYS].map((c) => (
                    <label key={c} className="text-xs text-slate-600">
                      {c === "*" ? "Padrão (demais)" : label(c)}
                      <Input name={`com_${c}`} inputMode="decimal" defaultValue={rule(c) ?? ""} className="mt-0.5 py-1" placeholder="—" />
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">A regra da categoria prevalece sobre a padrão. Em branco = sem comissão específica.</p>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={edit?.active ?? true} /> Ativo</label>
              <div className="flex gap-2">
                <Button>{edit ? "Salvar alterações" : "Cadastrar usuário"}</Button>
                <LinkButton href="/admin/usuarios" variant="ghost">Fechar</LinkButton>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
