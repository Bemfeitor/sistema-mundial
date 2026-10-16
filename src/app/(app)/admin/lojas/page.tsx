import Link from "next/link";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Table, Td } from "@/components/ui";
import { Flash } from "@/components/gestao/kit";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { one, type SearchParams } from "@/lib/gestao/util";
import { salvarLoja } from "@/lib/gestao/admin-actions";

export default async function Lojas({ searchParams }: { searchParams: SearchParams }) {
  await requireUser("administrar");
  const sp = await searchParams;
  const [stores, employees] = await Promise.all([db().list("stores", { order: { column: "code" } }), db().list("employees")]);
  const edit = stores.find((s) => s.id === one(sp.edit));

  return (
    <div>
      <PageHeader title="Lojas" subtitle="Unidades da rede" />
      <Flash sp={sp} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table head={["Código", "Loja", "CNPJ", "Telefone", "Endereço", "Equipe", "Situação", ""]}>
            {stores.map((s) => (
              <tr key={s.id}>
                <Td className="font-semibold">{s.code}</Td>
                <Td className="font-medium">{s.name}</Td>
                <Td className="text-xs">{s.cnpj ?? "—"}</Td>
                <Td className="text-xs">{s.phone ?? "—"}</Td>
                <Td className="text-xs">{s.address ?? "—"}</Td>
                <Td>{employees.filter((e) => e.store_id === s.id && e.active).length}</Td>
                <Td>{s.active ? <Badge tone="green">Ativa</Badge> : <Badge>Inativa</Badge>}</Td>
                <Td><Link href={`/admin/lojas?edit=${s.id}`} className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50">Editar</Link></Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card className="h-fit">
          <CardHeader title={edit ? `Editar: ${edit.name}` : "Nova loja"} action={edit ? <Link href="/admin/lojas" className="text-xs text-brand-700">Nova</Link> : undefined} />
          <form action={salvarLoja} className="grid gap-3 p-5" key={edit?.id ?? "nova"}>
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Código"><Input name="code" required maxLength={6} defaultValue={edit?.code} placeholder="L3" /></Field>
              <Field label="Nome" className="col-span-2"><Input name="name" required defaultValue={edit?.name} /></Field>
            </div>
            <Field label="CNPJ"><Input name="cnpj" defaultValue={edit?.cnpj ?? ""} placeholder="00.000.000/0000-00" /></Field>
            <Field label="Telefone"><Input name="phone" defaultValue={edit?.phone ?? ""} /></Field>
            <Field label="Endereço"><Input name="address" defaultValue={edit?.address ?? ""} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={edit?.active ?? true} /> Ativa</label>
            <Button>Salvar</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
