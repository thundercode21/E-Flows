import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactFlow, {
  addEdge, applyNodeChanges, applyEdgeChanges, Background, Controls, MiniMap,
  Handle, Position, MarkerType, ReactFlowProvider, useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import api from '../api';

// ==========================================
// 1. NODE DEFINITIONS (COMPACT CARDS)
// ==========================================

// Base Node Wrapper for consistent styling
const BaseNode = ({ id, typeName, icon, bgColor, borderColor, textColor, title, badge, selected }) => (
  <div className={`rounded-md shadow-sm border-2 ${selected ? 'border-blue-600 shadow-md ring-2 ring-blue-300' : borderColor} bg-white flex overflow-hidden w-[180px]`}>
    {/* Colored left strip */}
    <div className={`w-2 ${bgColor}`}></div>
    <div className="flex-1 p-2 bg-white flex flex-col justify-center">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{icon}</span>
        <span className={`text-[10px] uppercase font-bold tracking-wider ${textColor}`}>{typeName}</span>
      </div>
      <div className="text-xs font-bold text-gray-800 truncate">{title || 'Untitled Node'}</div>
      {badge && (
        <div className="mt-1.5 bg-gray-100 text-[9px] text-gray-600 px-1.5 py-0.5 rounded uppercase font-bold truncate">
          {badge}
        </div>
      )}
    </div>
  </div>
);

// 1. Task (Approval) Node
const TaskNode = ({ id, data, selected }) => {
  let badgeText = '⚠️ Unassigned';

  if (data.assignmentStrategy === 'role_based') {
    const roleName = data.rolesList?.find(r => r.id === parseInt(data.roleId))?.name || 'Role';
    if (data.routingType === 'ANY') badgeText = `👥 Any ${roleName}`;
    else if (data.routingType === 'INITIATOR_DEPT') badgeText = `🏢 Dept ${roleName}`;
    else if (data.routingType === 'SPECIFIC') {
      const deptName = data.departments?.find(d => d.id === parseInt(data.targetDepartmentId))?.name || 'Dept';
      badgeText = `🏢 ${deptName} ${roleName}`;
    }
  } else if (data.assignee) {
    badgeText = `👤 ${data.staffList?.find(s => s.id === parseInt(data.assignee))?.name || 'User'}`;
  }

  return (
    <>
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-blue-500" />
      <BaseNode id={id} typeName="Approval" icon="🟦" bgColor="bg-blue-500" borderColor="border-blue-200" textColor="text-blue-600" title={data.label} badge={badgeText} selected={selected} />
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-blue-500" />
    </>
  );
};

// 2. Condition Node (If/Else)
const ConditionNode = ({ id, data, selected }) => (
  <>
    <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-amber-500" />
    <BaseNode id={id} typeName="Condition" icon="🔀" bgColor="bg-amber-500" borderColor="border-amber-200" textColor="text-amber-600" title={data.label || 'If/Else'} badge={data.conditionValue ? `Tags: ${data.conditionValue}` : 'No tags set'} selected={selected} />
    <Handle type="source" position={Position.Bottom} id="true" style={{ left: '25%', background: '#22c55e', width: '10px', height: '10px' }} />
    <div className="absolute -bottom-4 left-[15%] text-[9px] font-bold text-green-600">TRUE</div>
    <Handle type="source" position={Position.Bottom} id="false" style={{ left: '75%', background: '#ef4444', width: '10px', height: '10px' }} />
    <div className="absolute -bottom-4 left-[65%] text-[9px] font-bold text-red-600">FALSE</div>
  </>
);

// 3. Email Notification Node
const EmailNode = ({ id, data, selected }) => (
  <>
    <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-green-500" />
    <BaseNode id={id} typeName="Email" icon="📧" bgColor="bg-green-500" borderColor="border-green-200" textColor="text-green-600" title={data.label || 'Send Email'} badge={data.recipient ? `To: ${data.recipient}` : 'No recipient'} selected={selected} />
    <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-green-500" />
  </>
);

// 4. Delay / Timer Node
const DelayNode = ({ id, data, selected }) => (
  <>
    <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-purple-500" />
    <BaseNode id={id} typeName="Delay" icon="⏳" bgColor="bg-purple-500" borderColor="border-purple-200" textColor="text-purple-600" title={data.label || 'Wait'} badge={data.delayHours ? `⏳ ${data.delayHours} hrs` : 'No delay set'} selected={selected} />
    <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-purple-500" />
  </>
);

// 5. Parallel Split Node
const ParallelNode = ({ id, data, selected }) => (
  <>
    <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-orange-500" />
    <BaseNode id={id} typeName="Parallel" icon="⑂" bgColor="bg-orange-500" borderColor="border-orange-200" textColor="text-orange-600" title={data.label || 'Split Paths'} badge="Run concurrently" selected={selected} />
    {/* Multiple outgoing standard handles (could be custom, but basic allows many connections) */}
    <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-orange-500" />
  </>
);


// 6. Spawn Node
const SpawnNode = ({ id, data, selected }) => (
  <>
    <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-pink-500" />
    <BaseNode id={id} typeName="Spawn" icon="🚀" bgColor="bg-pink-500" borderColor="border-pink-200" textColor="text-pink-600" title={data.label || 'Spawn Workflows'} badge={data.spawnIds ? `${data.spawnIds.split(',').length} Flows` : 'Unconfigured'} selected={selected} />
    <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-pink-500" />
  </>
);

// ==========================================
// 2b. EMAIL PROPERTIES SUB-COMPONENT
// ==========================================
const EMAIL_VARS = ['{{submitter_email}}', '{{submitter_name}}', '{{document_title}}'];

const EmailProperties = ({ data, onChange }) => {
  const recipientRef = useRef(null);
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const [activeField, setActiveField] = useState(null);
  const [activeRef, setActiveRef] = useState(null);

  const insertVariable = (varText) => {
    const field = activeField || 'body';
    const ref = activeRef || bodyRef;
    const el = ref.current;
    if (!el) {
      onChange(field, (data[field] || '') + varText);
      return;
    }
    const start = el.selectionStart ?? (data[field] || '').length;
    const end = el.selectionEnd ?? start;
    const current = data[field] || '';
    onChange(field, current.slice(0, start) + varText + current.slice(end));
    requestAnimationFrame(() => {
      if (el) {
        el.selectionStart = start + varText.length;
        el.selectionEnd = start + varText.length;
        el.focus();
      }
    });
  };

  return (
    <>
      <div className="bg-green-50 border border-green-200 rounded p-2">
        <p className="text-[10px] font-bold text-green-800 mb-1.5">⚡ Click to Insert Variable</p>
        <div className="flex flex-wrap gap-1">
          {EMAIL_VARS.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => insertVariable(v)}
              className="text-[10px] bg-green-100 hover:bg-green-200 active:bg-green-300 text-green-800 border border-green-300 px-1.5 py-0.5 rounded font-mono cursor-pointer transition-colors"
            >
              {v}
            </button>
          ))}
        </div>
        <p className="text-[9px] text-green-600 mt-1">Click a field first, then click a variable to insert it at your cursor.</p>
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-1">Recipient Address</label>
        <input
          ref={recipientRef}
          type="text" value={data.recipient || ''}
          onChange={e => onChange('recipient', e.target.value)}
          onFocus={() => { setActiveField('recipient'); setActiveRef(recipientRef); }}
          className="w-full text-sm border rounded p-2"
          placeholder="{{submitter_email}} or user@domain.com"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-1">Subject</label>
        <input
          ref={subjectRef}
          type="text" value={data.subject || ''}
          onChange={e => onChange('subject', e.target.value)}
          onFocus={() => { setActiveField('subject'); setActiveRef(subjectRef); }}
          className="w-full text-sm border rounded p-2"
          placeholder="Update on document"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-1">Body Template</label>
        <textarea
          ref={bodyRef}
          value={data.body || ''}
          onChange={e => onChange('body', e.target.value)}
          onFocus={() => { setActiveField('body'); setActiveRef(bodyRef); }}
          className="w-full text-sm border rounded p-2 h-28"
          placeholder="Dear {{submitter_name}}, your application for '{{document_title}}' has been reviewed..."
        />
      </div>
    </>
  );
};

