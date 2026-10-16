import Link from "next/link";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Table, Td } from "@/components/ui";
import { Flash } from "@/components/gestao/kit";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { one, type SearchParams } from "@/lib/gestao/util";
import { salvarConvenio } from "@/lib/gestao/admin-actions";

export default async function Convenios({ searchParams }: { searchParams: SearchParams }) {
  await requireUser("administrar");
  const sp = await searchParams;
  const [insurers, customers] = await Promise.all([db().list("insurers", { order: { column: "name" } }), db().list("customers")]);
  const edit = insurers.find((s) => s.id === one(sp.edit));

  return (
    <div>
      <PageHeader title="Convênios" subtitle="Empresas e convênios com desconto" />
      <Flash sp={sp} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table head={["Convênio", "Desconto", "Contato", "Clientes", "Situação", ""]} empty="Nenhum convênio cadastrado.">
            {insurers.map((s) => (
              <tr key={s.id}>
                <Td className="font-medium">{s.name}</Td>
                <Td>{s.discount_percent}%</Td>
                <Td className="text-xs">{s.contact ?? "—"}</Td>
                <Td>{customers.filter((c) => c.insurer_id === s.id).length}</Td>
                <Td>{s.active ? <Badge tone="green">Ativo</Badge> : <Badge>Inativo</Badge>}</Td>
                <Td><Link href={`/admin/convenios?edit=${s.id}`} className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50">Editar</Link></Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card className="h-fit">
          <CardHeader title={edit ? `Editar: ${edit.name}` : "Novo convênio"} action={edit ? <Link href="/admin/convenios" className="text-xs text-brand-700">Novo</Link> : undefined} />
          <form action={salvarConvenio} className="grid gap-3 p-5" key={edit?.id ?? "novo"}>
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <Field label="Nome"><Input name="name" required defaultValue={edit?.name} /></Field>
            <Field label="Desconto (%)"><Input name="discount_percent" inputMode="decimal" defaultValue={edit?.discount_percent ?? 10} /></Field>
            <Field label="Contato"><Input name="contact" defaultValue={edit?.contact ?? ""} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={edit?.active ?? true} /> Ativo</label>
            <Button>Salvar</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
