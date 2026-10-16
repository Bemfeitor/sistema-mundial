"use client";
import { useState } from "react";
import { PERMISSIONS, type Permission, type Role } from "@/lib/types";
import { DISCOUNT_PRESETS, PERMISSION_LABEL, ROLES, ROLE_PRESETS } from "@/lib/gestao/presets";
import { LABEL } from "@/lib/format";

/** Perfil + permissões com presets por perfil. */
export function PermissionsEditor({ role: initialRole, permissions, discount, isNew }: { role: Role; permissions: Permission[]; discount: number; isNew: boolean }) {
  const [role, setRole] = useState<Role>(initialRole);
  const [perms, setPerms] = useState<Set<Permission>>(new Set(permissions));
  const [disc, setDisc] = useState(String(discount));
  const apply = (r: Role) => {
    setPerms(new Set(ROLE_PRESETS[r]));
    setDisc(String(DISCOUNT_PRESETS[r]));
  };
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Perfil</span>
          <select
            name="role"
            value={role}
            onChange={(e) => {
              const r = e.target.value as Role;
              setRole(r);
              if (isNew) apply(r);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{LABEL[r] ?? r}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Limite de desconto (%)</span>
          <input name="discount_limit" type="number" min={0} max={100} step="0.5" value={disc} onChange={(e) => setDisc(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Permissões</span>
          <button type="button" onClick={() => apply(role)} className="rounded px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
            Aplicar padrão de {LABEL[role] ?? role}
          </button>
        </div>
        <div className="grid gap-1.5 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
          {PERMISSIONS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="perm"
                value={p}
                checked={perms.has(p)}
                onChange={(e) => {
                  const n = new Set(perms);
                  if (e.target.checked) n.add(p);
                  else n.delete(p);
                  setPerms(n);
                }}
              />
              {PERMISSION_LABEL[p]}
            </label>
          ))}
        </div>
        {role === "admin" && <p className="mt-1 text-xs text-slate-500">Administradores têm acesso total independentemente das caixas marcadas.</p>}
      </div>
    </div>
  );
}
