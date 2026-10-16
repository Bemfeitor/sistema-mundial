import { LinkButton } from "@/components/ui";

export default function SemPermissao() {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <h1 className="text-xl font-bold">Sem permissão</h1>
        <p className="mt-2 text-sm text-slate-500">Seu perfil não tem acesso a esta área. Fale com o administrador.</p>
        <LinkButton href="/" className="mt-4">
          Voltar ao início
        </LinkButton>
      </div>
    </div>
  );
}
