/** Valida CPF com dígitos verificadores. */
export function validarCpf(cpf: string): boolean {
  const n = cpf.replace(/\D/g, "");
  if (n.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(n)) return false;
  const d = (s: string, m: number) => {
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += Number(s[i]) * (m - i);
    const r = (sum * 10) % 11;
    return r === 10 || r === 11 ? 0 : r;
  };
  return d(n.slice(0, 9), 10) === Number(n[9]) && d(n.slice(0, 10), 11) === Number(n[10]);
}

export function formatarCpf(cpf: string): string {
  const n = cpf.replace(/\D/g, "").slice(0, 11);
  return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function formatarTelefone(t: string): string {
  const n = t.replace(/\D/g, "").slice(0, 11);
  if (n.length === 11) return n.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (n.length === 10) return n.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return n;
}

export function validarTelefone(t: string): boolean {
  const n = t.replace(/\D/g, "");
  return n.length === 10 || n.length === 11;
}