// ==========================================
// 2. RIGHT INSPECTOR PANEL
// ==========================================
const PropertyInspector = ({ selectedNode, updateNodeData, closePanel, staffList = [], rolesList = [], departments = [], savedWorkflows = [], selectedWorkflowId = '' }) => {
  // Hooks MUST be called before any early returns (React rules of hooks)
  const [newCheckItem, setNewCheckItem] = useState('');
  const [rolePreviewUsers, setRolePreviewUsers] = useState([]);
  const [rolePreviewLoading, setRolePreviewLoading] = useState(false);

  const data = selectedNode?.data || {};

  // Live preview: fetch matching users whenever role + department filter changes
  useEffect(() => {
    if (!selectedNode || selectedNode.type !== 'task') return;
    if (data.assignmentStrategy !== 'role_based' || !data.roleId) {
      setRolePreviewUsers([]);
      return;
    }
    // For INITIATOR_DEPT we can't know the department at design time — show all in role
    const deptId = data.routingType === 'SPECIFIC' ? data.targetDepartmentId : null;

    setRolePreviewLoading(true);
    const params = new URLSearchParams({ roleId: data.roleId });
    if (deptId) params.append('departmentId', deptId);

    api.get(`/admin/users/by-role?${params.toString()}`)
      .then(res => setRolePreviewUsers(res.data))
      .catch(() => setRolePreviewUsers([]))
      .finally(() => setRolePreviewLoading(false));
  }, [selectedNode?.id, data.assignmentStrategy, data.roleId, data.routingType, data.targetDepartmentId]);

  if (!selectedNode) return null;

  const onChange = (field, value) => updateNodeData(selectedNode.id, field, value);

  const addChecklistItem = () => {
    if (newCheckItem.trim()) {
      onChange('checklist', [...(data.checklist || []), newCheckItem.trim()]);
      setNewCheckItem('');
    }
  };
  const removeChecklistItem = (idx) => {
    onChange('checklist', (data.checklist || []).filter((_, i) => i !== idx));
  };

  const getSmartDropdownValue = () => {
    if (data.assignmentStrategy === 'specific_user' && data.assignee) return `USER:${data.assignee}`;
    if (data.assignmentStrategy === 'role_based' && data.roleId) {
      if (data.routingType === 'INITIATOR_DEPT') return `ROLE:INITIATOR_DEPT:${data.roleId}`;
      if (data.routingType === 'SPECIFIC' && data.targetDepartmentId) return `ROLE:SPECIFIC:${data.roleId}:${data.targetDepartmentId}`;
      if (data.routingType === 'ANY') return `ROLE:ANY:${data.roleId}`;
    }
    return '';
  };

  const handleSmartDropdownChange = (val) => {
    if (!val) {
      onChange('assignmentStrategy', null);
      onChange('assignee', null);
      onChange('roleId', null);
      onChange('routingType', null);
      onChange('targetDepartmentId', null);
      return;
    }
    const parts = val.split(':');
    if (parts[0] === 'USER') {
      onChange('assignmentStrategy', 'specific_user');
      onChange('assignee', parts[1]);
      onChange('roleId', null);
      onChange('routingType', null);
      onChange('targetDepartmentId', null);
    } else if (parts[0] === 'ROLE') {
      onChange('assignmentStrategy', 'role_based');
      onChange('assignee', null);
      onChange('roleId', parts[2]);
      onChange('routingType', parts[1]);
      onChange('targetDepartmentId', parts[1] === 'SPECIFIC' ? parts[3] : null);
    }
  };

  return (
    <div className="w-72 bg-white border-l border-gray-200 shadow-xl h-full flex flex-col fixed right-0 top-0 z-50 pt-16">
      <div className="flex justify-between items-center px-4 py-3 border-b bg-gray-50">
        <h3 className="font-bold text-gray-800 text-sm">Node Properties</h3>
        <button onClick={closePanel} className="text-gray-400 hover:text-gray-700 font-bold">&times;</button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-5">

        {/* Common: Label */}
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">Node Name</label>
          <input
            type="text" value={data.label || ''} onChange={(e) => onChange('label', e.target.value)}
            className="w-full text-sm border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500 border bg-white"
          />
        </div>

        {/* 1. TASK PROPERTIES */}
        {selectedNode.type === 'task' && (
          <>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Who Should Complete This Step?</label>
              <select
                value={getSmartDropdownValue()}
                onChange={(e) => handleSmartDropdownChange(e.target.value)}
                className="w-full text-sm border-gray-300 rounded p-2 border bg-white mb-2 shadow-sm"
              >
                <option value="">-- Select Assignee --</option>
                
                <optgroup label="Applicant's Department (Dynamic)">
                  {rolesList.filter(r => (r.is_active || r.id <= 3) && r.can_approve !== false).map(r => (
                    <option key={`dyn-${r.id}`} value={`ROLE:INITIATOR_DEPT:${r.id}`}>Applicant's {r.name}</option>
                  ))}
                </optgroup>

                {departments.map(d => (
                  <optgroup key={`dept-${d.id}`} label={d.name}>
                    {rolesList.filter(r => (r.is_active || r.id <= 3) && r.can_approve !== false).map(r => (
                      <option key={`spec-${r.id}-${d.id}`} value={`ROLE:SPECIFIC:${r.id}:${d.id}`}>{d.name} — {r.name}</option>
                    ))}
                  </optgroup>
                ))}

                <optgroup label="Global Roles (Any Department)">
                  {rolesList.filter(r => (r.is_active || r.id <= 3) && r.can_approve !== false).map(r => (
                    <option key={`any-${r.id}`} value={`ROLE:ANY:${r.id}`}>Any {r.name}</option>
                  ))}
                </optgroup>

                <optgroup label="Specific Person">
                  {staffList.filter(s => s.role_id !== 1).map(s => (
                    <option key={`user-${s.id}`} value={`USER:${s.id}`}>
                      {s.name}{s.department_name ? ` (${s.department_name})` : ''}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

                  {/* ── Live matching users preview ───────────────────────────── */}
                  {data.roleId && (
                    <div className="mt-2 pt-2 border-t border-blue-200">
                      <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-1.5">
                        👥 Who Will Receive This Step
                        {data.routingType === 'INITIATOR_DEPT' && ' (all in role)'}
                      </p>
                      {rolePreviewLoading ? (
                        <p className="text-[10px] text-blue-400 italic">Loading...</p>
                      ) : rolePreviewUsers.length === 0 ? (
                        <div className="bg-red-50 border border-red-200 rounded p-2">
                          <p className="text-[10px] font-bold text-red-700">⚠️ No users found!</p>
                          <p className="text-[9px] text-red-600 mt-0.5">Nobody in the system matches this role{data.routingType === 'SPECIFIC' && data.targetDepartmentId ? ' + department' : ''} combination. This step will be unclaimable.</p>
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {rolePreviewUsers.map(u => (
                            <li key={u.id} className="flex items-center justify-between bg-white border border-blue-100 rounded px-2 py-1">
                              <div>
                                <span className="text-[11px] font-semibold text-gray-800">{u.name}</span>
                                {u.department_name && <span className="text-[9px] text-gray-400 ml-1">· {u.department_name}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] text-gray-400 truncate max-w-[80px] hidden md:inline">{u.email}</span>
                                {data.routingType === 'SPECIFIC' && (
                                  <button
                                    onClick={() => {
                                      onChange('assignmentStrategy', 'specific_user');
                                      onChange('assignee', u.id);
                                      onChange('roleId', null);
                                      onChange('routingType', null);
                                      onChange('targetDepartmentId', null);
                                    }}
                                    className="text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded font-bold hover:bg-blue-700 transition-colors"
                                  >
                                    Assign User
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

            <div className="bg-red-50 p-3 rounded border border-red-100">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-red-800 mb-1 border-b border-red-200 pb-1">SLA Timers (Hours)</label>
              <p className="text-[9px] text-red-500 mb-2">All values must be positive. Reminder &gt; Warning &gt; Breach (decreasing).</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <div>
                    <span className="text-xs text-gray-700 font-medium">⏰ Reminder after</span>
                    <p className="text-[9px] text-gray-400">First gentle nudge</p>
                  </div>
                  <input
                    type="number" min="0" step="0.5"
                    value={data.slaHours || ''}
                    onChange={e => { const v = Math.max(0, parseFloat(e.target.value) || 0); onChange('slaHours', v || ''); }}
                    className="w-20 text-xs p-1.5 border rounded text-center"
                    placeholder="hrs"
                  />
                </div>
                <div className="flex justify-between items-center gap-2">
                  <div>
                    <span className="text-xs text-amber-700 font-medium">🔔 Reminder alert at</span>
                    <p className="text-[9px] text-gray-400">hrs remaining before breach</p>
                  </div>
                  <input
                    type="number" min="0" step="0.5"
                    value={data.reminderHours || ''}
                    onChange={e => { const v = Math.max(0, parseFloat(e.target.value) || 0); onChange('reminderHours', v || ''); }}
                    className="w-20 text-xs p-1.5 border rounded text-center"
                    placeholder="hrs"
                  />
                </div>
                <div className="flex justify-between items-center gap-2">
                  <div>
                    <span className="text-xs text-orange-700 font-medium">⚠️ Warning alert at</span>
                    <p className="text-[9px] text-gray-400">hrs remaining before breach</p>
                  </div>
                  <input
                    type="number" min="0" step="0.5"
                    value={data.warningHours || ''}
                    onChange={e => { const v = Math.max(0, parseFloat(e.target.value) || 0); onChange('warningHours', v || ''); }}
                    className="w-20 text-xs p-1.5 border rounded text-center"
                    placeholder="hrs"
                  />
                </div>
                <div className="flex justify-between items-center gap-2 pt-1 border-t border-red-200">
                  <div>
                    <span className="text-xs font-bold text-red-700">🚨 Breach / Escalate after</span>
                    <p className="text-[9px] text-gray-400">Reassigns to target at this point</p>
                  </div>
                  <input
                    type="number" min="0" step="0.5"
                    value={data.escalationHours || ''}
                    onChange={e => { const v = Math.max(0, parseFloat(e.target.value) || 0); onChange('escalationHours', v || ''); }}
                    className="w-20 text-xs p-1.5 border border-red-400 rounded text-center font-bold"
                    placeholder="hrs"
                  />
                </div>
                {parseFloat(data.escalationHours) > 0 && (
                  <div className="pt-2 mt-1 border-t border-red-100">
                    <label className="block text-[10px] font-bold text-red-700 uppercase tracking-wider mb-1">Escalate To (Required)</label>
                    <select
                      value={data.escalationUserId || ''} onChange={(e) => onChange('escalationUserId', e.target.value)}
                      className="w-full text-xs border border-red-300 rounded p-1.5 bg-red-50"
                    >
                      <option value="">-- Select Escalation Target --</option>
                      {staffList.filter(s => s.role_id !== 1).map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.department_name ? ` (${s.department_name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Checklist Items</label>
              <ul className="mb-2 space-y-1">
                {(data.checklist || []).map((item, idx) => (
                  <li key={idx} className="flex justify-between text-xs bg-gray-50 p-1.5 rounded border border-gray-200">
                    <span className="truncate">{item}</span>
                    <button onClick={() => removeChecklistItem(idx)} className="text-red-500 hover:text-red-700 font-bold px-1">&times;</button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-1">
                <input type="text" value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()} className="flex-1 text-xs border rounded p-1.5" placeholder="Add mandatory step..." />
                <button onClick={addChecklistItem} className="bg-blue-600 text-white px-2 rounded text-xs">+</button>
              </div>
            </div>

            <div className="bg-indigo-50 p-3 rounded border border-indigo-200">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-indigo-800 mb-1">Allowed Tags</label>
              <input
                type="text"
                value={data.allowedTags || ''}
                onChange={(e) => onChange('allowedTags', e.target.value)}
                className="w-full text-xs border-indigo-200 bg-white rounded p-1.5 focus:ring-indigo-400 border"
                placeholder="e.g. accepted, rejected"
              />
              <p className="text-[10px] text-indigo-600 mt-1">Comma-separated. Staff will see these as a dropdown when tagging this document.</p>
            </div>

            <div className="bg-gray-50 p-3 rounded border border-gray-200 mt-3">
              <label className="block text-[10px] uppercase font-bold text-gray-600 mb-2">
                Allowed Actions at This Stage
              </label>
              {['approve', 'reject', 'request_revision', 'attach_documents'].map(action => (
                <label key={action} className="flex items-center gap-2 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(data.allowedActions || ['approve','reject']).includes(action)}
                    onChange={(e) => {
                      const current = data.allowedActions || ['approve', 'reject'];
                      const updated = e.target.checked
                        ? [...current, action]
                        : current.filter(a => a !== action);
                      onChange('allowedActions', updated);
                    }}
                    className="text-indigo-600 rounded focus:ring-indigo-500"
                  />
                  <span className="text-xs text-gray-700 capitalize">{action.replace(/_/g, ' ')}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {/* 2. CONDITION PROPERTIES */}
        {selectedNode.type === 'condition' && (
          <div>
            <label className="block text-xs font-bold text-amber-800 mb-1">If Tag Equals</label>
            <input
              type="text" value={data.conditionValue || ''} onChange={(e) => onChange('conditionValue', e.target.value)}
              className="w-full text-sm border-amber-300 bg-amber-50 rounded p-2 focus:ring-amber-500 focus:border-amber-500 border" placeholder="e.g. Finance"
            />
            <p className="text-[10px] text-gray-500 mt-1">Routes to TRUE if it matches perfectly, otherwise FALSE.</p>
          </div>
        )}

        {/* 3. EMAIL PROPERTIES */}
        {selectedNode.type === 'email' && (
          <EmailProperties data={data} onChange={onChange} />
        )}

        {/* 4. DELAY PROPERTIES */}
        {selectedNode.type === 'delay' && (
          <div>
            <label className="block text-xs font-bold text-purple-800 mb-1">Delay Duration (Hours)</label>
            <input type="number" min="0" value={data.delayHours || ''} onChange={e => onChange('delayHours', e.target.value)} className="w-full text-sm border-purple-300 bg-purple-50 rounded p-2 focus:ring-purple-500 border" placeholder="e.g. 48" />
            <p className="text-[10px] text-gray-500 mt-1">Flow auto-resumes after this interval.</p>
          </div>
        )}

        {/* 5. PARALLEL PROPERTIES */}
        {selectedNode.type === 'parallel' && (
          <div className="bg-orange-50 p-3 rounded border border-orange-200 text-xs text-orange-800">
            Connect multiple outputs to this node. The document will route to all connected paths simultaneously.
          </div>
        )}

        {/* 6. SPAWN PROPERTIES */}
        {selectedNode.type === 'spawn' && (
          <div>
            <label className="block text-xs font-bold text-pink-800 mb-1">Workflows to Spawn</label>
            <div className="max-h-32 overflow-y-auto border border-pink-200 rounded text-sm bg-white p-1">
              {savedWorkflows.filter(w => w.id !== parseInt(selectedWorkflowId || 0)).map(wf => {
                const isSelected = (data.spawnIds || '').split(',').includes(wf.id.toString());
                return (
                  <label key={wf.id} className="flex items-center gap-2 p-1.5 hover:bg-pink-50 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={(e) => {
                        let ids = (data.spawnIds || '').split(',').filter(Boolean);
                        if (e.target.checked) ids.push(wf.id.toString());
                        else ids = ids.filter(id => id !== wf.id.toString());
                        onChange('spawnIds', ids.join(','));
                      }}
                      className="text-pink-600 focus:ring-pink-500 rounded"
                    />
                    <span className="truncate text-xs text-gray-700" title={wf.name}>{wf.name}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-500 mt-1">Spawns new detached document workflows automatically.</p>
          </div>
        )}

      </div>
    </div>
  );
};


// ==========================================
// 3. LEFT PALETTE SIDEBAR
// ==========================================
const Sidebar = () => {
  const onDragStart = (event, nodeType, defaultLabel) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', defaultLabel);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-56 bg-gray-50 border-r border-gray-200 h-full flex flex-col pt-1">
      <div className="p-3 border-b border-gray-200 font-bold text-xs uppercase tracking-wider text-gray-500">Node Palette</div>
      <div className="p-3 space-y-3 overflow-y-auto">
        <div className="text-[10px] font-bold text-gray-400 uppercase">Interactive</div>
        <div className="bg-white border hover:border-blue-400 p-2 text-xs rounded cursor-grab flex items-center gap-2 shadow-sm" onDragStart={(e) => onDragStart(e, 'task', 'Approval Step')} draggable>
          <span className="text-blue-500">🟦</span> Approval Step
        </div>

        <div className="text-[10px] font-bold text-gray-400 uppercase mt-4">Logic</div>
        <div className="bg-white border hover:border-amber-400 p-2 text-xs rounded cursor-grab flex items-center gap-2 shadow-sm" onDragStart={(e) => onDragStart(e, 'condition', 'If Tag Match')} draggable>
          <span className="text-amber-500">🔀</span> Condition (If/Else)
        </div>
        <div className="bg-white border hover:border-orange-400 p-2 text-xs rounded cursor-grab flex items-center gap-2 shadow-sm" onDragStart={(e) => onDragStart(e, 'parallel', 'Parallel Split')} draggable>
          <span className="text-orange-500">⑂</span> Parallel Split
        </div>

        <div className="text-[10px] font-bold text-gray-400 uppercase mt-4">Automation</div>
        <div className="bg-white border hover:border-green-400 p-2 text-xs rounded cursor-grab flex items-center gap-2 shadow-sm" onDragStart={(e) => onDragStart(e, 'email', 'Send Email')} draggable>
          <span className="text-green-500">📧</span> Email Notify
        </div>
        <div className="bg-white border hover:border-purple-400 p-2 text-xs rounded cursor-grab flex items-center gap-2 shadow-sm" onDragStart={(e) => onDragStart(e, 'delay', 'Wait Timer')} draggable>
          <span className="text-purple-500">⏳</span> Delay Timer
        </div>
        <div className="bg-white border hover:border-pink-400 p-2 text-xs rounded cursor-grab flex items-center gap-2 shadow-sm" onDragStart={(e) => onDragStart(e, 'spawn', 'Spawn Flows')} draggable>
          <span className="text-pink-500">🚀</span> Spawn Flows
        </div>
      </div>
      <div className="p-3 mt-auto border-t border-gray-200 text-[10px] text-gray-400">
        Drag nodes onto the canvas. Press <kbd className="bg-gray-200 px-1 py-0.5 rounded text-gray-600">Del</kbd> to remove.
      </div>
    </div>
  );
};


// ==========================================
// 4. MAIN BUILDER COMPONENT (INTERNAL)
// ==========================================
const WorkflowBuilderInner = () => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [workflowName, setWorkflowName] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');

  const [savedWorkflows, setSavedWorkflows] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [rolesList, setRolesList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [allowedSubmitters, setAllowedSubmitters] = useState([]);
  const [prerequisiteWorkflowId, setPrerequisiteWorkflowId] = useState('');
  const [clearanceWorkflowIds, setClearanceWorkflowIds] = useState('');

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [toast, setToast] = useState({ type: '', text: '' });
  const builderContainerRef = useRef(null);

  // Custom confirm modal state (replaces native window.confirm)
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', messages: [], onConfirm: null, confirmText: 'Confirm', type: 'warning' });
  const showConfirm = (title, messages, onConfirm, confirmText = 'Confirm', type = 'warning') => setConfirmModal({ open: true, title, messages, onConfirm, confirmText, type });
  const closeConfirm = () => setConfirmModal({ open: false, title: '', messages: [], onConfirm: null, confirmText: 'Confirm', type: 'warning' });

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast({ type: '', text: '' }), 4000);
  };

  const reactFlowWrapper = useRef(null);
  const { project } = useReactFlow();

  const nodeTypes = useMemo(() => ({
    task: TaskNode,
    condition: ConditionNode,
    email: EmailNode,
    delay: DelayNode,
    parallel: ParallelNode,
    spawn: SpawnNode
  }), []);

  // Fetch init data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [wfRes, staffRes, rolesRes, deptRes] = await Promise.all([
          api.get('/workflows'),
          api.get('/admin/users'),
          api.get('/admin/roles'),
          api.get('/admin/departments')
        ]);
        setSavedWorkflows(wfRes.data);
        setStaffList(staffRes.data); // All system users can be manually assigned as approvers
        setRolesList(rolesRes.data);
        setDepartments(deptRes.data || []);
      } catch (err) { console.error('Failed to load builder data', err); }
    };
    fetchData();
  }, []);

  // React Flow Handlers
  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const onConnect = useCallback((params) => {
    let edgeStyle = { stroke: '#64748b', strokeWidth: 2 };
    let animated = true;

    // Custom styling for logic outputs
    if (params.sourceHandle === 'true') { edgeStyle.stroke = '#22c55e'; }
    if (params.sourceHandle === 'false') { edgeStyle.stroke = '#ef4444'; }

    const newEdge = {
      ...params,
      type: 'smoothstep',
      style: edgeStyle,
      animated,
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle.stroke }
    };
    setEdges((eds) => addEdge(newEdge, eds));
  }, []);

  // Selection
  const onSelectionChange = ({ nodes }) => {
    if (nodes.length > 0) {
      // A new node was explicitly clicked — always show the panel
      setSelectedNodeId(nodes[0].id);
    } else {
      setSelectedNodeId(null);
    }
  };

  // Property Update Handler
  const updateNodeData = useCallback((id, field, value) => {
    setNodes(nds => nds.map(n => {
      if (n.id === id) {
        return { ...n, data: { ...n.data, [field]: value } };
      }
      return n;
    }));
  }, []);

  // Ensure staffList is available in node data (for the badges in TaskNode)
  // Ensure context lists are available in node data (for the badges in TaskNode)
  useEffect(() => {
    setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, staffList, rolesList, departments } })));
  }, [staffList, rolesList, departments]);

  // Drag and Drop Handlers
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event) => {
    event.preventDefault();

    const type = event.dataTransfer.getData('application/reactflow');
    const label = event.dataTransfer.getData('application/reactflow-label');

    if (typeof type === 'undefined' || !type) return;

    const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = project({
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    });

    const newNode = {
      id: `${type}_${Date.now()}`,
      type,
      position,
      data: { label, staffList, rolesList, departments },
    };

    setNodes((nds) => nds.concat(newNode));
    setSelectedNodeId(newNode.id); // Auto-select on drop
  }, [project, staffList, rolesList, departments]);


  // Load/Save
  const handleLoadWorkflow = (e) => {
    const wfId = e.target.value;
    setSelectedWorkflowId(wfId);
    setSelectedNodeId(null);
    if (!wfId) { setNodes([]); setEdges([]); setWorkflowName(''); setAllowedSubmitters([]); return; }

    const wf = savedWorkflows.find(w => w.id === parseInt(wfId));
    if (wf) {
      setWorkflowName(wf.name);
      const flowData = typeof wf.flow_structure === 'string' ? JSON.parse(wf.flow_structure) : wf.flow_structure;

      const loadedNodes = (flowData.nodes || []).map(node => ({
        ...node,
        data: { ...node.data, staffList, rolesList, departments }
      }));
      setNodes(loadedNodes); setEdges(flowData.edges || []);
      setAllowedSubmitters(flowData.metadata?.allowedSubmitters || []);
      setPrerequisiteWorkflowId(flowData.metadata?.prerequisiteWorkflowId || '');
      setClearanceWorkflowIds(flowData.metadata?.clearanceWorkflowIds?.join(',') || '');
    }
  };

  const [isValidating, setIsValidating] = useState(false);

  // Checks validation rules and returns an array of error messages.
  const getValidationErrors = () => {
    const errors = [];
    if (nodes.length === 0) {
      errors.push("Workflow is empty. Please add at least one step.");
      return errors;
    }
    nodes.forEach(n => {
      if (n.type === 'task') {
        const hasAssignee = !!n.data.assignee;
        const hasRole = n.data.assignmentStrategy === 'role_based' && !!n.data.roleId;
        if (!hasAssignee && !hasRole) errors.push(`Approval node "${n.data.label}" has no assignee or role set.`);
        
        if (parseFloat(n.data.escalationHours) > 0 && !n.data.escalationUserId) {
          errors.push(`Approval node "${n.data.label}" has an SLA breach timer but no Escalation Target selected.`);
        }
      }
      if (n.type === 'email' && !n.data.recipient) errors.push(`Email node "${n.data.label}" has no recipient.`);
    });
    
    const connectedNodeIds = new Set();
    edges.forEach(e => { connectedNodeIds.add(e.source); connectedNodeIds.add(e.target); });
    if (nodes.length > 1) {
      nodes.forEach(n => {
        if (!connectedNodeIds.has(n.id)) errors.push(`Node "${n.data.label}" is disconnected.`);
      });
    }
    return errors;
  };

  const saveDraft = () => {
    if (!workflowName) { showToast('error', 'Please enter a workflow name before saving.'); return; }
    doSave(false); // drafts are explicitly unpublished
  };

  const publishWorkflow = () => {
    if (!workflowName) { showToast('error', 'Please enter a workflow name before publishing.'); return; }

    const errors = getValidationErrors();
    if (errors.length > 0) {
      showConfirm(
        '⛔ Publish Blocked: Validation Errors',
        [...errors, "You must fix these errors before the workflow can be published. You can still save your progress as a draft."],
        null,
        'Understood',
        'error'
      );
      return;
    }
    doSave(true);
  };

  const doSave = async (isPublished) => {
    closeConfirm();

    setIsValidating(true);
    try {
      const cleanedNodes = nodes.map(n => {
        const cleanData = { ...n.data };
        delete cleanData.staffList; // strip large redundant arrays before saving
        delete cleanData.rolesList;
        delete cleanData.departments;
        return { ...n, data: cleanData };
      });
      const metadataObj = { allowedSubmitters, prerequisiteWorkflowId: prerequisiteWorkflowId || null, isPublished };
      if (clearanceWorkflowIds) {
        metadataObj.clearanceWorkflowIds = clearanceWorkflowIds.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      }

      const flowData = JSON.stringify({
        nodes: cleanedNodes,
        edges,
        metadata: metadataObj
      });

      if (selectedWorkflowId) {
        await api.put(`/workflows/${selectedWorkflowId}`, { name: workflowName, flow_structure: flowData });
        showToast('success', 'Workflow updated successfully!');
      } else {
        const res = await api.post('/workflows', { name: workflowName, flow_structure: flowData });
        setSelectedWorkflowId(res.data.id.toString());
        showToast('success', 'New workflow created successfully!');
      }
      // Re-fetch list
      const wfRes = await api.get('/workflows');
      setSavedWorkflows(wfRes.data);
    } catch (err) {
      showToast('error', 'Failed to save workflow. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleClear = () => {
    showConfirm(
      '🗑️ Clear Canvas',
      ['This will remove all nodes and connections from the canvas. This cannot be undone.'],
      () => { setNodes([]); setEdges([]); setSelectedNodeId(null); setAllowedSubmitters([]); setPrerequisiteWorkflowId(''); setClearanceWorkflowIds(''); },
      'Clear Canvas',
      'danger'
    );
  }

  const handleDeleteWorkflow = () => {
    if (!selectedWorkflowId) return;
    showConfirm(
      '⚠️ Delete Workflow',
      ['Are you sure you want to permanently delete this workflow?', 'This action cannot be undone. If it has historical records, it will be rejected by the server.'],
      async () => {
        try {
          await api.delete(`/workflows/${selectedWorkflowId}`);
          showToast('success', 'Workflow deleted successfully!');
          // Clear current
          setNodes([]); setEdges([]); setSelectedNodeId(null); setAllowedSubmitters([]); setPrerequisiteWorkflowId(''); setClearanceWorkflowIds(''); setSelectedWorkflowId(''); setWorkflowName('');
          // Refetch
          const wfRes = await api.get('/workflows');
          setSavedWorkflows(wfRes.data);
        } catch (err) {
          if (err.response && err.response.status === 400) {
            showConfirm(
              '⛔ Deletion Rejected',
              [err.response.data.message || 'Cannot delete a workflow with active or historical records.', 'Please Unpublish (Take Down) the workflow instead to preserve analytics and history.'],
              null,
              'Understood',
              'error'
            );
          } else {
            showToast('error', 'An error occurred while deleting the workflow.');
          }
        }
      },
      'Delete Permanently',
      'danger'
    );
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      if (builderContainerRef.current) {
        builderContainerRef.current.requestFullscreen().catch(err => {
          showToast('error', `Could not enter full-screen: ${err.message}`);
        });
      }
      setIsFullScreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullScreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const handleRoleToggle = (roleId) => {
    setAllowedSubmitters(prev =>
      prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]
    );
  };

  return (
    <div ref={builderContainerRef} className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-140px)] min-h-[700px] w-full">
      {/* Toast Notification */}
      {toast.text && (
        <div className="fixed top-6 right-6 z-[80]">
          <div className={`px-6 py-4 rounded-xl shadow-2xl border-l-4 font-semibold text-sm flex items-center gap-3 ${toast.type === 'error' ? 'bg-white border-red-500 text-red-700' : 'bg-white border-green-500 text-green-700'}`}>
            <span className="text-xl">{toast.type === 'error' ? '🚨' : '✅'}</span>
            {toast.text}
          </div>
        </div>
      )}

      {/* Custom Confirm Modal */}
      {confirmModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 overflow-hidden">
            <div className={`border-b px-6 py-4 ${confirmModal.type === 'error' || confirmModal.type === 'danger' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
              <h3 className={`font-black text-lg ${confirmModal.type === 'error' || confirmModal.type === 'danger' ? 'text-red-900' : 'text-gray-900'}`}>{confirmModal.title}</h3>
            </div>
            <div className="px-6 py-4">
              <ul className="space-y-2">
                {confirmModal.messages.map((msg, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className={`mt-0.5 shrink-0 ${confirmModal.type === 'error' || confirmModal.type === 'danger' ? 'text-red-500' : 'text-amber-500'}`}>
                      {confirmModal.type === 'error' || confirmModal.type === 'danger' ? '❌' : '⚠️'}
                    </span>
                    <span>{msg}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              {confirmModal.onConfirm && (
                <button onClick={closeConfirm} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 transition-colors">Cancel</button>
              )}
              <button
                onClick={() => { if (confirmModal.onConfirm) confirmModal.onConfirm(); closeConfirm(); }}
                className={`px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors shadow-sm ${confirmModal.type === 'error' || confirmModal.type === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}
              >{confirmModal.confirmText}</button>
            </div>
          </div>
        </div>
      )}

      {/* WORKFLOW BROWSER MODAL */}
      {isBrowserOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl border border-gray-100 overflow-hidden flex flex-col h-[80vh]">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Workflow Browser</h2>
                <p className="text-sm text-gray-500 mt-1">Manage and open your existing workflows.</p>
              </div>
              <button onClick={() => setIsBrowserOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
              {/* Drafts Section */}
              <div className="mb-8">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span> Drafts (Unpublished)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {savedWorkflows.filter(wf => {
                    const meta = (typeof wf.flow_structure === 'string' ? JSON.parse(wf.flow_structure) : (wf.flow_structure || {})).metadata;
                    return meta?.isPublished === false || meta?.isComplete === false;
                  }).map(wf => (
                    <div key={wf.id} onClick={() => { handleLoadWorkflow({ target: { value: wf.id }}); setIsBrowserOpen(false); }} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group">
                      <div className="flex justify-between items-start mb-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg group-hover:scale-110 transition-transform">📝</div>
                        <span className="text-[10px] font-bold px-2 py-1 bg-gray-100 text-gray-500 rounded uppercase">Draft</span>
                      </div>
                      <h4 className="font-bold text-gray-900 truncate mb-1">{wf.name}</h4>
                      <p className="text-xs text-gray-500">ID: {wf.id}</p>
                    </div>
                  ))}
                  {savedWorkflows.filter(wf => {
                    const meta = (typeof wf.flow_structure === 'string' ? JSON.parse(wf.flow_structure) : (wf.flow_structure || {})).metadata;
                    return meta?.isPublished === false || meta?.isComplete === false;
                  }).length === 0 && (
                    <div className="col-span-full py-6 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">No drafts found.</div>
                  )}
                </div>
              </div>

              {/* Published Section */}
              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Published & Active
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {savedWorkflows.filter(wf => {
                    const meta = (typeof wf.flow_structure === 'string' ? JSON.parse(wf.flow_structure) : (wf.flow_structure || {})).metadata;
                    return meta?.isPublished === true || (meta?.isPublished === undefined && meta?.isComplete !== false);
                  }).map(wf => (
                    <div key={wf.id} onClick={() => { handleLoadWorkflow({ target: { value: wf.id }}); setIsBrowserOpen(false); }} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group">
                      <div className="flex justify-between items-start mb-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg group-hover:scale-110 transition-transform">🚀</div>
                        <span className="text-[10px] font-bold px-2 py-1 bg-emerald-50 text-emerald-600 rounded uppercase">Live</span>
                      </div>
                      <h4 className="font-bold text-gray-900 truncate mb-1">{wf.name}</h4>
                      <p className="text-xs text-gray-500">ID: {wf.id}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOP BAR */}
      <div className="flex px-4 py-3 border-b border-gray-200 bg-white items-center gap-4 z-10 shrink-0 flex-wrap shadow-sm">
        <button onClick={() => setIsBrowserOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 transition-colors">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          Browse Workflows
        </button>

        {selectedWorkflowId && (() => {
          const loadedWorkflow = savedWorkflows.find(w => w.id === parseInt(selectedWorkflowId));
          if (!loadedWorkflow) return null;
          const meta = (typeof loadedWorkflow.flow_structure === 'string' ? JSON.parse(loadedWorkflow.flow_structure) : loadedWorkflow.flow_structure).metadata;
          const isPublished = meta?.isPublished === true || (meta?.isPublished === undefined && meta?.isComplete !== false);
          return (
            <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase flex items-center gap-1 ${isPublished ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isPublished ? 'bg-emerald-400' : 'bg-gray-400'}`}></span>
              {isPublished ? 'Live' : 'Draft'}
            </span>
          );
        })()}

        <div className="h-6 w-px bg-gray-200"></div>

        <input
          type="text" placeholder="Enter Workflow Name..." value={workflowName} onChange={(e) => setWorkflowName(e.target.value)}
          className="flex-grow max-w-[250px] px-3 py-1.5 border-none text-lg font-black text-gray-800 placeholder-gray-300 focus:ring-0 outline-none bg-transparent"
        />

        <div className="h-6 w-px bg-gray-200 hidden sm:block"></div>

        <div className="flex items-center gap-2 relative group hidden sm:flex">
          <span className="text-xs font-bold text-gray-500">Allowed Roles:</span>
          <div className="relative cursor-pointer">
            <div className="px-3 py-1.5 border border-gray-300 rounded text-xs bg-white text-gray-700 font-medium hover:border-blue-400 transition-colors flex items-center gap-2">
              <span>{allowedSubmitters.length === 0 ? 'All Roles (Global)' : `${allowedSubmitters.length} Roles Selected`}</span>
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
            {/* Dropdown Menu */}
            <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 shadow-xl rounded-lg py-2 hidden group-hover:block z-50">
              <div className="px-3 pb-2 border-b border-gray-100 mb-1">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Select Roles</p>
              </div>
              <div className="max-h-56 overflow-y-auto">
                <label className="flex items-center gap-3 px-3 py-1.5 hover:bg-blue-50 cursor-pointer transition-colors group/item">
                  <input type="checkbox" checked={allowedSubmitters.includes(1)} onChange={() => handleRoleToggle(1)} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer" />
                  <span className={`text-sm ${allowedSubmitters.includes(1) ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>Student (Legacy)</span>
                </label>
                <label className="flex items-center gap-3 px-3 py-1.5 hover:bg-blue-50 cursor-pointer transition-colors group/item">
                  <input type="checkbox" checked={allowedSubmitters.includes(2)} onChange={() => handleRoleToggle(2)} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer" />
                  <span className={`text-sm ${allowedSubmitters.includes(2) ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>Staff (Legacy)</span>
                </label>
                {rolesList.filter(r => r.is_active).map(role => (
                  <label key={role.id} className="flex items-center gap-3 px-3 py-1.5 hover:bg-blue-50 cursor-pointer transition-colors group/item">
                    <input type="checkbox" checked={allowedSubmitters.includes(role.id)} onChange={() => handleRoleToggle(role.id)} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer" />
                    <span className={`text-sm ${allowedSubmitters.includes(role.id) ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>{role.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 relative group hidden sm:flex">
          <span className="text-xs font-bold text-gray-500">Prerequisite:</span>
          <select 
            value={prerequisiteWorkflowId} 
            onChange={(e) => setPrerequisiteWorkflowId(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded text-xs bg-white text-gray-700 hover:border-blue-400 focus:outline-none focus:border-blue-500 max-w-[150px]"
          >
            <option value="">None</option>
            {savedWorkflows.filter(w => w.id !== parseInt(selectedWorkflowId || 0)).map(wf => (
              <option key={wf.id} value={wf.id}>{wf.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 relative group hidden lg:flex">
          <span className="text-xs font-bold text-gray-500" title="Workflow IDs that must be approved before this document can be fully completely routed.">Clearances:</span>
          <div className="relative">
            <select 
              className="px-3 py-1.5 border border-gray-300 rounded text-xs bg-white text-gray-700 hover:border-blue-400 focus:outline-none focus:border-blue-500 max-w-[150px] appearance-none"
              defaultValue=""
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                let ids = clearanceWorkflowIds ? clearanceWorkflowIds.split(',').filter(Boolean) : [];
                if (!ids.includes(val)) ids.push(val);
                setClearanceWorkflowIds(ids.join(','));
                e.target.value = "";
              }}
            >
              <option value="">+ Add Clearance</option>
              {savedWorkflows.filter(w => w.id !== parseInt(selectedWorkflowId || 0)).map(wf => (
                <option key={wf.id} value={wf.id}>{wf.name}</option>
              ))}
            </select>
          </div>
          {clearanceWorkflowIds && (
             <div className="flex gap-1 flex-wrap max-w-[200px]">
               {clearanceWorkflowIds.split(',').filter(Boolean).map(id => {
                  const wf = savedWorkflows.find(w => w.id === parseInt(id));
                  return (
                    <span key={id} className="bg-gray-100 border border-gray-200 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                      <span className="truncate max-w-[80px]" title={wf?.name}>{wf?.name || `ID:${id}`}</span>
                      <button onClick={() => setClearanceWorkflowIds(clearanceWorkflowIds.split(',').filter(x => x !== id).join(','))} className="text-red-500 font-bold">&times;</button>
                    </span>
                  );
               })}
             </div>
          )}
        </div>

        <div className="flex-grow"></div>

        <button onClick={toggleFullScreen} className="text-gray-500 hover:text-blue-600 p-1.5 rounded bg-gray-50 border border-gray-200 mr-2" title="Toggle Full Screen">
          {isFullScreen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 11lm0 0l-4-4m4 4v-3m0 3H6m6-6l4-4m-4 4h3m-3 0v-3m0 9l4 4m-4-4v3m0-3h3M9 15l-4 4m4-4h-3m3 0v3" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
          )}
        </button>

        {selectedWorkflowId && (
          <button onClick={handleDeleteWorkflow} className="text-gray-400 hover:text-red-500 p-1.5 rounded bg-gray-50 border border-gray-200 mr-2" title="Delete Workflow">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        )}

        <button onClick={handleClear} className="text-gray-400 hover:text-red-500 font-medium text-sm px-2">Clear</button>
        
        {(() => {
          let isLoadedWorkflowPublished = false;
          if (selectedWorkflowId) {
            const loadedWorkflow = savedWorkflows.find(w => w.id === parseInt(selectedWorkflowId));
            if (loadedWorkflow) {
              const meta = (typeof loadedWorkflow.flow_structure === 'string' ? JSON.parse(loadedWorkflow.flow_structure) : loadedWorkflow.flow_structure).metadata;
              isLoadedWorkflowPublished = meta?.isPublished === true || (meta?.isPublished === undefined && meta?.isComplete !== false);
            }
          }
          
          return isLoadedWorkflowPublished ? (
            <button onClick={saveDraft} disabled={isValidating} className={`bg-amber-100 text-amber-700 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${isValidating ? 'opacity-70' : 'hover:bg-amber-200'}`}>
              Unpublish (Take Down)
            </button>
          ) : (
            <button onClick={saveDraft} disabled={isValidating} className={`bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors ${isValidating ? 'opacity-70' : 'hover:bg-gray-50'}`}>
              Save Draft
            </button>
          );
        })()}

        <button onClick={publishWorkflow} disabled={isValidating} className={`bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors ${isValidating ? 'opacity-70' : 'hover:bg-emerald-700'}`}>
          {selectedWorkflowId ? 'Update & Publish' : 'Publish Live'}
        </button>
      </div>

      {/* MAIN WORKSPACE AREA */}
      <div className="flex flex-1 relative overflow-hidden bg-slate-900">
        {/* Left Sidebar Palette */}
        <Sidebar onDragStart={() => { }} />

        {/* Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            nodeTypes={nodeTypes}
            onDrop={onDrop}
            onDragOver={onDragOver}
            snapToGrid={true}
            snapGrid={[15, 15]}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background color="#334155" gap={24} size={2} />
            <Controls className="bg-white rounded border border-gray-300 shadow-sm" />
            <MiniMap nodeStrokeColor="#94a3b8" nodeColor="#f1f5f9" maskColor="rgba(15, 23, 42, 0.7)" className="rounded border-2 border-slate-700 bg-slate-800" />
          </ReactFlow>
        </div>

        {/* Right Inspector Panel */}
        {selectedNodeId && (
          <PropertyInspector
            selectedNode={selectedNode}
            updateNodeData={updateNodeData}
            closePanel={() => { 
              setNodes(nds => nds.map(n => ({ ...n, selected: false })));
              setSelectedNodeId(null); 
            }}
            staffList={staffList}
            rolesList={rolesList}
            departments={departments}
            savedWorkflows={savedWorkflows}
            selectedWorkflowId={selectedWorkflowId}
          />
        )}
      </div>
    </div>
  );
};

// Wrap in provider
export default function WorkflowBuilder() {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner />
    </ReactFlowProvider>
  );
}