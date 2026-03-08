import React, { useState, useEffect, useRef, useContext } from 'react';
import api from '../api';
import { AuthContext } from '../context/AuthContext';

const DocumentDetailsModal = ({ document, onClose }) => {
  const { user } = useContext(AuthContext);
  const [history, setHistory] = useState([]);
  const [clearances, setClearances] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [versions, setVersions] = useState([]);
  const [attachFile, setAttachFile] = useState(null);
  const [attachDesc, setAttachDesc] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [chainVerification, setChainVerification] = useState(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [toastMsg, setToastMsg] = useState({ type: '', text: '' });
  
  const [verificationLinks, setVerificationLinks] = useState([]);
  const [showVerificationLinksSection, setShowVerificationLinksSection] = useState(false);
  const [newLinkPurpose, setNewLinkPurpose] = useState('');
  const [newLinkExpiryDays, setNewLinkExpiryDays] = useState('');
  const [newLinkMaxUses, setNewLinkMaxUses] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  
  const [tagHistory, setTagHistory] = useState([]);

  const showToast = (type, text) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg({ type: '', text: '' }), 4000);
  };
  
  const viewerRef = useRef(null);
  const imageContainerRef = useRef(null);

  // 1. Safely calculate file data BEFORE the hooks using optional chaining (?)
  const cleanPath = document?.file_path?.replace(/\\/g, '/') || '';
  const finalPath = cleanPath.startsWith('/') ? cleanPath.substring(1) : cleanPath;
  const fileUrl = finalPath ? `http://localhost:5000/${finalPath}?v=${Date.now()}` : '';
  const isPdf = finalPath.toLowerCase().endsWith('.pdf');
  const isImage = finalPath.match(/\.(jpg|jpeg|png)$/i);

  // HOOK 1: Fetch History
  useEffect(() => {
    const fetchHistory = async () => {
      if (!document) return; // Safe guard inside the hook
      try {
        const [histRes, clearRes, attachRes, versionsRes, vLinksRes, tagHistRes] = await Promise.all([
          api.get(`/documents/${document.id}/history`),
          api.get(`/documents/${document.id}/clearances`).catch(() => ({ data: [] })),
          api.get(`/documents/${document.id}/attachments`).catch(() => ({ data: [] })),
          api.get(`/documents/${document.id}/versions`).catch(() => ({ data: [] })),
          api.get(`/documents/${document.id}/verification-links`).catch(() => ({ data: [] })),
          api.get(`/documents/${document.id}/tag-history`).catch(() => ({ data: [] }))
        ]);
        setHistory(histRes.data);
        setClearances(clearRes.data);
        setAttachments(attachRes.data);
        setVersions(versionsRes.data);
        setVerificationLinks(vLinksRes.data || []);
        setTagHistory(tagHistRes.data || []);
      } catch (error) {
        console.error('Failed to fetch history:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, [document]);

  // HOOK 2: Lock dashboard background scroll
  useEffect(() => {
    window.document.body.style.overflow = 'hidden';
    return () => {
      window.document.body.style.overflow = 'unset';
    };
  }, []);

  // HOOK 3: Native Event Listener for the perfect zoom
  useEffect(() => {
    const container = imageContainerRef.current;
    if (!container || !isImage) return;

    const handleNativeWheel = (e) => {
      e.preventDefault(); 
      if (e.deltaY < 0) {
        setScale(prev => Math.min(prev + 0.15, 5));
      } else {
        setScale(prev => Math.max(prev - 0.15, 0.5));
      }
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, [isImage]);

  // ==========================================
  // All hooks have safely run! NOW we can do our early return.
  // ==========================================
  if (!document) return null;

  const handleDownload = async (e, customUrl, customTitle) => {
    if (e) e.preventDefault();
    const targetUrl = customUrl || fileUrl;
    const isTargetPdf = targetUrl.toLowerCase().endsWith('.pdf');
    const isTargetImage = targetUrl.match(/\.(jpg|jpeg|png)$/i);
    const targetTitle = customTitle || document.title;
    
    try {
      const response = await fetch(targetUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `Stamped_${targetTitle.replace(/\s+/g, '_')}${isTargetImage ? '.jpg' : isTargetPdf ? '.pdf' : '.pdf'}`;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
      showToast('error', 'Failed to download file. Ensure your server is running.');
    }
  };

  const toggleFullScreen = () => {
    if (!window.document.fullscreenElement) {
      viewerRef.current.requestFullscreen().catch(err => {
        showToast('error', `Fullscreen failed: ${err.message}`);
      });
    } else {
      window.document.exitFullscreen();
    }
  };

  const handleAttach = async () => {
    if (!attachFile) return;
    if (attachFile.size > 10 * 1024 * 1024) {
      showToast('error', 'File too large. Maximum size is 10 MB.');
      return;
    }
    setIsAttaching(true);
    const formData = new FormData();
    formData.append('file', attachFile);
    formData.append('description', attachDesc);
    try {
      await api.post(`/documents/${document.id}/attachments`, formData);
      showToast('success', 'File attached successfully!');
      setAttachFile(null);
      setAttachDesc('');
      const res = await api.get(`/documents/${document.id}/attachments`);
      setAttachments(res.data);
    } catch (err) {
      console.error(err);
      showToast('error', err.response?.data?.message || 'Failed to attach file.');
    } finally {
      setIsAttaching(false);
    }
  };

  const verifyChain = async () => {
    setIsVerifying(true);
    setShowVerifyModal(true);
    try {
      const res = await api.get(`/documents/${document.id}/verify-chain`);
      setChainVerification(res.data);
    } catch (err) {
      console.error(err);
      showToast('error', 'Verification failed.');
      setShowVerifyModal(false);
    } finally {
      setIsVerifying(false);
    }
  };

  const isAssignee = document.current_assignee_id === user?.id;
  const isAdmin = user?.role_id === 3;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[60]">
      {/* Toast */}
      {toastMsg.text && (
        <div className="fixed top-6 right-6 z-[80] animate-fade-in">
          <div className={`px-6 py-4 rounded-xl shadow-2xl border-l-4 font-semibold text-sm flex items-center gap-3 ${toastMsg.type === 'error' ? 'bg-white border-red-500 text-red-700' : 'bg-white border-green-500 text-green-700'}`}>
            <span className="text-xl">{toastMsg.type === 'error' ? '🚨' : '✅'}</span>
            {toastMsg.text}
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-gray-800">{document.title}</h2>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-sm text-gray-500">Submitted on: {new Date(document.created_at).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={handleDownload}
              className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-bold shadow hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              📥 Download
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-red-600 font-bold text-3xl leading-none transition-colors">&times;</button>
          </div>
        </div>

        {/* Content Area - Split Screen */}
        <div className="flex flex-col md:flex-row flex-grow overflow-hidden">
          
          {/* Left Side: Document Viewer */}
          <div 
            ref={viewerRef}
            className="md:w-1/2 p-6 border-r border-gray-200 bg-white overflow-hidden flex flex-col items-center justify-center relative group"
          >
            {/* Fullscreen Button */}
            <button 
              onClick={toggleFullScreen}
              className="absolute top-4 right-4 bg-gray-800 bg-opacity-70 text-white p-2 rounded hover:bg-opacity-100 transition-opacity z-10 flex items-center gap-2 text-xs font-bold shadow-lg"
            >
              ⛶ Fullscreen
            </button>

            {isPdf ? (
              <iframe 
                src={`${fileUrl}#toolbar=0`} 
                title="PDF Viewer"
                className="w-full h-full min-h-[500px] border border-gray-300 shadow-md rounded bg-white"
              />
            ) : isImage ? (
              <div 
                ref={imageContainerRef}
                className="w-full h-full overflow-hidden flex items-center justify-center bg-gray-100 border border-gray-300 shadow-inner rounded cursor-crosshair relative"
              >
                {/* Reset Zoom Indicator */}
                {scale !== 1 && (
                  <button 
                    onClick={() => setScale(1)} 
                    className="absolute bottom-4 right-4 bg-white px-3 py-1 rounded shadow text-xs font-bold text-gray-600 hover:text-indigo-600 z-10"
                  >
                    Reset Zoom ({(scale * 100).toFixed(0)}%)
                  </button>
                )}
                <img 
                  src={fileUrl} 
                  alt="Uploaded Document" 
                  style={{ transform: `scale(${scale})`, transition: 'transform 0.1s ease-out', transformOrigin: 'center' }}
                  className="max-w-none shadow-md bg-white pointer-events-none"
                  onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/400x600?text=File+Not+Found'; }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full w-full text-gray-500">
                Unsupported file format. Please download to view.
              </div>
            )}
          </div>

          {/* Right Side: Data, OCR, and Timeline */}
          <div className="md:w-1/2 p-6 overflow-y-auto bg-white flex flex-col gap-6">
            
            {/* Status Badge */}
            <div>
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">Current Status</h3>
              <span className={`px-4 py-1 text-sm font-bold rounded-full ${document.status === 'Approved' ? 'bg-green-100 text-green-800' : document.status === 'Rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {document.status}
              </span>
            </div>

            {/* OCR Text */}
            <div className="flex flex-col">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">Extracted OCR Text</h3>
              <textarea 
                readOnly
                className="w-full h-32 p-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-mono text-sm resize-none focus:outline-none"
                value={document.extracted_text || 'No text extracted from this document.'}
              />
            </div>

            {/* Clearances Block */}
            {clearances.length > 0 && (
              <div className="flex flex-col bg-gray-50 p-4 border border-gray-200 rounded-xl">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Required Clearances</h3>
                  <span className="text-xs font-bold text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">{clearances.filter(c => c.fulfilled_by_document_id).length} / {clearances.length} Completed</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mb-4 overflow-hidden">
                  <div className="bg-blue-600 h-1.5 transition-all duration-300" style={{ width: `${(clearances.filter(c => c.fulfilled_by_document_id).length / clearances.length) * 100}%` }}></div>
                </div>
                <div className="space-y-3">
                  {clearances.map((c, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-800">{c.required_workflow_name}</span>
                        {c.fulfilled_by_document_id ? (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded text-center leading-none">✓ Fulfilled</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded text-center leading-none">⏳ Pending</span>
                        )}
                      </div>
                      {c.fulfilled_by_document_id ? (
                        <div className="text-xs text-gray-600 flex items-center justify-between mt-1">
                          <span className="truncate max-w-[200px]" title={c.fulfilling_document_title}>Via: {c.fulfilling_document_title}</span>
                          <button 
                            onClick={(e) => {
                              const fp = c.fulfilling_file_path.replace(/\\/g, '/');
                              const targetUrl = `http://localhost:5000/${fp.startsWith('/') ? fp.substring(1) : fp}?v=${Date.now()}`;
                              handleDownload(e, targetUrl, c.fulfilling_document_title);
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-semibold transition-colors"
                          >
                            ⬇ View File
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 italic mt-1">Applicant must submit a separate document for this workflow.</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Document History Timeline */}
            <div className="flex-grow flex flex-col">
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Approval History</h3>
                <button onClick={verifyChain} className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 font-bold transition-colors border border-indigo-200 shadow-sm flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  Verify Integrity
                </button>
              </div>
              
              {isLoading ? (
                <p className="text-sm text-gray-500">Loading timeline...</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No actions have been taken on this document yet.</p>
              ) : (
                <div className="space-y-6 pl-2 border-l-2 border-indigo-100 ml-2">
                  {history.map((entry, index) => (
                    <div key={index} className="relative pl-6">
                      <span className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white ${entry.status === 'Approved' ? 'bg-green-500' : entry.status === 'Rejected' ? 'bg-red-500' : 'bg-gray-400'}`}></span>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500 font-medium">{new Date(entry.created_at).toLocaleString()}</span>
                        <span className="text-sm font-bold text-gray-800">
                          {entry.status} by {entry.approver_name}
                        </span>
                        {entry.comments && (
                          <div className={`mt-1 text-sm p-2 rounded ${entry.status === 'Rejected' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700 border border-gray-100'}`}>
                            "{entry.comments}"
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Attachments Section */}
            {(attachments.length > 0 || isAssignee || isAdmin) && (
              <div className="flex flex-col mt-6 border-t pt-4">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2 border-b pb-2">Attachments</h3>
                
                {attachments.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {attachments.map(att => (
                      <div key={att.id} className="flex flex-col bg-gray-50 p-2 rounded border border-gray-200">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold">{att.file_name}</span>
                          <button 
                            onClick={(e) => {
                              const fp = att.file_path.replace(/\\/g, '/');
                              const targetUrl = `http://localhost:5000/${fp.startsWith('/') ? fp.substring(1) : fp}?v=${Date.now()}`;
                              handleDownload(e, targetUrl, att.file_name);
                            }}
                            className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200"
                          >
                            Download
                          </button>
                        </div>
                        {att.description && <span className="text-xs text-gray-600 mt-1">{att.description}</span>}
                        <span className="text-[10px] text-gray-400 mt-1">Uploaded by {att.uploaded_by_name} on {new Date(att.created_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(isAssignee) && (
                  <div className="bg-gray-50 p-3 rounded border border-gray-200">
                    <h4 className="text-xs font-bold text-gray-600 uppercase mb-2">Attach Supporting File (PDF only, max 10 MB)</h4>
                    <div className="flex flex-col gap-2">
                      <input 
                        type="file" 
                        accept=".pdf,application/pdf"
                        onChange={(e) => setAttachFile(e.target.files[0])} 
                        className="text-sm text-gray-600"
                      />
                      <input 
                        type="text" 
                        placeholder="Description (optional)" 
                        value={attachDesc} 
                        onChange={e => setAttachDesc(e.target.value)} 
                        className="p-2 border border-gray-300 rounded text-sm w-full"
                      />
                      <button 
                        onClick={handleAttach}
                        disabled={!attachFile || isAttaching}
                        className={`py-1.5 rounded text-sm font-bold text-white transition-colors ${attachFile && !isAttaching ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-400 cursor-not-allowed'}`}
                      >
                        {isAttaching ? 'Uploading...' : 'Upload Attachment'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Verification Links Section (Only Submitter or Admin) */}
            {(document.submitter_id === user?.id || isAdmin) && (
              <div className="flex flex-col mt-6 border-t pt-4">
                <div className="flex justify-between items-center mb-3 border-b pb-2">
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                    Public Verification Links
                  </h3>
                  <button 
                    onClick={() => setShowVerificationLinksSection(!showVerificationLinksSection)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    {showVerificationLinksSection ? 'Hide' : 'Manage Links'}
                  </button>
                </div>

                {showVerificationLinksSection && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
                    <h4 className="text-xs font-bold text-gray-800 mb-2 uppercase">Generate New Link</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                      <input 
                        type="text" 
                        placeholder="Purpose (e.g., HR Verification)" 
                        value={newLinkPurpose} 
                        onChange={e => setNewLinkPurpose(e.target.value)} 
                        className="p-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <input 
                        type="number" 
                        min="1"
                        placeholder="Expires in days (optional)" 
                        value={newLinkExpiryDays} 
                        onChange={e => setNewLinkExpiryDays(e.target.value)} 
                        className="p-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <input 
                        type="number" 
                        min="1"
                        placeholder="Max uses (optional)" 
                        value={newLinkMaxUses} 
                        onChange={e => setNewLinkMaxUses(e.target.value)} 
                        className="p-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <button 
                      onClick={async () => {
                        setIsGeneratingLink(true);
                        try {
                          await api.post(`/documents/${document.id}/verification-link`, {
                            purpose: newLinkPurpose,
                            expires_in_days: newLinkExpiryDays,
                            max_uses: newLinkMaxUses
                          });
                          showToast('success', 'Verification link generated!');
                          setNewLinkPurpose('');
                          setNewLinkExpiryDays('');
                          setNewLinkMaxUses('');
                          
                          // Refresh links
                          const vRes = await api.get(`/documents/${document.id}/verification-links`);
                          setVerificationLinks(vRes.data);
                        } catch (err) {
                          showToast('error', err.response?.data?.message || 'Failed to generate link');
                        } finally {
                          setIsGeneratingLink(false);
                        }
                      }}
                      disabled={isGeneratingLink}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
                    >
                      {isGeneratingLink ? 'Generating...' : 'Generate Magic Link'}
                    </button>

                    {verificationLinks.length > 0 && (
                      <div className="mt-6">
                        <h4 className="text-xs font-bold text-gray-600 mb-2 uppercase border-b pb-1">Active Links</h4>
                        <div className="space-y-3">
                          {verificationLinks.map(link => (
                            <div key={link.id} className={`p-3 rounded-lg border ${link.is_revoked ? 'bg-red-50 border-red-200 opacity-70' : 'bg-white border-gray-200 shadow-sm'}`}>
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <span className="text-sm font-bold text-gray-800 block">{link.purpose || 'No Purpose Specified'}</span>
                                  <span className="text-[10px] text-gray-500 font-mono mt-1 block">Created: {new Date(link.created_at).toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded">Uses: {link.access_count} / {link.max_uses || '∞'}</span>
                                  {!link.is_revoked && (
                                    <button 
                                      onClick={async () => {
                                        if(window.confirm('Revoke this link? It will no longer work.')) {
                                          try {
                                            await api.patch(`/documents/verification-links/${link.id}/revoke`);
                                            const vRes = await api.get(`/documents/${document.id}/verification-links`);
                                            setVerificationLinks(vRes.data);
                                            showToast('success', 'Link revoked.');
                                          } catch(e) {
                                            showToast('error', 'Failed to revoke link.');
                                          }
                                        }
                                      }}
                                      className="text-xs bg-red-100 text-red-700 hover:bg-red-200 px-2 py-1 rounded font-bold transition-colors"
                                    >
                                      Revoke
                                    </button>
                                  )}
                                  {link.is_revoked && <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded">Revoked</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <input 
                                  readOnly 
                                  value={link.url} 
                                  className={`flex-grow p-1.5 text-[11px] font-mono border rounded outline-none ${link.is_revoked ? 'bg-red-50 border-red-200 text-red-500' : 'bg-gray-50 border-gray-300 text-gray-700'}`}
                                />
                                {!link.is_revoked && (
                                  <button 
                                    onClick={() => {
                                      navigator.clipboard.writeText(link.url);
                                      showToast('success', 'Copied to clipboard!');
                                    }}
                                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 p-1.5 rounded transition-colors"
                                    title="Copy to clipboard"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Version History Section */}
            {versions.length > 0 && (
              <div className="flex flex-col mt-6 border-t pt-4">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 border-b pb-2 flex items-center gap-2">
                  <span>📋</span> Version History
                  <span className="ml-auto text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{versions.length} saved version{versions.length > 1 ? 's' : ''}</span>
                </h3>
                <div className="space-y-3 pl-2 border-l-2 border-amber-200 ml-2">
                  {versions.map((ver, idx) => {
                    const verPath = ver.file_path?.replace(/\\/g, '/');
                    const verUrl = verPath ? `http://localhost:5000/${verPath.startsWith('/') ? verPath.substring(1) : verPath}?v=${Date.now()}` : null;
                    return (
                      <div key={ver.id} className="relative pl-6">
                        <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white bg-amber-400"></span>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">Version {ver.version_number}</span>
                            <span className="text-xs text-gray-400">{new Date(ver.created_at).toLocaleDateString()}</span>
                          </div>
                          {ver.rejection_reason && (
                            <div className="mt-1.5 text-xs bg-red-50 border border-red-100 text-red-700 px-2 py-1.5 rounded">
                              <span className="font-bold">Rejection reason:</span> "{ver.rejection_reason}"
                            </div>
                          )}
                          {verUrl && (
                            <button
                              onClick={(e) => handleDownload(e, verUrl, `${document.title}_v${ver.version_number}`)}
                              className="mt-2 text-xs bg-white border border-amber-300 text-amber-700 px-2.5 py-1 rounded hover:bg-amber-100 font-semibold transition-colors flex items-center gap-1"
                            >
                              ⬇ Download v{ver.version_number}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* Current Version indicator */}
                  <div className="relative pl-6">
                    <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white bg-blue-500"></span>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">Version {versions.length + 1} (Current)</span>
                        <span className="text-xs text-gray-400">{new Date(document.updated_at || document.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-blue-600 mt-1">This is the active version of the document.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tag History Section */}
            {tagHistory.length > 0 && (
              <div className="flex flex-col mt-6 border-t pt-4">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 border-b pb-2 flex items-center gap-2">
                  <span>🏷️</span> Tag History
                  <span className="ml-auto text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{tagHistory.length} tag{tagHistory.length > 1 ? 's' : ''} applied</span>
                </h3>
                <div className="space-y-3 pl-2 border-l-2 border-green-200 ml-2">
                  {tagHistory.map((tagObj) => (
                    <div key={tagObj.id} className="relative pl-6">
                      <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white bg-green-400"></span>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-bold text-green-800 bg-green-100 px-2 py-0.5 rounded">"{tagObj.tag}"</span>
                          <span className="text-xs text-gray-400">{new Date(tagObj.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-green-700 mt-1">Applied by: <span className="font-semibold">{tagObj.applied_by || 'System'}</span></p>
                        {tagObj.node_id && <p className="text-[10px] text-green-600 mt-0.5">Node ID: {tagObj.node_id}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Verification Modal */}
      {showVerifyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                Cryptographic Integrity Verification
              </h3>
              <button onClick={() => setShowVerifyModal(false)} className="text-gray-400 hover:text-red-600 font-bold text-2xl leading-none">&times;</button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {isVerifying ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-gray-600 font-medium">Verifying hash chain...</p>
                </div>
              ) : chainVerification ? (
                <div className="space-y-6">
                  <div className={`p-4 rounded-lg border flex items-start gap-4 ${chainVerification.chain_valid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className={`p-2 rounded-full ${chainVerification.chain_valid ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {chainVerification.chain_valid ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      )}
                    </div>
                    <div>
                      <h4 className={`text-lg font-bold ${chainVerification.chain_valid ? 'text-green-800' : 'text-red-800'}`}>
                        {chainVerification.chain_valid ? 'Verification Passed' : 'Verification Failed'}
                      </h4>
                      <p className={`text-sm mt-1 ${chainVerification.chain_valid ? 'text-green-700' : 'text-red-700'}`}>
                        {chainVerification.chain_valid 
                          ? 'The document and its entire approval history are cryptographically sound. No tampering detected.'
                          : 'The approval chain has been compromised. Hashes or signatures do not match the expected values.'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 border-b pb-2">Detailed Hash Chain</h4>
                    <div className="space-y-3">
                      {chainVerification.approvals.map((app, idx) => (
                        <div key={idx} className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-sm font-bold text-gray-800">Step {app.order} (Approver ID: {app.approver_id})</span>
                            <span className="text-xs text-gray-500">{new Date(app.timestamp).toLocaleString()}</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 mt-3">
                            <div className="flex items-center gap-2">
                              {app.signature_valid ? <span className="text-green-500 font-bold">✓</span> : <span className="text-red-500 font-bold">✗</span>}
                              <span className="text-xs text-gray-600">HMAC Signature</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {app.hash_consistent ? <span className="text-green-500 font-bold">✓</span> : <span className="text-red-500 font-bold">✗</span>}
                              <span className="text-xs text-gray-600">Chain Link Consistent</span>
                            </div>
                            {idx === chainVerification.approvals.length - 1 && (
                              <div className="flex items-center gap-2 col-span-2">
                                {app.document_unchanged ? <span className="text-green-500 font-bold">✓</span> : <span className="text-yellow-500 font-bold">⚠</span>}
                                <span className="text-xs text-gray-600">
                                  {app.document_unchanged 
                                    ? 'Document matches initial hash' 
                                    : 'Document has been stamped (expected post-approval)'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {chainVerification.approvals.length === 0 && (
                        <p className="text-sm text-gray-500 italic">No approvals recorded yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-red-500 text-center">Failed to load verification data.</div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button onClick={() => setShowVerifyModal(false)} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-bold shadow-sm hover:bg-gray-50 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentDetailsModal;