import React, { useState, useEffect, useContext, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import SignatureCanvas from 'react-signature-canvas';

const Profile = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const sigCanvas = useRef({});

  const isStaffOrAdmin = user && user.role_id !== 1;

  // Account settings
  const [name, setName] = useState(user?.name || '');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);

  // Signature state — loaded from DB
  const [savedSignature, setSavedSignature] = useState(null); // null = not yet fetched
  const [pendingSignature, setPendingSignature] = useState(''); // drawn but not confirmed
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Fetch profile on load (for signature_data)
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/auth/profile');
        setSavedSignature(res.data?.signature_data || '');
        if (res.data?.email_notifications !== undefined) {
          setEmailNotifications(res.data.email_notifications);
        }
      } catch (err) {
        console.error('Failed to load profile', err);
        setSavedSignature('');
      }
    };
    fetchProfile();
  }, []);

  // Draw signature → show confirm modal
  const handleDrawSignatureConfirm = () => {
    if (!sigCanvas.current || sigCanvas.current.isEmpty()) {
      setMessage({ type: 'error', text: 'Please draw your signature first.' });
      return;
    }
    const drawn = sigCanvas.current.getCanvas().toDataURL('image/png');
    setPendingSignature(drawn);
    setShowConfirmModal(true);
  };

  // Confirm and save signature alone (separate from account settings)
  const handleConfirmSaveSignature = async () => {
    setShowConfirmModal(false);
    setIsLoading(true);
    try {
      await api.put('/auth/profile', { signatureData: pendingSignature });
      setSavedSignature(pendingSignature);
      setPendingSignature('');
      setMessage({ type: 'success', text: 'Signature registered successfully.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to save signature.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Save name/password (without touching signature)
  const handleUpdate = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (newPassword && newPassword !== confirmPassword) {
      return setMessage({ type: 'error', text: 'New passwords do not match.' });
    }

    setIsLoading(true);
    try {
      const payload = { name, email_notifications: emailNotifications };
      if (currentPassword && newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const res = await api.put('/auth/profile', payload);
      setMessage({ type: 'success', text: res.data.message });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to update profile.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center border-b border-gray-200">
        <h1 className="text-2xl font-bold text-indigo-700 cursor-pointer" onClick={() => navigate('/dashboard')}>E-flow</h1>
        <div className="flex gap-4">
          <button onClick={() => navigate('/dashboard')} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">Back to Dashboard</button>
          <button onClick={logout} className="text-sm font-medium text-red-600 hover:text-red-800">Logout</button>
        </div>
      </nav>

      <div className="flex-grow flex flex-col md:flex-row items-start justify-center p-4 pt-10 gap-8 max-w-5xl mx-auto w-full">

        {/* CARD 1: ACCOUNT SETTINGS */}
        <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Account Settings</h2>

          {message.text && (
            <div className={`p-3 rounded mb-4 text-sm font-medium text-center ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                readOnly
                tabIndex="-1"
                className="w-full px-4 py-2 border border-gray-200 bg-gray-50 text-gray-600 rounded-md cursor-not-allowed pointer-events-none focus:outline-none"
              />
            </div>

            <div className="pt-4 border-t border-gray-200 mt-6">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Preferences</h3>
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email Notifications</label>
                  <p className="text-xs text-gray-500">Receive an email when you are assigned a document or when your document is approved/rejected.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEmailNotifications(!emailNotifications)}
                  className={`${
                    emailNotifications ? 'bg-indigo-600' : 'bg-gray-200'
                  } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
                >
                  <span
                    aria-hidden="true"
                    className={`${
                      emailNotifications ? 'translate-x-5' : 'translate-x-0'
                    } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                  />
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200 mt-6">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Change Password (Optional)</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Leave blank to keep current"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-2 px-4 rounded-md text-white font-bold mt-6 shadow-sm transition-colors ${isLoading ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* CARD 2: SIGNATURE (Staff/Admin Only) */}
        {isStaffOrAdmin && (
          <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">My Official Signature</h2>

            {savedSignature === null ? (
              <p className="text-sm text-gray-400">Loading...</p>
            ) : savedSignature ? (
              // Signature already registered — display read-only
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">✅ Signature Registered</span>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Your signature has been permanently registered and is used automatically on all documents you approve.
                </p>
                <div className="border border-gray-200 bg-gray-50 rounded-lg p-3 flex items-center justify-center">
                  <img src={savedSignature} alt="Registered Signature" className="max-h-28 object-contain" />
                </div>
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-800 font-semibold">
                    ⚠️ For security and consistency, your signature cannot be changed once registered. If you need to update it for a legitimate reason, contact your system administrator.
                  </p>
                </div>
              </div>
            ) : (
              // No signature yet — show draw canvas
              <div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-sm font-bold text-blue-800 mb-1">⚠️ Important — Read Before Signing</p>
                  <p className="text-sm text-blue-700">
                    Your signature will be permanently registered to your account and applied to every document you approve. <strong>It cannot be changed after saving.</strong> Please draw carefully.
                  </p>
                </div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Draw your signature below:</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white overflow-hidden">
                  <SignatureCanvas
                    penColor="black"
                    canvasProps={{ className: 'w-full h-36', style: { cursor: 'crosshair' } }}
                    ref={sigCanvas}
                  />
                </div>
                <div className="flex justify-between items-center mt-2 mb-4">
                  <button
                    type="button"
                    onClick={() => sigCanvas.current.clear()}
                    className="text-xs text-blue-600 hover:underline font-semibold"
                  >
                    Clear Canvas
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleDrawSignatureConfirm}
                  disabled={isLoading}
                  className="w-full py-2 px-4 rounded-md text-white font-bold bg-green-600 hover:bg-green-700 transition-colors shadow-sm"
                >
                  Review & Register Signature
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-2">Confirm Signature Registration</h3>
            <p className="text-sm text-red-600 font-semibold mb-4">
              ⚠️ This action is permanent. Your signature cannot be changed after confirming.
            </p>
            <div className="border border-gray-200 rounded-lg bg-gray-50 p-3 mb-4 flex items-center justify-center">
              <img src={pendingSignature} alt="Preview" className="max-h-28 object-contain" />
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Is this the signature you want to permanently register to your account?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowConfirmModal(false); setPendingSignature(''); }}
                className="flex-1 py-2 px-4 rounded-md border border-gray-300 text-gray-700 font-bold hover:bg-gray-50"
              >
                Go Back & Re-draw
              </button>
              <button
                onClick={handleConfirmSaveSignature}
                className="flex-1 py-2 px-4 rounded-md bg-green-600 hover:bg-green-700 text-white font-bold shadow-sm"
              >
                Yes, Register Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;