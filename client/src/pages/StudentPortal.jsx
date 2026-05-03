import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import DocumentDetailsModal from '../components/DocumentDetailsModal';
import api from '../api';

// ─── Icons (inline SVGs for zero deps) ───────────────────────────────────────
const Icon = ({ d, className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
);
const IcoDashboard = () => <Icon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />;
const IcoDocs = () => <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />;
const IcoServices = () => <Icon d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />;
const IcoBell = () => <Icon d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />;
const IcoArrow = () => <Icon d="M9 5l7 7-7 7" className="w-4 h-4" />;
const IcoSearch = () => <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />;
const IcoSettings = () => <Icon d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />;

// Service card icon colors (cycle through for each workflow)
const SERVICE_COLORS = [
    { bg: 'bg-blue-100', icon: 'text-blue-600', emoji: '📄' },
    { bg: 'bg-green-100', icon: 'text-green-600', emoji: '🎓' },
    { bg: 'bg-purple-100', icon: 'text-purple-600', emoji: '🪪' },
    { bg: 'bg-orange-100', icon: 'text-orange-600', emoji: '💻' },
    { bg: 'bg-pink-100', icon: 'text-pink-600', emoji: '📅' },
    { bg: 'bg-cyan-100', icon: 'text-cyan-600', emoji: '💬' },
];

// Status pill styles
const statusStyle = (status) => {
    if (!status) return 'bg-gray-100 text-gray-600';
    const s = status.toLowerCase();
    if (s === 'approved') return 'bg-green-100 text-green-700';
    if (s === 'rejected') return 'bg-red-100 text-red-700';
    if (s === 'pending') return 'bg-yellow-100 text-yellow-700';
    return 'bg-blue-100 text-blue-700'; // In Review / other
};

const statusLabel = (status) => {
    if (!status) return 'Unknown';
    if (status === 'Pending') return 'In Review';
    return status;
};

// Relative time helper
const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
    return new Date(dateStr).toLocaleDateString();
};

