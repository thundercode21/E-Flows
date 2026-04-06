import { useContext, useEffect, useState, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import WorkflowBuilder from '../components/WorkflowBuilder';
import DocumentUpload from '../components/DocumentUpload';
import DocumentDetailsModal from '../components/DocumentDetailsModal';
import RoleManager from '../components/RoleManager';
import StudentPortal from './StudentPortal';
import api from '../api';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const Dashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [documents, setDocuments] = useState([]);
  const [viewingDocument, setViewingDocument] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // NEW: upload state for staff services
  const [uploadWf, setUploadWf] = useState(null);

  // NEW: Bulk Import State
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  const [auditLogs, setAuditLogs] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [adminView, setAdminView] = useState('overview');
  const [adminStats, setAdminStats] = useState(null);
  const [dynamicRoles, setDynamicRoles] = useState([]);

  // NEW: Admin OTP Modal State
  const [showAdminOtpModal, setShowAdminOtpModal] = useState(false);
  const [adminOtpInput, setAdminOtpInput] = useState('');
  const [adminOtpAction, setAdminOtpAction] = useState(null);
  const [isAdminRequestingOtp, setIsAdminRequestingOtp] = useState(false);
  const [isAdminVerifyingOtp, setIsAdminVerifyingOtp] = useState(false);

  // NEW: Recent Items Expansion State
  const [showAllRecent, setShowAllRecent] = useState(false);

  // NEW: Export Audit Logs State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportSearch, setExportSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // NEW: Workflows state for the checklist logic
  const [workflows, setWorkflows] = useState([]);

  // Modal States
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [savedSignature, setSavedSignature] = useState('');

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [showResubmitModal, setShowResubmitModal] = useState(false);
  const [resubmitDocId, setResubmitDocId] = useState(null);
  const [resubmitFile, setResubmitFile] = useState(null);
  const [isResubmitting, setIsResubmitting] = useState(false);

  // Loading States and Toasts
  const [isApproving, setIsApproving] = useState(false);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [toastMessage, setToastMessage] = useState({ type: '', text: '' });

  const showToast = (type, text) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage({ type: '', text: '' }), 4000);
  };

  // NEW: Checklist Modal States
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [currentChecklist, setCurrentChecklist] = useState([]);
  const [checkedItems, setCheckedItems] = useState([]);

  // NEW: Local tag state for the review queue (key = docId, value = tag string)
  const [localTags, setLocalTags] = useState({});

  // NEW: In-app notifications
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Derive permissions securely (Preventing ID overlap with custom roles)
  const isStudent = user?.role_id === 1;
  const isStaffOrReviewer = user?.role_id === 2 || user?.role_id > 3;
  const isSuperAdmin = user?.role_id === 3;
  const isCustomRole = user?.role_id > 3;

  // Only grant dynamic powers if they are actually a custom role
  const canManageUsers = isSuperAdmin || (isCustomRole && user?.can_manage_users);
  const canCreateWorkflows = isSuperAdmin || (isCustomRole && user?.can_create_workflows);
  const fetchData = useCallback(async () => {
    try {
      if (isStudent || isStaffOrReviewer || isSuperAdmin || isCustomRole) {
        const docResponse = await api.get('/documents');
        setDocuments(docResponse.data);
      }
      if (isStaffOrReviewer) {
        // Staff need workflow data to read the checklists!
        const wfResponse = await api.get('/workflows');
        setWorkflows(wfResponse.data);
        const profileRes = await api.get('/auth/profile');
        if (profileRes.data?.signature_data) {
          setSavedSignature(profileRes.data.signature_data);
        }
      }
      if (canManageUsers || canCreateWorkflows) {
        const logsResponse = await api.get('/admin/audit-logs');
        setAuditLogs(logsResponse.data);
        const statsResponse = await api.get('/admin/stats');
        setAdminStats(statsResponse.data);
      }
      if (canManageUsers) {
        const usersResponse = await api.get('/admin/users');
        setUsersList(usersResponse.data);
        const rolesResponse = await api.get('/admin/roles');
        setDynamicRoles(rolesResponse.data);
      }
      // Always fetch notifications for logged-in users
      try {
        const notifRes = await api.get('/notifications');
        setNotifications(notifRes.data);
        setUnreadCount(notifRes.data.filter(n => !n.is_read).length);
      } catch (_) { /* non-critical */ }
    } catch (error) {
      console.error("Failed to fetch data", error);
    }
  }, [isStudent, isStaffOrReviewer, canManageUsers, canCreateWorkflows]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  useEffect(() => {
    if (canManageUsers || canCreateWorkflows) {
      setAdminView(prev => prev || 'overview');
    }
  }, [canManageUsers, canCreateWorkflows]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleRoleChange = async (targetUserId, newRoleId) => {
    if (targetUserId === user.id) { showToast('error', 'You cannot change your own role!'); return; }
    
    setIsAdminRequestingOtp(true);
    try {
      await api.post('/admin/request-otp');
      setAdminOtpAction({ type: 'role_change', payload: { targetUserId, newRoleId } });
      setAdminOtpInput('');
      setShowAdminOtpModal(true);
    } catch (err) {
      console.error(err);
      showToast('error', err.response?.data?.message || 'Failed to request Admin OTP');
    } finally {
      setIsAdminRequestingOtp(false);
    }
  };

  const handleAdminOtpSubmit = async () => {
    if (!adminOtpAction) return;
    setIsAdminVerifyingOtp(true);
    
    try {
      if (adminOtpAction.type === 'role_change') {
        const { targetUserId, newRoleId } = adminOtpAction.payload;
        await api.put(`/admin/users/${targetUserId}/role`, { role_id: parseInt(newRoleId), otp: adminOtpInput });
        showToast('success', 'User role updated!');
        fetchData();
      } else if (adminOtpAction.type === 'bulk_import') {
        const { validUsers } = adminOtpAction.payload;
        const res = await api.post('/admin/users/import-commit', { validUsers, otp: adminOtpInput });
        showToast('success', res.data.message);
        setImportPreview(null);
        setImportFile(null);
        fetchData();
      }
      setShowAdminOtpModal(false);
      setAdminOtpInput('');
      setAdminOtpAction(null);
    } catch (err) {
      console.error('Admin OTP Action Failed', err);
      showToast('error', err.response?.data?.message || 'Verification failed. Incorrect OTP.');
    } finally {
      setIsAdminVerifyingOtp(false);
    }
  };

  // ==========================================
  // NEW: The Checklist Lock Engine
  // ==========================================
  const handleRequestApproval = async (docId) => {
    const doc = documents.find(d => d.id === docId);
    setSelectedDocId(docId);

    let checklist = [];

    // Check if this document's current node has a mandatory checklist
    if (doc && doc.workflow_id && doc.current_node_id) {
      const wf = workflows.find(w => w.id === doc.workflow_id);
      if (wf) {
        const flowData = typeof wf.flow_structure === 'string' ? JSON.parse(wf.flow_structure) : wf.flow_structure;
        const currentNode = (flowData.nodes || []).find(n => n.id === doc.current_node_id);

        if (currentNode && currentNode.data?.checklist && currentNode.data.checklist.length > 0) {
          checklist = currentNode.data.checklist;
        }
      }
    }

    if (checklist.length > 0) {
      // If a checklist exists, lock the approval and open the checklist modal
      setCurrentChecklist(checklist);
      setCheckedItems([]); // Reset checked boxes
      setShowChecklistModal(true);
    } else {
      // If no checklist exists, proceed straight to OTP
      proceedToOtp(docId);
    }
  };

  const proceedToOtp = async (docId) => {
    setIsRequestingOtp(true);
    try {
      await api.post('/approvals/request-otp', { documentId: docId });
      setShowChecklistModal(false);
      setShowOtpModal(true);
    } catch (err) {
      console.error(err);
      showToast('error', err.response?.data?.message || 'Failed to request OTP');
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const handleSubmitOtp = async () => {
    setIsApproving(true);
    const signatureDrawing = savedSignature || null;
    try {
      await api.post('/approvals/approve', { documentId: selectedDocId, otp: otpInput, comments: 'Verified by Staff', signatureDrawing });
      setShowOtpModal(false);
      setOtpInput('');
      fetchData();
      showToast('success', 'Approved successfully!');
    } catch (err) {
      showToast('error', err.response?.data?.message || 'Invalid OTP');
    } finally {
      setIsApproving(false);
    }
  };

  // ... (Reject and Resubmit logic remains exactly the same) ...
  const openRejectModal = (docId) => {
    setSelectedDocId(docId);
    setRejectComment('');
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async () => {
    if (!rejectComment.trim()) return showToast('error', 'Reason required.');
    setIsRejecting(true);
    try {
      await api.post('/approvals/reject', { documentId: selectedDocId, comments: rejectComment });
      setShowRejectModal(false);
      setRejectComment('');
      fetchData();
      showToast('success', 'Document rejected.');
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to reject document.');
    } finally {
      setIsRejecting(false);
    }
  };

  const openResubmitModal = (docId) => {
    setResubmitDocId(docId);
    setResubmitFile(null);
    setShowResubmitModal(true);
  };

  const handleResubmit = async () => {
    if (!resubmitFile) return showToast('error', 'Please select a new file.');
    setIsResubmitting(true);
    const formData = new FormData();
    formData.append('document', resubmitFile);

    try {
      await api.put(`/documents/resubmit/${resubmitDocId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast('success', 'Document successfully resubmitted!');
      setShowResubmitModal(false);
      setResubmitFile(null);
      fetchData();
    } catch (error) {
      showToast('error', 'Failed to resubmit document.');
    } finally {
      setIsResubmitting(false);
    }
  };

  const filteredDocs = documents.filter(doc => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const titleMatch = doc.title?.toLowerCase().includes(query);
    const textMatch = doc.extracted_text?.toLowerCase().includes(query);
    const statusMatch = doc.status?.toLowerCase().includes(query);
    const idString = doc.id ? doc.id.toString() : '';
    const idMatch = idString.includes(query) || `tsk-${idString.substring(0, 4)}`.includes(query);
    const workflowName = doc.workflow_id ? workflows.find(w => w.id === doc.workflow_id)?.name?.toLowerCase() : '';
    const workflowMatch = workflowName && workflowName.includes(query);
    
    return titleMatch || textMatch || statusMatch || idMatch || workflowMatch;
  });

  // Helper: get allowed tags array from the current workflow node for a given document
  const getNodeAllowedTags = (doc) => {
    if (!doc.workflow_id || !doc.current_node_id) return [];
    const wf = workflows.find(w => w.id === doc.workflow_id);
    if (!wf) return [];
    const flowData = typeof wf.flow_structure === 'string' ? JSON.parse(wf.flow_structure) : wf.flow_structure;
    const currentNode = (flowData.nodes || []).find(n => n.id === doc.current_node_id);
    if (!currentNode?.data?.allowedTags) return [];
    return currentNode.data.allowedTags.split(',').map(t => t.trim()).filter(Boolean);
  };

  // Helper: get allowed actions array from the current workflow node for a given document
  const getNodeAllowedActions = (doc) => {
    if (!doc.workflow_id || !doc.current_node_id) return ['approve', 'reject'];
    const wf = workflows.find(w => w.id === doc.workflow_id);
    if (!wf) return ['approve', 'reject'];
    const flowData = typeof wf.flow_structure === 'string' ? JSON.parse(wf.flow_structure) : wf.flow_structure;
    const currentNode = (flowData.nodes || []).find(n => n.id === doc.current_node_id);
    return currentNode?.data?.allowedActions || ['approve', 'reject'];
  };

  // Handler: set a tag on the document via the new backend endpoint  
  const handleSetTag = async (docId, tag) => {
    setLocalTags(prev => ({ ...prev, [docId]: tag }));
    if (!tag) return;
    try {
      await api.patch(`/documents/${docId}/tag`, { tag });
    } catch (err) {
      console.error('Failed to set tag:', err);
      showToast('error', err.response?.data?.message || 'Failed to set tag.');
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const params = {};
      if (exportStartDate) params.startDate = exportStartDate;
      if (exportEndDate) params.endDate = exportEndDate;
      if (exportSearch) params.search = exportSearch;

      const response = await api.get('/admin/audit-logs/export', {
        params,
        responseType: 'text',
      });
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Eflow_Audit_Logs_Export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      setShowExportModal(false);
      showToast('success', 'Audit logs exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      showToast('error', 'Failed to export logs');
    } finally {
      setIsExporting(false);
    }
  };

  const renderDashboardView = () => {
    // Make dashboard stats dynamic based on admin or staff role
    const isDashboardAdmin = isSuperAdmin || canManageUsers;
    const totalDocs = isDashboardAdmin && adminStats ? adminStats.documents.total : filteredDocs.length;
    const pendingDocs = isDashboardAdmin && adminStats ? adminStats.documents.pending : filteredDocs.filter(d => d.status === 'Pending').length;
    const approvedDocs = isDashboardAdmin && adminStats ? adminStats.documents.approved : filteredDocs.filter(d => d.status === 'Approved').length;
    const rejectedDocs = isDashboardAdmin && adminStats ? adminStats.documents.rejected : filteredDocs.filter(d => d.status === 'Rejected').length;

    return (
      <div className="space-y-8 animate-fade-in">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h2>
            <p className="text-gray-500 mt-1">Welcome back, {user?.name}. Here is your workflow overview.</p>
          </div>
          <button
            onClick={() => setActiveTab('services')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold shadow-md transition-all flex items-center gap-2">
            <span className="text-xl font-bold leading-none mb-0.5">+</span>
            New Request
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-500 mb-1">Waiting Approval</p>
              <h3 className="text-4xl font-black text-gray-900">{pendingDocs}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-orange-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-500 mb-1">Approved (YTD)</p>
              <h3 className="text-4xl font-black text-gray-900">{approvedDocs}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-500 mb-1">Rejected (YTD)</p>
              <h3 className="text-4xl font-black text-gray-900">{rejectedDocs}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-500 mb-1">Total Assigned</p>
              <h3 className="text-4xl font-black text-gray-900">{totalDocs}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            </div>
          </div>
        </div>

        {/* Global Recent Items Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex justify-between items-center p-6 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-900">Recent Items</h3>
            <button onClick={() => setShowAllRecent(!showAllRecent)} className="text-sm text-blue-600 font-bold hover:underline">
              {showAllRecent ? 'Show Less' : 'View All'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Document</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white text-sm">
                {(showAllRecent ? documents : documents.slice(0, 5)).map(doc => (
                  <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900 cursor-pointer hover:text-blue-600" onClick={() => setViewingDocument(doc)}>{doc.title}</p>
                      <p className="text-xs text-gray-500">{doc.submitter_id === user.id ? 'My Submission' : `Tag: ${doc.metadata_tag || 'None'}`}</p>
                    </td>
                    <td className="px-6 py-4">
                      {doc.status === 'Pending' && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5"></span>Pending Review</span>}
                      {doc.status === 'Approved' && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800"><span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>Approved</span>}
                      {doc.status === 'Rejected' && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800"><span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5"></span>Rejected</span>}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{new Date(doc.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => setViewingDocument(doc)} className="text-gray-400 hover:text-blue-600">
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
                {documents.length === 0 && (
                  <tr><td colSpan="4" className="px-6 py-8 text-center text-gray-500">No documents found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderTasksView = () => {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Assigned Tasks</h2>
            <p className="text-gray-500 mt-1">Manage, review, and approve your pending assignments.</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <input
              type="text" placeholder="Search tasks, ID, or status..."
              className="w-full sm:w-64 px-4 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Task List replacing Staff Review Queue */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Task ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Task Title</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date Assigned</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100 text-sm">
                {filteredDocs.filter(d => {
                    if (d.status !== 'Pending') return false;
                    
                    // Is it actually assigned to them?
                    const isDirectAssignee = d.current_assignee_id === user?.id;
                    const isRoleAssignee = !d.current_assignee_id && d.current_role_id === user?.role_id && (!d.current_department_id || d.current_department_id === user?.department_id);
                    
                    const branchData = d.parallel_branch_data;
                    let isParallelAssignee = false;
                    if (branchData && Array.isArray(branchData)) {
                        // Already completed?
                        if (branchData.completedBy && Array.isArray(branchData.completedBy) && branchData.completedBy.includes(user?.id)) return false;
                        isParallelAssignee = branchData.some(b => {
                            if (b.status !== 'Pending') return false;
                            if (b.assigneeId === user?.id) return true;
                            if (b.roleId === user?.role_id && (!b.departmentId || b.departmentId === user?.department_id)) return true;
                            return false;
                        });
                    } else if (branchData && branchData.completedBy && Array.isArray(branchData.completedBy) && branchData.completedBy.includes(user?.id)) {
                        return false;
                    }

                    if (!isDirectAssignee && !isRoleAssignee && !isParallelAssignee) return false;
                    return true;
                  }).length === 0 ? (
                  <tr><td colSpan="5" className="px-6 py-12 text-center text-gray-500">No pending assignments.</td></tr>
                ) : (
                  filteredDocs.filter(d => {
                    if (d.status !== 'Pending') return false;
                    
                    // Is it actually assigned to them?
                    const isDirectAssignee = d.current_assignee_id === user?.id;
                    const isRoleAssignee = !d.current_assignee_id && d.current_role_id === user?.role_id && (!d.current_department_id || d.current_department_id === user?.department_id);
                    
                    const branchData = d.parallel_branch_data;
                    let isParallelAssignee = false;
                    if (branchData && Array.isArray(branchData)) {
                        // Already completed?
                        if (branchData.completedBy && Array.isArray(branchData.completedBy) && branchData.completedBy.includes(user?.id)) return false;
                        isParallelAssignee = branchData.some(b => {
                            if (b.status !== 'Pending') return false;
                            if (b.assigneeId === user?.id) return true;
                            if (b.roleId === user?.role_id && (!b.departmentId || b.departmentId === user?.department_id)) return true;
                            return false;
                        });
                    } else if (branchData && branchData.completedBy && Array.isArray(branchData.completedBy) && branchData.completedBy.includes(user?.id)) {
                        return false;
                    }

                    if (!isDirectAssignee && !isRoleAssignee && !isParallelAssignee) return false;
                    return true;
                  }).map((doc) => {
                    const allowedTags = getNodeAllowedTags(doc);
                    const allowedActions = getNodeAllowedActions(doc);
                    const currentTag = localTags[doc.id] ?? (doc.metadata_tag || '');
                    return (
                      <tr key={doc.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-medium">#TSK-{doc.id.toString().substring(0, 4)}</td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-gray-900 cursor-pointer group-hover:text-blue-600" onClick={() => setViewingDocument(doc)}>{doc.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Assigned to your role</p>

                          {/* Tag Dropdown implementation embedded in flow */}
                          <div className="mt-2 flex items-center gap-2">
                            {currentTag && <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded bg-gray-100 text-gray-600">🏷️ {currentTag}</span>}
                            {allowedTags.length > 0 && (
                              <select
                                value={currentTag}
                                onChange={(e) => handleSetTag(doc.id, e.target.value)}
                                className="text-[10px] uppercase font-bold text-gray-600 border border-gray-200 rounded py-0.5 px-1 bg-white focus:outline-none focus:border-blue-500"
                              >
                                <option value="">+ SET TAG</option>
                                {allowedTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                              </select>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">{new Date(doc.created_at).toLocaleDateString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
                            Pending
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center space-x-2">
                          {/* Quick Action Buttons */}
                          <button onClick={() => setViewingDocument(doc)} className="text-gray-400 hover:text-blue-600 px-2 py-1 rounded text-xs font-bold border border-transparent hover:border-blue-200 hover:bg-blue-50 transition-colors">View</button>
                          {allowedActions.includes('approve') && (
                            <button onClick={() => handleRequestApproval(doc.id)} className="text-green-600 hover:text-white px-3 py-1 rounded text-xs font-bold border border-green-200 hover:bg-green-600 transition-colors">Approve</button>
                          )}
                          {allowedActions.includes('reject') && (
                            <button onClick={() => openRejectModal(doc.id)} className="text-red-500 hover:text-white px-3 py-1 rounded text-xs font-bold border border-red-200 hover:bg-red-500 transition-colors">Reject</button>
                          )}
                          {allowedActions.includes('attach_documents') && (
                            <button onClick={() => setViewingDocument(doc)} className="text-indigo-500 hover:text-white px-3 py-1 rounded text-xs font-bold border border-indigo-200 hover:bg-indigo-500 transition-colors">Attach</button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderServicesView = () => {
    // Filter workflows based on user's role
    // Admins can see all workflows regardless of allowedSubmitters restriction
    const staffWorkflows = workflows.filter(wf => {
      const flowData = typeof wf.flow_structure === 'string' ? JSON.parse(wf.flow_structure) : (wf.flow_structure || {});
      const meta = flowData.metadata || {};
      
      // Drafts (Unpublished workflows) are hidden from the services list entirely
      const isDraft = meta.isPublished === false || (meta.isPublished === undefined && meta.isComplete === false);
      if (isDraft) return false;

      if (canManageUsers || canCreateWorkflows) return true; // Admins see all live workflows

      const allowed = meta.allowedSubmitters || [];
      if (allowed.length === 0) return true; // Global service
      return allowed.includes(user.role_id);
    });

    const SERVICE_COLORS = [
      { bg: 'bg-blue-100', icon: 'text-blue-600', emoji: '📄' },
      { bg: 'bg-green-100', icon: 'text-green-600', emoji: '🎓' },
      { bg: 'bg-purple-100', icon: 'text-purple-600', emoji: '🪪' },
      { bg: 'bg-orange-100', icon: 'text-orange-600', emoji: '💻' },
    ];

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Select a Service</h2>
          <p className="text-gray-500 mt-1">Services displayed here are global or filtered specifically for your role.</p>
        </div>

        {staffWorkflows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            <p className="text-lg font-semibold mb-2">No services available</p>
            <p className="text-sm">There are currently no workflows assigned for your role to initiate.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {staffWorkflows.map((wf, idx) => {
              const { bg, icon, emoji } = SERVICE_COLORS[idx % SERVICE_COLORS.length];
              return (
                <button
                  key={wf.id}
                  onClick={() => setUploadWf(wf)}
                  className="bg-white rounded-xl border border-gray-200 p-6 text-left hover:shadow-lg hover:border-blue-300 transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center text-2xl shadow-sm`}>
                      {emoji}
                    </div>
                    <span className={`${icon} opacity-0 group-hover:opacity-100 transition-opacity bg-blue-50 p-1.5 rounded-full`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </span>
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2">{wf.name}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2">
                    {wf.description || 'Initiate this workflow to create a new submission and trigger the approval process.'}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderNotificationsView = () => {
    const typeStyles = {
      success: { border: 'border-l-green-500', bg: 'hover:bg-green-50', dot: 'bg-green-500', icon: '✅' },
      danger:  { border: 'border-l-red-500',   bg: 'hover:bg-red-50',   dot: 'bg-red-500',   icon: '🚨' },
      warning: { border: 'border-l-amber-400', bg: 'hover:bg-amber-50', dot: 'bg-amber-500', icon: '⚠️' },
      info:    { border: 'border-l-blue-400',  bg: 'hover:bg-blue-50',  dot: 'bg-blue-400',  icon: '📄' },
    };
    const timeAgo = (dateStr) => {
      const diff = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins} min ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
      return new Date(dateStr).toLocaleDateString();
    };
    const markAllRead = async () => {
      try {
        await api.patch('/notifications/mark-all-read');
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
      } catch (err) {
        showToast('error', 'Failed to mark notifications as read.');
      }
    };
    const markOneRead = async (id) => {
      try {
        await api.patch(`/notifications/${id}/read`);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (_) {}
    };

    return (
      <div className="space-y-6 animate-fade-in w-full max-w-4xl">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Notifications</h2>
            <p className="text-gray-500 mt-1">Stay updated with your latest alerts and workflow events.</p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-sm font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
            >
              ✓ Mark all as read ({unreadCount})
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            <p className="text-4xl mb-3">🔔</p>
            <p className="font-semibold text-lg">No notifications yet</p>
            <p className="text-sm mt-1">You're all caught up!</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100">
            {notifications.map(notif => {
              const style = typeStyles[notif.type] || typeStyles.info;
              return (
                <div
                  key={notif.id}
                  onClick={() => {
                    if (!notif.is_read) markOneRead(notif.id);
                    if (notif.document_id) {
                      const doc = documents.find(d => d.id === notif.document_id);
                      if (doc) setViewingDocument(doc);
                    }
                  }}
                  className={`p-5 flex items-start gap-4 transition-colors cursor-pointer border-l-4 ${style.border} ${style.bg} ${notif.is_read ? 'opacity-60' : ''}`}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg bg-gray-100 shrink-0">{style.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className={`text-sm font-bold ${notif.is_read ? 'text-gray-600' : 'text-gray-900'}`}>{notif.title}</h4>
                      <div className="flex items-center gap-2 shrink-0">
                        {!notif.is_read && <span className={`w-2 h-2 rounded-full ${style.dot} shrink-0`} />}
                        <span className="text-xs text-gray-400 whitespace-nowrap">{timeAgo(notif.created_at)}</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{notif.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderAdminSetupView = () => {
    return (
      <div className="space-y-6 animate-fade-in w-full max-w-6xl">
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Setup</h2>
              <p className="text-gray-500 mt-1">Configure workflows, manage users, and view audit logs.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setAdminView('overview')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${adminView === 'overview' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>Overview</button>
              {canCreateWorkflows && <button onClick={() => setAdminView('workflows')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${adminView === 'workflows' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>Workflow Builder</button>}
              {canManageUsers && <button onClick={() => setAdminView('users')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${adminView === 'users' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>Users</button>}
              <button onClick={() => setAdminView('logs')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${adminView === 'logs' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>Audit Logs</button>
              {canManageUsers && <button onClick={() => setAdminView('hierarchy')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${adminView === 'hierarchy' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>Hierarchy</button>}
            </div>
          </div>

          <div className="mt-6">
            {(!canManageUsers && !canCreateWorkflows) ? null : (
              <>
                {adminView === 'overview' && adminStats && (
                  <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 border-l-4 border-l-blue-500">
                      <h4 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Total Documents</h4>
                      <p className="text-3xl font-bold text-gray-800">{adminStats.documents.total}</p>
                    </div>
                    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 border-l-4 border-l-yellow-400">
                      <h4 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Pending Review</h4>
                      <p className="text-3xl font-bold text-gray-800">{adminStats.documents.pending}</p>
                    </div>
                    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 border-l-4 border-l-green-500">
                      <h4 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Fully Approved</h4>
                      <p className="text-3xl font-bold text-gray-800">{adminStats.documents.approved}</p>
                    </div>
                    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 border-l-4 border-l-red-500">
                      <h4 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Rejected</h4>
                      <p className="text-3xl font-bold text-gray-800">{adminStats.documents.rejected}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Document Status Breakdown</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Approved', value: adminStats.documents.approved },
                                { name: 'Pending', value: adminStats.documents.pending },
                                { name: 'Rejected', value: adminStats.documents.rejected }
                              ].filter(d => d.value > 0)}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              { [
                                { name: 'Approved', color: '#10B981' },
                                { name: 'Pending', color: '#FBBF24' },
                                { name: 'Rejected', color: '#EF4444' }
                              ].filter(c => {
                                 if (c.name === 'Approved' && adminStats.documents.approved > 0) return true;
                                 if (c.name === 'Pending' && adminStats.documents.pending > 0) return true;
                                 if (c.name === 'Rejected' && adminStats.documents.rejected > 0) return true;
                                 return false;
                              }).map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              )) }
                            </Pie>
                            <RechartsTooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">System Entities Overview</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={[
                              { name: 'Users', count: adminStats.users },
                              { name: 'Workflows', count: adminStats.workflows },
                              { name: 'Docs', count: adminStats.documents.total }
                            ]}
                            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B7280'}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280'}} allowDecimals={false} />
                            <RechartsTooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
                            <Bar dataKey="count" fill="#4F46E5" radius={[4, 4, 0, 0]} maxBarSize={60} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  </>
                )}

                {adminView === 'workflows' && canCreateWorkflows && <WorkflowBuilder />}
                {adminView === 'hierarchy' && canManageUsers && <RoleManager />}

                {adminView === 'users' && canManageUsers && (
                  <div className="flex flex-col gap-6">
                    {/* Bulk Import Panel */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-800">Bulk User Import</h3>
                          <p className="text-sm text-gray-500">Upload a CSV file with columns: <strong>Name, Email, Role, Department</strong>.</p>
                        </div>
                        <a href="data:text/csv;charset=utf-8,Name,Email,Role,Department%0AJohn%20Doe,john@example.com,Student,Computer%20Science" download="import_template.csv" className="text-sm font-bold text-indigo-600 hover:text-indigo-800">⬇ Download Template</a>
                      </div>
                      
                      {!importPreview ? (
                        <div className="flex items-center gap-4">
                          <input 
                            type="file" 
                            accept=".csv"
                            onChange={(e) => setImportFile(e.target.files[0])}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          />
                          <button 
                            onClick={async () => {
                              if (!importFile) return;
                              setIsImporting(true);
                              const formData = new FormData();
                              formData.append('file', importFile);
                              try {
                                const res = await api.post('/admin/users/import-preview', formData);
                                setImportPreview(res.data);
                              } catch (err) {
                                showToast('error', err.response?.data?.message || 'Failed to parse CSV.');
                              } finally {
                                setIsImporting(false);
                              }
                            }}
                            disabled={!importFile || isImporting}
                            className={`px-4 py-2 rounded font-bold text-white transition-colors shrink-0 ${importFile && !isImporting ? 'bg-indigo-600 hover:bg-indigo-700 shadow-sm' : 'bg-gray-300 cursor-not-allowed text-gray-500'}`}
                          >
                            {isImporting ? 'Parsing...' : 'Preview Import'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                              <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Row</th>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Name</th>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Email</th>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Role</th>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                                {importPreview.map((row, idx) => (
                                  <tr key={idx} className={row.isValid ? '' : 'bg-red-50'}>
                                    <td className="px-4 py-2">{row.rowNumber}</td>
                                    <td className="px-4 py-2">{row.name}</td>
                                    <td className="px-4 py-2">{row.email}</td>
                                    <td className="px-4 py-2">{row.role}</td>
                                    <td className="px-4 py-2 font-medium">
                                      {row.isValid ? (
                                        <span className="text-green-600">Valid</span>
                                      ) : (
                                        <span className="text-red-600 text-xs">{row.error}</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          
                          <div className="flex justify-between items-center bg-gray-50 p-3 rounded border border-gray-200">
                            <div className="text-sm text-gray-700">
                              <span className="font-bold text-green-600">{importPreview.filter(r => r.isValid).length}</span> valid users to import.
                              <span className="font-bold text-red-600 ml-2">{importPreview.filter(r => !r.isValid).length}</span> errors.
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => { setImportPreview(null); setImportFile(null); }}
                                className="px-4 py-1.5 rounded text-sm font-bold text-gray-600 border border-gray-300 hover:bg-gray-100 transition-colors"
                              >
                                Cancel
                              </button>
                              <button 
                                onClick={async () => {
                                  setIsImporting(true);
                                  try {
                                    const validUsers = importPreview.filter(r => r.isValid);
                                    if (validUsers.length === 0) {
                                      showToast('error', 'No valid users to import.');
                                      return;
                                    }
                                    
                                    await api.post('/admin/request-otp');
                                    setAdminOtpAction({ type: 'bulk_import', payload: { validUsers } });
                                    setAdminOtpInput('');
                                    setShowAdminOtpModal(true);
                                    
                                  } catch (err) {
                                    showToast('error', err.response?.data?.message || 'Failed to request Admin OTP.');
                                  } finally {
                                    setIsImporting(false);
                                  }
                                }}
                                disabled={isImporting || importPreview.filter(r => r.isValid).length === 0}
                                className="px-4 py-1.5 rounded text-sm font-bold text-white bg-green-600 hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50"
                              >
                                {isImporting ? 'Importing...' : 'Confirm & Import Valid Users'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Existing User List */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200 text-sm">
                        {usersList.map((listUser) => (
                          <tr key={listUser.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{listUser.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-gray-500">{listUser.email}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <select
                                className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                value={listUser.role_id || ''}
                                onChange={(e) => handleRoleChange(listUser.id, e.target.value)}
                                disabled={listUser.id === user.id}
                              >
                                <option value={1}>Student (Legacy)</option>
                                <option value={2}>Staff (Legacy)</option>
                                <option value={3}>Super Admin</option>
                                <optgroup label="Custom Roles">
                                  {dynamicRoles.filter(r => r.is_active).map(role => (
                                    <option key={role.id} value={role.id}>{role.name}</option>
                                  ))}
                                </optgroup>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}

                {adminView === 'logs' && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                    <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                      <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">System Audit Trail</h4>
                      <button
                        onClick={() => {
                          setShowExportModal(true);
                        }}
                        className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-bold hover:bg-green-700 shadow-sm flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Export CSV
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Document</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                          {auditLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                              <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{log.action}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-gray-600">{log.document_title || 'System Action'}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-gray-600">{log.user_name || 'System'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSearchResultsView = () => {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Search Results for "{searchQuery}"</h2>
            <p className="text-gray-500 mt-1">Found {filteredDocs.length} items matching your query.</p>
          </div>
          <button onClick={() => setSearchQuery('')} className="text-sm font-semibold text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors">Clear Search</button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type / ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Title & Text Match</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100 text-sm">
                {filteredDocs.length === 0 ? (
                  <tr><td colSpan="4" className="px-6 py-12 text-center text-gray-500">No results found for "{searchQuery}".</td></tr>
                ) : (
                  filteredDocs.map(doc => {
                    const isTask = doc.status === 'Pending' && doc.submitter_id !== user?.id;
                    return (
                      <tr key={doc.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {isTask ? (
                            <span className="inline-flex items-center gap-1.5 text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                              Task #{doc.id.toString().substring(0, 4)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                              Doc #{doc.id.toString().substring(0, 4)}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-gray-900 cursor-pointer group-hover:text-blue-600" onClick={() => setViewingDocument(doc)}>{doc.title}</p>
                          {doc.extracted_text && doc.extracted_text.toLowerCase().includes(searchQuery.toLowerCase()) && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2 italic">
                              "... {doc.extracted_text.substring(Math.max(0, doc.extracted_text.toLowerCase().indexOf(searchQuery.toLowerCase()) - 30), doc.extracted_text.toLowerCase().indexOf(searchQuery.toLowerCase()) + 60)} ..."
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {doc.status === 'Pending' && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5"></span>Pending Review</span>}
                          {doc.status === 'Approved' && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800"><span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>Approved</span>}
                          {doc.status === 'Rejected' && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800"><span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5"></span>Rejected</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button onClick={() => setViewingDocument(doc)} className="text-blue-600 hover:text-white px-3 py-1.5 rounded text-xs font-bold border border-blue-200 hover:bg-blue-600 transition-colors">View Details</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ── Students get redirected to the new dedicated student portal ──────────
  if (isStudent) return <StudentPortal />;

  return (
    <div className="min-h-screen bg-[#f8f9fc] flex font-sans">
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-64 bg-white border-r border-gray-100 flex flex-col flex-shrink-0 sticky top-0 h-screen hidden md:flex">
        <div className="p-6 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">E-Flow Portal</span>
        </div>

        <div className="px-4 py-6 text-xs font-bold text-gray-400 uppercase tracking-widest">Menu</div>

        <nav className="flex-1 px-3 space-y-1">
          <button onClick={() => { setActiveTab('dashboard'); setSearchQuery(''); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-semibold text-sm transition-all ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            Dashboard
          </button>

          <button onClick={() => { setActiveTab('services'); setSearchQuery(''); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-semibold text-sm transition-all ${activeTab === 'services' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            Services
          </button>

          <button onClick={() => { setActiveTab('notifications'); setSearchQuery(''); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-semibold text-sm transition-all ${activeTab === 'notifications' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              Notifications
            </div>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{unreadCount}</span>
            )}
          </button>

          <button onClick={() => { setActiveTab('tasks'); setSearchQuery(''); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-semibold text-sm transition-all ${activeTab === 'tasks' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
            Tasks
          </button>

          {(canManageUsers || canCreateWorkflows) && (
            <button onClick={() => { setActiveTab('admin'); setSearchQuery(''); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-semibold text-sm transition-all ${activeTab === 'admin' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
              <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Admin Setup
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-gray-100 mt-auto">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-semibold text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors">
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Logout
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-20 bg-white border-b border-gray-100 flex items-center justify-between px-8 sticky top-0 z-10 w-full">
          <div className="w-full max-w-xl">
            <div className="relative">
              <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                type="text"
                placeholder={activeTab === 'tasks' ? "Search tasks, ID, or status..." : "Search documents, tasks..."}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-transparent rounded-lg text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-gray-700"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-6 ml-4">
            <button onClick={() => window.document.documentElement.classList.toggle('dark-theme')} className="relative text-gray-400 hover:text-gray-600 transition-colors">
              <span className="w-6 h-6 block text-center leading-6">🌙</span>
            </button>
            <button onClick={() => { setActiveTab('notifications'); setSearchQuery(''); }} className="relative text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-2 border-white rounded-full text-white text-[9px] font-bold flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            <div className="h-8 w-px bg-gray-200 hidden sm:block"></div>
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/profile')}>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-gray-900">{user?.name}</p>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{(dynamicRoles.find(r => r.id === user?.role_id)?.name) || (isSuperAdmin ? 'System Admin' : 'Staff')}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border-2 border-white shadow-sm overflow-hidden">
                <img src={`https://ui-avatars.com/api/?name=${user?.name}&background=eff6ff&color=1d4ed8`} alt="avatar" />
              </div>
            </div>
          </div>
        </header>

        {/* NEW: Admin OTP Modal */}
        {showAdminOtpModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative">
              <h2 className="text-xl font-bold mb-4">Admin Security Verification</h2>
              <p className="text-sm text-gray-600 mb-6">
                To proceed with this sensitive action, please enter the 6-digit verification code sent to your email.
              </p>
              <input
                type="text"
                placeholder="000000"
                maxLength={6}
                value={adminOtpInput}
                onChange={(e) => setAdminOtpInput(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center text-3xl tracking-widest font-mono p-4 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none mb-6"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowAdminOtpModal(false); setAdminOtpAction(null); setAdminOtpInput(''); }}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdminOtpSubmit}
                  disabled={adminOtpInput.length !== 6 || isAdminVerifyingOtp}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isAdminVerifyingOtp ? 'Verifying...' : 'Verify & Proceed'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Toast Notification */}
        {toastMessage.text && (
          <div className="fixed top-24 right-8 z-50 animate-fade-in">
            <div className={`px-6 py-4 rounded-xl shadow-2xl border-l-4 font-semibold text-sm flex items-center gap-3 ${toastMessage.type === 'error' ? 'bg-white border-red-500 text-red-700' : 'bg-white border-green-500 text-green-700'}`}>
              <span className="text-xl">{toastMessage.type === 'error' ? '🚨' : '✅'}</span>
              {toastMessage.text}
            </div>
          </div>
        )}

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 relative">
          <div className="max-w-[1400px] mx-auto">
            {searchQuery ? renderSearchResultsView() : (
              <>
                {activeTab === 'dashboard' && renderDashboardView()}
                {activeTab === 'services' && renderServicesView()}
                {activeTab === 'tasks' && renderTasksView()}
                {activeTab === 'notifications' && renderNotificationsView()}
                {activeTab === 'admin' && renderAdminSetupView()}
              </>
            )}
          </div>
        </main>

        {/* MODAL 1: MANDATORY CHECKLIST */}
        {showChecklistModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md border-t-4 border-amber-500">
              <h3 className="text-xl font-black text-gray-800 mb-2">Mandatory Tasks</h3>
              <p className="text-sm text-gray-600 mb-4">You must complete all checklist items to unlock approval.</p>

              <div className="space-y-3 mb-6">
                {currentChecklist.map((item, idx) => (
                  <label key={idx} className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="checkbox"
                      className="mt-1 w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                      checked={checkedItems.includes(idx)}
                      onChange={(e) => {
                        if (e.target.checked) setCheckedItems([...checkedItems, idx]);
                        else setCheckedItems(checkedItems.filter(i => i !== idx));
                      }}
                    />
                    <span className="text-sm font-medium text-gray-800 leading-snug">{item}</span>
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setShowChecklistModal(false)} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded">Cancel</button>
                <button
                  onClick={() => proceedToOtp(selectedDocId)}
                  disabled={checkedItems.length !== currentChecklist.length || isRequestingOtp}
                  className={`px-4 py-2 rounded font-bold text-white transition-colors ${checkedItems.length === currentChecklist.length && !isRequestingOtp ? 'bg-indigo-600 hover:bg-indigo-700 shadow-md' : 'bg-gray-300 cursor-not-allowed text-gray-500'}`}
                >
                  {isRequestingOtp ? 'Processing...' : 'Proceed to Sign'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: OTP / 2FA */}
        {showOtpModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md">
              <h3 className="text-lg font-bold mb-2">Verify & Approve</h3>
              <p className="text-sm text-gray-600 mb-4">Enter the OTP sent to your email to confirm your approval.</p>
              
              <input type="text" placeholder="Enter OTP from email" className="w-full px-3 py-2 border rounded-md mb-4" value={otpInput} onChange={(e) => setOtpInput(e.target.value)} />

              {/* Signature preview — always from profile, no live drawing */}
              <div className="border border-gray-200 rounded-md bg-gray-50 mb-4 p-3">
                {savedSignature ? (
                  <div className="text-center">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Your Registered Signature</p>
                    <img src={savedSignature} alt="Registered Signature" className="h-16 mx-auto object-contain" />
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-amber-700 font-semibold">⚠️ No signature registered</p>
                    <p className="text-xs text-gray-500 mt-1">Go to your <strong>Profile</strong> to register your signature before approving documents.</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setShowOtpModal(false)} className="px-4 py-2 text-gray-600">Cancel</button>
                <button 
                  onClick={handleSubmitOtp} 
                  disabled={isApproving || !savedSignature}
                  className={`px-4 py-2 text-white rounded font-bold transition-colors ${isApproving || !savedSignature ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  {isApproving ? 'Approving...' : 'Sign & Approve'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: REJECT */}
        {showRejectModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md">
              <h3 className="text-lg font-bold text-red-600 mb-2">Reject Document</h3>
              <textarea className="w-full px-3 py-2 border rounded-md mb-4" rows="3" placeholder="Reason..." value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowRejectModal(false)} className="px-4 py-2 text-gray-600">Cancel</button>
                <button onClick={handleRejectSubmit} disabled={isRejecting} className={`px-4 py-2 text-white rounded font-bold ${isRejecting ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}>
                  {isRejecting ? 'Rejecting...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 4: RESUBMIT */}
        {showResubmitModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md">
              <h3 className="text-lg font-bold text-indigo-600 mb-2">Fix & Resubmit</h3>
              <input type="file" accept="image/*,.pdf" onChange={(e) => setResubmitFile(e.target.files[0])} className="w-full px-3 py-2 border rounded-md mb-4" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowResubmitModal(false)} className="px-4 py-2 text-gray-600">Cancel</button>
                <button onClick={handleResubmit} disabled={isResubmitting} className={`px-4 py-2 text-white rounded font-bold ${isResubmitting ? 'bg-indigo-400' : 'bg-indigo-600'}`}>
                  {isResubmitting ? 'Processing...' : 'Upload & Resubmit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DOCUMENT VIEWER MODAL */}
        {viewingDocument && (
          <DocumentDetailsModal document={viewingDocument} onClose={() => setViewingDocument(null)} />
        )}

        {/* Upload Modal for Services */}
        {uploadWf && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="w-full max-w-lg bg-white rounded-xl overflow-hidden shadow-2xl">
              <div className="flex justify-between items-center p-4 border-b border-gray-100">
                <div>
                  <h3 className="font-bold text-gray-900">{uploadWf.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Submit your request details below.</p>
                </div>
                <button onClick={() => setUploadWf(null)} className="text-gray-400 hover:text-gray-800 text-xl font-bold">&times;</button>
              </div>
              <div className="p-2">
                {/* Leveraging the existing DocumentUpload component but forcing workflow ID */}
                <DocumentUpload
                  onUploadSuccess={() => { setUploadWf(null); fetchData(); setActiveTab('tasks'); }}
                  forcedWorkflowId={uploadWf.id}
                />
              </div>
            </div>
          </div>
        )}

        {/* MODAL 6: EXPORT AUDIT LOGS */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Export Audit Logs</h3>
              <p className="text-sm text-gray-500 mb-6">Filter the history to download specific logs. Leave empty to download the entire system history.</p>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Start Date</label>
                  <input type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">End Date</label>
                  <input type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Search (User, Action, Document)</label>
                  <input type="text" value={exportSearch} onChange={(e) => setExportSearch(e.target.value)} placeholder="e.g. Approved, John Doe..." className="w-full px-3 py-2 border rounded-md" />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-md transition-colors">Cancel</button>
                <button 
                  onClick={handleExport} 
                  disabled={isExporting} 
                  className={`px-5 py-2 text-white font-bold rounded-md shadow-sm transition-colors ${isExporting ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                >
                  {isExporting ? 'Generating CSV...' : 'Download CSV'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;