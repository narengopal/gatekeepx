import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import QrScanner from 'react-qr-scanner';

const QRScanner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleScan = async (data) => {
    if (data) {
      try {
        setScanning(false);
        setLoading(true);
        setError('');
        setSuccess('');

        const response = await axios.post('/api/visits/check-in', {
          qr_token: data.text
        });

        setSuccess(`Welcome ${response.data.guestName}! Please proceed to ${response.data.flatNumber}`);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to process QR code');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleError = (err) => {
    console.error(err);
    setError('Failed to access camera. Please ensure you have granted camera permissions.');
  };

  const handleRetry = () => {
    setScanning(true);
    setError('');
    setSuccess('');
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Scan Visitor QR Code
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Position the QR code within the frame to scan
          </p>
        </div>

        <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-md bg-green-50 p-4">
              <div className="text-sm text-green-700">{success}</div>
            </div>
          )}

          {scanning ? (
            <div className="relative">
              <QrScanner
                delay={300}
                onError={handleError}
                onScan={handleScan}
                style={{ width: '100%' }}
              />
              <div className="absolute inset-0 border-2 border-dashed border-indigo-500 rounded-lg pointer-events-none"></div>
            </div>
          ) : (
            <div className="text-center">
              <button
                onClick={handleRetry}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Scan Another QR Code
              </button>
            </div>
          )}

          {loading && (
            <div className="mt-4 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
              <p className="mt-2 text-sm text-gray-500">Processing...</p>
            </div>
          )}

          <div className="mt-6">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRScanner; 