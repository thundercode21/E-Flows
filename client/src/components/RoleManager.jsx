import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const RoleManagerToast = ({ toast }) => {
  if (!toast.text) return null;
  return (
    <div className="fixed top-6 right-6 z-[80]">
      <div className={`px-6 py-4 rounded-xl shadow-2xl border-l-4 font-semibold text-sm flex items-center gap-3 ${toast.type === 'error' ? 'bg-white border-red-500 text-red-700' : 'bg-white border-green-500 text-green-700'}`}>
        <span className="text-xl">{toast.type === 'error' ? '🚨' : '✅'}</span>
        {toast.text}
      </div>
    </div>
  );
};

// =============================================
// Pitfall 1 & 2 FIX: Impact Report Modal
// Shows affected entities before sealing a role.
// =============================================
const ImpactReportModal = ({ role, onClose, onConfirmSeal, showToast }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await api.get(`/admin/roles/${role.id}/impact`);
        setReport(res.data);
      } catch (err) {
        showToast('error', 'Failed to load impact report.');
        onClose();
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [role.id, onClose, showToast]);

  const canSeal = report && report.in_flight_documents === 0;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-800 mb-1">Role Impact Report</h2>
        <p className="text-sm text-gray-500 mb-4">
          Sealing <span className="font-semibold text-indigo-600">"{role.name}"</span> will zero out all its permissions.
        </p>

        {loading ? (
          <p className="text-gray-500 text-center py-8">Analyzing impact...</p>
        ) : (
          <>
            <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200 mb-4">
              <ReportRow
                label="👤 Users with this role"
                value={report.users}
                danger={report.users > 0}
              />
              <ReportRow
                label="📄 In-flight documents (blocking)"
                value={report.in_flight_documents}
                danger={report.in_flight_documents > 0}
              />
              <ReportRow
                label="📋 Audit log references"
                value={report.audit_log_entries}
                danger={false}
              />
              <div className="px-4 py-3">
                <p className="text-sm text-gray-600 font-medium">🔄 Affected Workflows</p>
                {report.affected_workflows.length === 0 ? (
                  <p className="text-xs text-gray-400 mt-1">None</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {report.affected_workflows.map((wf) => (
                      <li key={wf.id} className="text-xs text-orange-600 font-medium">• {wf.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {!canSeal && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-700 font-medium">
                  ⛔ Cannot seal: {report.in_flight_documents} document(s) are currently in-flight at this role's step.
                  Reassign or complete them first.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirmSeal}
                disabled={!canSeal}
                className={`flex-1 px-4 py-2 rounded-lg font-bold text-white transition-colors ${canSeal
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-gray-300 cursor-not-allowed'
                  }`}
              >
                🔒 Seal Role
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const ReportRow = ({ label, value, danger }) => (
  <div className="flex justify-between items-center px-4 py-3">
    <span className="text-sm text-gray-600">{label}</span>
    <span className={`text-sm font-bold ${danger && value > 0 ? 'text-red-600' : 'text-gray-800'}`}>
      {value}
    </span>
  </div>
);

// =============================================
// Main RoleManager Component
// =============================================
const RoleManager = () => {
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [newRole, setNewRole] = useState({
    name: '',
    department_id: '',
    can_create_workflows: false,
    requires_workflow_approval: true,
    can_manage_users: false,
  });

  // Pitfall 1 & 2: Impact modal state
  const [impactTarget, setImpactTarget] = useState(null);
  const [toast, setToast] = useState({ type: '', text: '' });

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast({ type: '', text: '' }), 4000);
  };

  const fetchData = useCallback(async () => {
    try {
      const [deptRes, rolesRes] = await Promise.all([
        api.get('/admin/departments'),
        api.get('/admin/roles'),
      ]);
      setDepartments(deptRes.data);
      setRoles(rolesRes.data);
    } catch (error) {
      console.error('Failed to load hierarchy data', error);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    try {
      await api.post('/admin/departments', { name: newDeptName });
      setNewDeptName('');
      fetchData();
    } catch (err) {
      showToast('error', err.response?.data?.message || 'Failed to create department');
    }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    if (!newRole.name.trim()) { showToast('error', 'Role name is required.'); return; }
    try {
      await api.post('/admin/roles', {
        ...newRole,
        department_id: newRole.department_id === '' ? null : newRole.department_id,
      });
      setNewRole({ name: '', department_id: '', can_create_workflows: false, requires_workflow_approval: true, can_manage_users: false });
      showToast('success', `Role "${newRole.name}" created successfully!`);
      fetchData();
    } catch (err) {
      showToast('error', err.response?.data?.message || 'Failed to create role');
    }
  };

  // Pitfall 2 FIX: Actual sealing call (only proceeds if Impact Report allows it)
  const handleSealRole = async () => {
    if (!impactTarget) return;
    try {
      await api.delete(`/admin/roles/${impactTarget.id}`);
      showToast('success', `Role "${impactTarget.name}" has been sealed successfully.`);
      setImpactTarget(null);
      fetchData();
    } catch (err) {
      showToast('error', err.response?.data?.message || 'Failed to seal role');
    }
  };

  // Pitfall 5 FIX: Designate a role as the escalation fallback
  const handleSetFallback = async (roleId, roleName) => {
    if (!window.confirm(`Set "${roleName}" as the Escalation Fallback role? Only one role can hold this designation at a time.`)) return;
    try {
      await api.put(`/admin/roles/${roleId}/fallback`);
      showToast('success', `"${roleName}" set as the Escalation Fallback role.`);
      fetchData();
    } catch (err) {
      showToast('error', err.response?.data?.message || 'Failed to set fallback role');
    }
  };

  return (
    <>
      {/* Toast */}
      <RoleManagerToast toast={toast} />
      {/* Pitfall 1 & 2 FIX: Impact Report Modal */}
      {impactTarget && (
        <ImpactReportModal
          role={impactTarget}
          onClose={() => setImpactTarget(null)}
          onConfirmSeal={handleSealRole}
          showToast={showToast}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* LEFT COLUMN: Departments */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">University Departments</h3>
          <form onSubmit={handleCreateDepartment} className="flex gap-2 mb-6">
            <input
              type="text" placeholder="e.g. Computer Science" value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              className="flex-grow px-3 py-2 border rounded focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700 shadow-sm">Add</button>
          </form>

          <ul className="divide-y divide-gray-100">
            {departments.map(dept => (
              <li key={dept.id} className="py-3 text-gray-700 font-medium flex items-center before:content-['🏢'] before:mr-3">
                {dept.name}
              </li>
            ))}
            {departments.length === 0 && <p className="text-gray-500 text-sm">No departments created yet.</p>}
          </ul>
        </div>

        {/* RIGHT COLUMN: Custom Roles */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">Dynamic Roles</h3>

          <form onSubmit={handleCreateRole} className="mb-8 space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Role Title</label>
                <input type="text" placeholder="e.g. Department Head" value={newRole.name}
                  onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Scope (Optional)</label>
                <select value={newRole.department_id}
                  onChange={(e) => setNewRole({ ...newRole, department_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded bg-white">
                  <option value="">-- Global / Cross-Department --</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={newRole.can_create_workflows}
                  onChange={(e) => setNewRole({ ...newRole, can_create_workflows: e.target.checked })}
                  className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                <span className="text-sm font-medium text-gray-800">Can Create & Edit Workflows</span>
              </label>
              {newRole.can_create_workflows && (
                <label className="flex items-center space-x-3 cursor-pointer pl-8">
                  <input type="checkbox" checked={newRole.requires_workflow_approval}
                    onChange={(e) => setNewRole({ ...newRole, requires_workflow_approval: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                  <span className="text-sm font-medium text-gray-600">Workflows require Admin Approval before activating</span>
                </label>
              )}
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={newRole.can_manage_users}
                  onChange={(e) => setNewRole({ ...newRole, can_manage_users: e.target.checked })}
                  className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                <span className="text-sm font-medium text-gray-800">Can Manage Users & Permissions</span>
              </label>
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded font-bold hover:bg-indigo-700 shadow-sm mt-4">
              Generate Custom Role
            </button>
          </form>

          <div className="overflow-y-auto max-h-72">
            <ul className="divide-y divide-gray-100">
              {roles.map(role => (
                <li key={role.id} className={`py-3 px-1 ${!role.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-bold ${role.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                          {role.name}
                        </span>
                        {/* Pitfall 5 FIX: Escalation Fallback badge */}
                        {role.is_escalation_fallback && (
                          <span className="text-[10px] font-bold uppercase bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                            🛟 Fallback
                          </span>
                        )}
                        {!role.is_active && (
                          <span className="text-[10px] font-bold uppercase bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                            🔒 Sealed
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 text-[10px] uppercase font-bold text-gray-500 tracking-wider mt-1 flex-wrap">
                        <span className="text-gray-400">{role.department_name || 'Global'}</span>
                        {role.can_create_workflows && <span className="text-indigo-600">Workflows</span>}
                        {role.can_manage_users && <span className="text-green-600">Users</span>}
                      </div>
                    </div>

                    {role.is_active && (
                      <div className="flex gap-1 shrink-0">
                        {/* Pitfall 5 FIX: Set as Escalation Fallback */}
                        {!role.is_escalation_fallback && (
                          <button
                            onClick={() => handleSetFallback(role.id, role.name)}
                            title="Set as Escalation Fallback"
                            className="text-xs px-2 py-1 rounded border border-orange-300 text-orange-600 hover:bg-orange-50 font-medium"
                          >
                            🛟 Fallback
                          </button>
                        )}
                        {/* Pitfall 1 & 2 FIX: Open Impact Report first before sealing */}
                        <button
                          onClick={() => setImpactTarget(role)}
                          title="View Impact Report & Seal Role"
                          className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 font-medium"
                        >
                          🔒 Seal
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
              {roles.length === 0 && <p className="text-gray-500 text-sm">No custom roles created.</p>}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default RoleManager;