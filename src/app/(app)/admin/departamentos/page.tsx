import Link from "next/link";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { Flash } from "@/components/gestao/kit";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { label } from "@/lib/format";
import { one, type SearchParams } from "@/lib/gestao/util";
import { excluirDepartamento, salvarDepartamento } from "@/lib/gestao/admin-actions";

export default async function Departamentos({ searchParams }: { searchParams: SearchParams }) {
  await requireUser("administrar");
  const sp = await searchParams;
  const d = db();
  const [departments, employees] = await Promise.all([d.list("departments", { order: { column: "name" } }), d.list("employees", { order: { column: "name" } })]);
  const edit = departments.find((x) => x.id === one(sp.edit));
  const noDept = employees.filter((e) => !e.department_id || !departments.some((x) => x.id === e.department_id));

  return (
    <div>
      <PageHeader title="Departamentos" subtitle="Organização da equipe e usuários por departamento" />
      <Flash sp={sp} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          {departments.map((dep) => {
            const users = employees.filter((e) => e.department_id === dep.id);
            return (
              <Card key={dep.id} className={dep.active ? "" : "opacity-60"}>
                <CardHeader
                  title={dep.name}
                  subtitle={dep.description ?? `${users.length} usuário(s)`}
                  action={
                    <div className="flex items-center gap-1">
                      {!dep.active && <Badge>Inativo</Badge>}
                      <Link href={`/admin/departamentos?edit=${dep.id}`} className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50">Editar</Link>
                      <form action={excluirDepartamento}>
                        <input type="hidden" name="id" value={dep.id} />
                        <button className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">Excluir</button>
                      </form>
                    </div>
                  }
                />
                <ul className="divide-y divide-slate-100">
                  {users.length ? (
                    users.map((u) => (
                      <li key={u.id} className="flex items-center justify-between px-5 py-2 text-sm">
                        <Link href={`/admin/usuarios?edit=${u.id}`} className="hover:underline">{u.name}</Link>
                        <span className="text-xs text-slate-500">{label(u.role)}{u.active ? "" : " · inativo"}</span>
                      </li>
                    ))
                  ) : (
                    <li className="px-5 py-3 text-sm text-slate-500">Nenhum usuário.</li>
                  )}
                </ul>
              </Card>
            );
          })}
          {noDept.length > 0 && (
            <Card>
              <CardHeader title="Sem departamento" />
              <ul className="divide-y divide-slate-100">
                {noDept.map((u) => (
                  <li key={u.id} className="px-5 py-2 text-sm"><Link href={`/admin/usuarios?edit=${u.id}`} className="hover:underline">{u.name}</Link></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <Card className="h-fit">
          <CardHeader title={edit ? `Editar: ${edit.name}` : "Novo departamento"} action={edit ? <Link href="/admin/departamentos" className="text-xs text-brand-700">Novo</Link> : undefined} />
          <form action={salvarDepartamento} className="grid gap-3 p-5" key={edit?.id ?? "novo"}>
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <Field label="Nome"><Input name="name" required defaultValue={edit?.name} /></Field>
            <Field label="Descrição"><Textarea name="description" defaultValue={edit?.description ?? ""} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={edit?.active ?? true} /> Ativo</label>
            <Button>Salvar</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
