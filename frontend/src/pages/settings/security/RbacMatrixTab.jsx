import { useSettingsGroup } from '../../../hooks/useSettingsGroup';
import { mergedMatrix, ROLES, ROLE_LABELS, PERMISSION_DEFS } from '../../../utils/permissions';
import SectionCard from '../../../components/settings/SectionCard';
import SaveBar from '../../../components/settings/SaveBar';

export default function RbacMatrixTab() {
  const { draft, setValue, save, reset, saving, saved, error } = useSettingsGroup('rbac', 'rbac');
  if (!draft) return <p className="text-gray-500">Loading…</p>;

  const matrix = mergedMatrix(draft.matrix);
  const toggle = (role, key, checked) => setValue('matrix', { ...draft.matrix, [role]: { ...(draft.matrix?.[role] || {}), [key]: checked } });
  const roleAll = (role, checked) => setValue('matrix', { ...draft.matrix, [role]: Object.fromEntries(PERMISSION_DEFS.map((p) => [p.key, checked])) });

  return (
    <div>
      <SectionCard title="Permission matrix" description="Role × permission matrix. This controls what each role can see and do in the interface. Server-side role checks are always enforced regardless of this matrix.">
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left font-semibold p-2 min-w-56">Permission</th>
                {ROLES.map((r) => (
                  <th key={r} className="font-semibold p-2 text-center min-w-28 capitalize">{ROLE_LABELS[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_DEFS.map((p) => (
                <tr key={p.key} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="p-2">
                    <span className="font-medium">{p.label}</span>
                    <span className="block text-xs text-gray-400">{p.description}</span>
                  </td>
                  {ROLES.map((r) => (
                    <td key={r} className="p-2 text-center">
                      <input type="checkbox" checked={!!matrix[r][p.key]}
                        onChange={(e) => toggle(r, p.key, e.target.checked)} className="mt-1" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {ROLES.map((r) => (
            <button key={r} onClick={() => roleAll(r, true)} className="btn btn-sm capitalize">Allow all · {ROLE_LABELS[r]}</button>
          ))}
          {ROLES.map((r) => (
            <button key={r} onClick={() => roleAll(r, false)} className="btn btn-sm capitalize">Revoke all · {ROLE_LABELS[r]}</button>
          ))}
        </div>
        <SaveBar onSave={() => save()} onReset={reset} saving={saving} saved={saved} error={error} saveLabel="Save matrix" />
      </SectionCard>
    </div>
  );
}