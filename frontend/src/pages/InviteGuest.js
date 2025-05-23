import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

// Configure axios defaults
axios.defaults.baseURL = 'http://localhost:3001';
axios.defaults.headers.common['Content-Type'] = 'application/json';

function InviteGuest() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    purpose: '',
    expected_arrival: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [guestDetails, setGuestDetails] = useState(null);

  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem('token');
    if (!token || !user) {
      navigate('/login');
      return;
    }

    // Set up axios defaults
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }, [user, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      
      // Get fresh token
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Ensure token is set in headers
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      console.log('Submitting form data:', formData);
      
      const response = await axios.post('/api/guests', formData);
      
      console.log('API Response:', response.data);
      
      if (response.data.qr_token) {
        setQrCode(response.data.qr_token);
        setGuestDetails(response.data);
      } else {
        console.error('No QR token in response:', response.data);
        throw new Error('No QR token received from server');
      }
    } catch (err) {
      console.error('Error creating guest invitation:', err);
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });

      // Handle specific error cases
      if (err.response?.status === 403) {
        setError('Your session has expired. Please log in again.');
        logout();
        navigate('/login');
      } else if (err.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
        logout();
        navigate('/login');
      } else {
        setError(err.response?.data?.error || err.message || 'Failed to create guest invitation');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Invite a Guest
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Fill in the details to generate a QR code for your guest
          </p>
        </div>

        <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          {qrCode ? (
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Guest Invitation Created Successfully
              </h3>
              <div className="bg-white p-4 rounded-lg shadow">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}&format=png&margin=10`}
                  alt="QR Code"
                  className="mx-auto"
                  onError={(e) => {
                    console.error('Error loading QR code image:', e);
                    setError('Failed to load QR code image. Please try again.');
                  }}
                />
              </div>
              {guestDetails && (
                <div className="mt-4 text-left">
                  <h4 className="text-md font-medium text-gray-900">Guest Details:</h4>
                  <p className="text-sm text-gray-600">Name: {guestDetails.guest.name}</p>
                  <p className="text-sm text-gray-600">Phone: {guestDetails.guest.phone}</p>
                  <p className="text-sm text-gray-600">Purpose: {guestDetails.visit.purpose}</p>
                  <p className="text-sm text-gray-600">
                    Expected Arrival: {new Date(guestDetails.visit.expected_arrival).toLocaleString()}
                  </p>
                </div>
              )}
              <p className="mt-4 text-sm text-gray-500">
                Share this QR code with your guest. They will need to show this to the security guard for check-in.
              </p>
              <div className="mt-6 space-y-2">
                <button
                  onClick={() => {
                    setQrCode('');
                    setGuestDetails(null);
                    setFormData({
                      name: '',
                      phone: '',
                      purpose: '',
                      expected_arrival: ''
                    });
                  }}
                  className="w-full inline-flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Create Another Invitation
                </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Guest Name
                </label>
                <div className="mt-1">
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.name}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                  Phone Number
                </label>
                <div className="mt-1">
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    required
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="purpose" className="block text-sm font-medium text-gray-700">
                  Purpose of Visit
                </label>
                <div className="mt-1">
                  <textarea
                    id="purpose"
                    name="purpose"
                    rows={3}
                    required
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.purpose}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="expected_arrival" className="block text-sm font-medium text-gray-700">
                  Expected Arrival Time
                </label>
                <div className="mt-1">
                  <input
                    id="expected_arrival"
                    name="expected_arrival"
                    type="datetime-local"
                    required
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.expected_arrival}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  {loading ? 'Creating invitation...' : 'Generate QR Code'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default InviteGuest; 