import { redirect } from "next/navigation";
import { db, isSupabaseConfigured } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { label } from "@/lib/format";
import { loginDemo, loginPassword } from "@/app/actions/session";
import { Button, Card, Field, Input, Notice, Select } from "@/components/ui";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await currentUser()) redirect("/");
  const { erro } = await searchParams;
  const supa = isSupabaseConfigured() && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const employees = supa ? [] : await db().list("employees", { eq: { active: true }, order: { column: "name" } });
  return (
    <div className="grid min-h-screen place-items-center bg-brand-900 px-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold tracking-[0.25em] text-brand-900">MUNDIAL</div>
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">Ótica · Sistema unificado</div>
        </div>
        {erro && (
          <div className="mb-4">
            <Notice tone="red">
              {erro === "credenciais" ? "E-mail ou senha inválidos." : erro === "codigo" ? "Código de acesso incorreto." : "Usuário inválido."}
            </Notice>
          </div>
        )}
        {supa ? (
          <form action={loginPassword} className="space-y-4">
            <Field label="E-mail">
              <Input name="email" type="email" required autoComplete="username" />
            </Field>
            <Field label="Senha">
              <Input name="password" type="password" required autoComplete="current-password" />
            </Field>
            <Button className="w-full">Entrar</Button>
          </form>
        ) : (
          <form action={loginDemo} className="space-y-4">
            <Notice tone="amber">
              Modo demonstração: Supabase ainda não configurado. Escolha um perfil para testar as permissões. Dados fictícios.
            </Notice>
            <Field label="Entrar como">
              <Select name="employee_id" defaultValue={employees[0]?.id}>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {label(e.role)}
                  </option>
                ))}
              </Select>
            </Field>
            {process.env.DEMO_ACCESS_CODE && (
              <Field label="Código de acesso">
                <Input name="access_code" type="password" required autoComplete="off" />
              </Field>
            )}
            <Button className="w-full">Entrar</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