// ─── Upload Modal (when student picks a service/workflow) ────────────────────
const UploadModal = ({ workflow, onClose, onSuccess }) => {
    const [title, setTitle] = useState('');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file || !title.trim()) return setError('Please provide a title and select a file.');
        setLoading(true); setError('');
        const fd = new FormData();
        fd.append('title', title);
        fd.append('document', file);
        fd.append('workflow_id', workflow.id);
        try {
            await api.post('/documents/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            onSuccess();
            onClose();
        } catch (err) {
            setError(err.response?.data?.message || 'Upload failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className="p-6 border-b border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">{workflow.name}</h2>
                            <p className="text-sm text-gray-500 mt-1">Fill in the details and attach your document.</p>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
                    </div>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg border border-red-200">{error}</div>}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Document Title</label>
                        <input
                            type="text" value={title} onChange={e => setTitle(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g. Thesis Proposal V2" required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Attach File</label>
                        <input
                            type="file" accept="image/*,.pdf"
                            onChange={e => setFile(e.target.files[0])}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-gray-300 rounded-lg p-2"
                            required
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                            {loading ? 'Submitting...' : 'Submit Request'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── Resubmit Modal ───────────────────────────────────────────────────────────
const ResubmitModal = ({ docId, onClose, onSuccess }) => {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!file) return;
        setLoading(true);
        const fd = new FormData();
        fd.append('document', file);
        try {
            await api.put(`/documents/resubmit/${docId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            onSuccess();
            onClose();
        } catch { /* ignore */ }
        finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-indigo-700">Fix & Resubmit</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
                </div>
                <input type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files[0])}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2 mb-4" />
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSubmit} disabled={loading || !file} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                        {loading ? 'Uploading...' : 'Upload & Resubmit'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Sub-views for Student Portal ─────────────────────────────────────────────
const DashboardView = ({ user, stats, recentDocs, workflows, setViewingDoc, setActiveView }) => (
    <div>
        {/* Welcome row */}
        <div className="flex items-start justify-between mb-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name?.split(' ')[0] || 'Student'}!</h1>
                <p className="text-gray-500 mt-1">Here's a summary of your document activity.</p>
            </div>
            <button
                onClick={() => setActiveView('services')}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-colors"
            >
                <span className="text-lg font-bold">+</span> Request New Service
            </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
                { label: 'Total Submitted', value: stats.total, color: 'text-gray-900' },
                { label: 'Pending Approval', value: stats.pending, color: 'text-orange-500' },
                { label: 'Completed', value: stats.approved, color: 'text-green-600' },
                { label: 'Rejected', value: stats.rejected, color: 'text-red-500' },
            ].map(({ label, value, color }) => (
                <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <p className="text-sm text-gray-500 mb-2">{label}</p>
                    <p className={`text-3xl font-bold ${color}`}>{value}</p>
                </div>
            ))}
        </div>

        {/* Recent Documents */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-900">Recent Documents</h2>
            </div>
            <table className="w-full">
                <thead>
                    <tr className="border-b border-gray-100">
                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Updated</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {recentDocs.length === 0 ? (
                        <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400 text-sm">No documents yet. <button onClick={() => setActiveView('services')} className="text-blue-600 font-semibold hover:underline">Submit your first request →</button></td></tr>
                    ) : recentDocs.map(doc => {
                        const wf = workflows.find(w => w.id === doc.workflow_id);
                        return (
                            <tr key={doc.id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => setViewingDoc(doc)}>
                                <td className="px-6 py-4">
                                    <p className="text-sm font-semibold text-gray-900">{doc.title}</p>
                                    {parseInt(doc.total_prereqs || 0) > 0 && (
                                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                            <div className="w-full max-w-[150px] bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                                <div className="bg-blue-600 h-1.5 transition-all duration-300" style={{ width: `${(doc.fulfilled_prereqs / doc.total_prereqs) * 100}%` }}></div>
                                            </div>
                                            <p className="text-[10px] text-gray-500 mt-1 font-semibold">{doc.fulfilled_prereqs} of {doc.total_prereqs} clearances approved</p>
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">{wf?.name || 'General'}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle(doc.status)}`}>
                                        {statusLabel(doc.status)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">{timeAgo(doc.updated_at || doc.created_at)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
);

const ServicesView = ({ workflows, user, myDocs, setUploadWf }) => {
    const studentWorkflows = workflows.filter(wf => {
        const flowData = typeof wf.flow_structure === 'string' ? JSON.parse(wf.flow_structure) : (wf.flow_structure || {});
        const meta = flowData.metadata || {};
        
        // Drafts (Unpublished workflows) are hidden from students
        const isDraft = meta.isPublished === false || (meta.isPublished === undefined && meta.isComplete === false);
        if (isDraft) return false;

        const allowed = meta.allowedSubmitters || [];
        if (allowed.length === 0) return true; // Global service
        return allowed.includes(user.role_id);
    });

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Select a Service</h1>
                <p className="text-gray-500 mt-1">Choose the type of request you would like to initiate.</p>
            </div>
            {studentWorkflows.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
                    <p className="text-lg font-semibold mb-2">No services available</p>
                    <p className="text-sm">Please check back later or contact your administrator.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {studentWorkflows.map((wf, idx) => {
                        const { bg, icon, emoji } = SERVICE_COLORS[idx % SERVICE_COLORS.length];
                        
                        const flowData = typeof wf.flow_structure === 'string' ? JSON.parse(wf.flow_structure) : (wf.flow_structure || {});
                        const prereqId = flowData.metadata?.prerequisiteWorkflowId;
                        let isLocked = false;
                        let lockMessage = '';
                        if (prereqId) {
                            const hasApproved = myDocs.some(d => d.workflow_id === parseInt(prereqId) && d.status === 'Approved');
                            if (!hasApproved) {
                                isLocked = true;
                                const prereqWf = workflows.find(w => w.id === parseInt(prereqId));
                                lockMessage = `Requires "${prereqWf?.name || 'Previous workflow'}" to be approved first.`;
                            }
                        }

                        return (
                            <button
                                key={wf.id}
                                onClick={() => !isLocked && setUploadWf(wf)}
                                className={`bg-white rounded-xl border border-gray-200 p-6 text-left transition-all group relative ${isLocked ? 'opacity-60 cursor-not-allowed bg-gray-50' : 'hover:shadow-md hover:border-blue-200'}`}
                            >
                                {isLocked && <div className="absolute top-3 right-3 text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded font-bold" title={lockMessage}>Locked 🔒</div>}
                                <div className="flex items-start justify-between mb-4">
                                    <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center text-xl ${isLocked ? 'grayscale opacity-50' : ''}`}>
                                        {emoji}
                                    </div>
                                    {!isLocked && (
                                        <span className={`${icon} opacity-0 group-hover:opacity-100 transition-opacity`}>
                                            <IcoArrow />
                                        </span>
                                    )}
                                </div>
                                <h3 className="font-bold text-gray-900 text-base mb-1.5">{wf.name}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">
                                    {wf.description || 'Submit a request through this workflow for review and approval.'}
                                </p>
                                {isLocked && <p className="text-xs text-red-600 mt-2 font-semibold">{lockMessage}</p>}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const MyDocsView = ({ filteredDocs, myDocs, workflows, setViewingDoc, setResubmitId }) => {
    const [statusFilter, setStatusFilter] = useState('all');
    const displayed = filteredDocs.filter(d =>
        statusFilter === 'all' ? true :
            statusFilter === 'approved' ? d.status === 'Approved' :
                statusFilter === 'pending' ? d.status === 'Pending' :
                    statusFilter === 'rejected' ? d.status === 'Rejected' : true
    );

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">My Documents</h1>
                <p className="text-gray-500 mt-1">View and manage your submitted documents.</p>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap gap-2 items-center justify-between">
                    <div className="flex gap-2 flex-wrap">
                        {[
                            { key: 'all', label: 'All' },
                            { key: 'pending', label: 'In Review' },
                            { key: 'approved', label: 'Approved' },
                            { key: 'rejected', label: 'Rejected' },
                        ].map(f => (
                            <button
                                key={f.key}
                                onClick={() => setStatusFilter(f.key)}
                                className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${statusFilter === f.key
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                                    }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <span className="text-sm text-gray-500">Showing {displayed.length} of {myDocs.length} results</span>
                </div>

                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Document Name</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted Date</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {displayed.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 text-sm">No documents found.</td></tr>
                        ) : displayed.map(doc => {
                            const wf = workflows.find(w => w.id === doc.workflow_id);
                            return (
                                <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{doc.title}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{wf?.name || 'General'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle(doc.status)}`}>
                                            {statusLabel(doc.status)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(doc.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                                    <td className="px-6 py-4 text-sm">
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => setViewingDoc(doc)} className="text-blue-600 hover:text-blue-800 font-semibold">View</button>
                                            {doc.status === 'Rejected' && (
                                                <button onClick={() => setResubmitId(doc.id)} className="text-indigo-600 hover:text-indigo-800 font-semibold">Resubmit</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const NotificationsView = ({ myDocs, setResubmitId }) => {
    const rejected = myDocs.filter(d => d.status === 'Rejected').slice(0, 3);
    const approved = myDocs.filter(d => d.status === 'Approved').slice(0, 3);
    const pending = myDocs.filter(d => d.status === 'Pending').slice(0, 3);

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            </div>

            <div className="space-y-6">
                {rejected.length > 0 && (
                    <section>
                        <h2 className="text-base font-bold text-gray-700 mb-3">Action Required</h2>
                        <div className="space-y-2">
                            {rejected.map(doc => (
                                <div key={doc.id} className="flex items-start gap-4 p-4 bg-white rounded-xl border border-gray-200 border-l-4 border-l-orange-400 shadow-sm">
                                    <div className="w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold text-xs flex-shrink-0 mt-0.5">!</div>
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-gray-900">"{doc.title}" was rejected — action required</p>
                                        <p className="text-xs text-gray-500 mt-0.5">Your document needs to be revised and resubmitted.</p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className="text-xs text-gray-400">{timeAgo(doc.updated_at || doc.created_at)}</span>
                                        <button onClick={() => setResubmitId(doc.id)} className="text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-lg font-semibold transition-colors">Resubmit</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {approved.length > 0 && (
                    <section>
                        <h2 className="text-base font-bold text-gray-700 mb-3">Approved</h2>
                        <div className="space-y-2">
                            {approved.map(doc => (
                                <div key={doc.id} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                                    <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center text-green-600 flex-shrink-0">✓</div>
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-gray-900">"{doc.title}" has been approved</p>
                                        <p className="text-xs text-gray-500 mt-0.5">Your request was successfully processed.</p>
                                    </div>
                                    <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(doc.updated_at || doc.created_at)}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {pending.length > 0 && (
                    <section>
                        <h2 className="text-base font-bold text-gray-700 mb-3">In Review</h2>
                        <div className="space-y-2">
                            {pending.map(doc => (
                                <div key={doc.id} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                                    <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 flex-shrink-0">
                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" /></svg>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-gray-900">"{doc.title}" is currently under review</p>
                                        <p className="text-xs text-gray-500 mt-0.5">You'll be notified once a decision is made.</p>
                                    </div>
                                    <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(doc.updated_at || doc.created_at)}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {rejected.length === 0 && approved.length === 0 && pending.length === 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
                        <p className="text-4xl mb-3">🔔</p>
                        <p className="font-semibold">No notifications yet</p>
                        <p className="text-sm mt-1">Submit a request to get started.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Main Student Portal ──────────────────────────────────────────────────────
const StudentPortal = () => {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const [activeView, setActiveView] = useState('dashboard');
    const [documents, setDocuments] = useState([]);
    const [workflows, setWorkflows] = useState([]);
    const [searchQuery, setSearch] = useState('');
    const [viewingDoc, setViewingDoc] = useState(null);
    const [uploadWf, setUploadWf] = useState(null);   // workflow chosen for upload
    const [resubmitId, setResubmitId] = useState(null);

    const fetchAll = async () => {
        try {
            const [docsRes, wfsRes] = await Promise.all([
                api.get('/documents'),
                api.get('/workflows'),
            ]);
            setDocuments(docsRes.data);
            setWorkflows(wfsRes.data);
        } catch (e) { console.error(e); }
    };

    useEffect(() => { fetchAll(); }, []);

    const myDocs = documents.filter(d => d.submitter_id === user?.id);
    const stats = {
        total: myDocs.length,
        pending: myDocs.filter(d => d.status === 'Pending').length,
        approved: myDocs.filter(d => d.status === 'Approved').length,
        rejected: myDocs.filter(d => d.status === 'Rejected').length,
    };
    const recentDocs = [...myDocs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    const filteredDocs = myDocs.filter(d => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        
        const workflowName = d.workflow_id ? workflows.find(w => w.id === d.workflow_id)?.name?.toLowerCase() : '';
        const workflowMatch = workflowName && workflowName.includes(q);

        return d.title?.toLowerCase().includes(q) || 
               d.extracted_text?.toLowerCase().includes(q) ||
               d.status?.toLowerCase().includes(q) ||
               (d.metadata_tag && d.metadata_tag.toLowerCase().includes(q)) ||
               workflowMatch;
    });

    const navItems = [
        { key: 'dashboard', label: 'Dashboard', Icon: IcoDashboard },
        { key: 'my-docs', label: 'My Documents', Icon: IcoDocs },
        { key: 'services', label: 'Services', Icon: IcoServices },
        { key: 'notifications', label: 'Notifications', Icon: IcoBell },
    ];

    const renderSearchResultsView = () => (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Search Results for "{searchQuery}"</h2>
                    <p className="text-gray-500 mt-1">Found {filteredDocs.length} items matching your query.</p>
                </div>
                <button onClick={() => setSearch('')} className="text-sm font-semibold text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors">Clear Search</button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Document Details</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredDocs.length === 0 ? (
                            <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-500">No results found for "{searchQuery}".</td></tr>
                        ) : filteredDocs.map(doc => (
                            <tr key={doc.id} className="hover:bg-gray-50 transition-colors group">
                                <td className="px-6 py-4">
                                    <p className="font-bold text-gray-900 cursor-pointer group-hover:text-blue-600" onClick={() => setViewingDoc(doc)}>{doc.title}</p>
                                    {doc.extracted_text && doc.extracted_text.toLowerCase().includes(searchQuery.toLowerCase()) && (
                                        <p className="text-xs text-gray-500 mt-1 line-clamp-2 italic">
                                            "... {doc.extracted_text.substring(Math.max(0, doc.extracted_text.toLowerCase().indexOf(searchQuery.toLowerCase()) - 30), doc.extracted_text.toLowerCase().indexOf(searchQuery.toLowerCase()) + 60)} ..."
                                        </p>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle(doc.status)}`}>
                                        {statusLabel(doc.status)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">{new Date(doc.created_at).toLocaleDateString()}</td>
                                <td className="px-6 py-4 text-center">
                                    <button onClick={() => setViewingDoc(doc)} className="text-blue-600 hover:text-white px-3 py-1.5 rounded text-xs font-bold border border-blue-200 hover:bg-blue-600 transition-colors">View Document</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Sidebar */}
            <aside className="w-56 min-h-screen bg-white border-r border-gray-200 flex flex-col fixed left-0 top-0 z-40">
                {/* Logo */}
                <div className="px-5 py-5 border-b border-gray-100">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-bold text-gray-900 text-sm leading-none">E-Flow</p>
                            <p className="text-xs text-gray-500 mt-0.5">Student Portal</p>
                        </div>
                    </div>
                </div>

                {/* Nav Items */}
                <nav className="flex-1 py-4 px-3 space-y-1">
                    {navItems.map(({ key, label, Icon }) => (
                        <button
                            key={key}
                            onClick={() => { setActiveView(key); setSearch(''); }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeView === key
                                ? 'bg-blue-50 text-blue-600'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                }`}
                        >
                            <span className={activeView === key ? 'text-blue-600' : 'text-gray-400'}><Icon /></span>
                            {label}
                        </button>
                    ))}
                </nav>

                {/* Bottom: Settings + Logout */}
                <div className="px-3 py-4 border-t border-gray-100 space-y-1">
                    <button
                        onClick={() => navigate('/profile')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        <span className="text-gray-400"><IcoSettings /></span>
                        Settings
                    </button>
                    <button
                        onClick={() => { logout(); navigate('/login'); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Log out
                    </button>
                </div>
            </aside>

            {/* Header */}
            <header className="fixed top-0 left-56 right-0 h-14 bg-white border-b border-gray-200 z-30 flex items-center px-6 gap-4">
                <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <IcoSearch />
                    </span>
                    <input
                        type="text"
                        placeholder="Search documents..."
                        value={searchQuery}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 pr-4 py-2 text-sm bg-gray-100 rounded-lg w-72 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                    />
                </div>
                <div className="flex items-center gap-3 ml-auto">
                    <button onClick={() => window.document.documentElement.classList.toggle('dark-theme')} className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">🌙</button>
                    <button
                        onClick={() => { setActiveView('notifications'); setSearch(''); }}
                        className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-lg transition-colors relative"
                    >
                        <IcoBell />
                    </button>
                    <button onClick={() => navigate('/profile')} className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                        {user?.name?.[0]?.toUpperCase() || 'S'}
                    </button>
                </div>
            </header>

            <main className="ml-56 pt-14">
                <div className="max-w-5xl mx-auto px-8 py-8">
                    {searchQuery ? renderSearchResultsView() : (
                        <>
                            {activeView === 'dashboard' && (
                                <DashboardView
                                    user={user}
                                    stats={stats}
                                    recentDocs={recentDocs}
                                    workflows={workflows}
                                    setViewingDoc={setViewingDoc}
                                    setActiveView={setActiveView}
                                />
                            )}
                            {activeView === 'services' && (
                                <ServicesView
                                    workflows={workflows}
                                    user={user}
                                    myDocs={myDocs}
                                    setUploadWf={setUploadWf}
                                />
                            )}
                            {activeView === 'my-docs' && (
                                <MyDocsView
                                    filteredDocs={filteredDocs}
                                    myDocs={myDocs}
                                    workflows={workflows}
                                    setViewingDoc={setViewingDoc}
                                    setResubmitId={setResubmitId}
                                />
                            )}
                            {activeView === 'notifications' && (
                                <NotificationsView
                                    myDocs={myDocs}
                                    setResubmitId={setResubmitId}
                                />
                            )}
                        </>
                    )}
                </div>
            </main>

            {/* Upload Modal */}
            {uploadWf && (
                <UploadModal
                    workflow={uploadWf}
                    onClose={() => setUploadWf(null)}
                    onSuccess={() => { fetchAll(); setActiveView('my-docs'); }}
                />
            )}

            {/* Resubmit Modal */}
            {resubmitId && (
                <ResubmitModal
                    docId={resubmitId}
                    onClose={() => setResubmitId(null)}
                    onSuccess={() => { fetchAll(); setResubmitId(null); }}
                />
            )}

            {/* Document Detail Modal */}
            {viewingDoc && (
                <DocumentDetailsModal document={viewingDoc} onClose={() => setViewingDoc(null)} />
            )}
        </div>
    );
};

export default StudentPortal;
