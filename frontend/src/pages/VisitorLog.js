import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

function VisitorLog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all, today, week, month
  const [status, setStatus] = useState(''); // '', 'pending', 'checked_in', 'rejected'
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    fetchVisits();
    // eslint-disable-next-line
  }, [filter, status, search]);

  const fetchVisits = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filter && filter !== 'all') params.filter = filter;
      if (status) params.status = status;
      if (search) params.search = search;
      const response = await axios.get('/api/visits', { params });
      setVisits(response.data);
    } catch (err) {
      setError('Failed to fetch visitor log');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'checked_in':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  // CSV export helper
  const exportToCSV = () => {
    if (!visits.length) return;
    const headers = [
      'Guest', 'Phone', 'Flat', 'Purpose', 'Expected Arrival', 'Status', 'Check-in Time', 'Created'
    ];
    const rows = visits.map(visit => [
      visit.name,
      visit.phone,
      visit.flat_number,
      visit.purpose || '-',
      visit.expected_arrival ? formatDate(visit.expected_arrival) : '-',
      visit.status,
      visit.checked_in_at ? formatDate(visit.checked_in_at) : '-',
      visit.created_at ? formatDate(visit.created_at) : '-'
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'visitor_log.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Visitor Log
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            View and manage visitor check-ins
          </p>
        </div>

        <div className="mt-8">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-4">
                <div className="flex space-x-2">
                  <button
                    onClick={() => setFilter('all')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md ${filter === 'all' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilter('today')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md ${filter === 'today' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setFilter('week')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md ${filter === 'week' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    This Week
                  </button>
                  <button
                    onClick={() => setFilter('month')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md ${filter === 'month' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    This Month
                  </button>
                </div>
                <div className="flex space-x-2">
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="px-3 py-1.5 text-sm border rounded-md"
                  >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="checked_in">Checked In</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <form onSubmit={handleSearch} className="flex">
                    <input
                      type="text"
                      placeholder="Search guest name or phone"
                      value={searchInput}
                      onChange={e => setSearchInput(e.target.value)}
                      className="px-3 py-1.5 text-sm border rounded-l-md"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-r-md hover:bg-indigo-700"
                    >
                      Search
                    </button>
                  </form>
                  <button
                    onClick={exportToCSV}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Export to CSV
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
                  <p className="mt-2 text-sm text-gray-500">Loading visits...</p>
                </div>
              ) : visits.length === 0 ? (
                <p className="text-center text-sm text-gray-500">No visits found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Guest</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flat</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purpose</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expected Arrival</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-in Time</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {visits.map((visit) => (
                        <tr key={visit.id}>
                          <td className="px-6 py-4 whitespace-nowrap">{visit.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{visit.phone}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{visit.flat_number}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{visit.purpose || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{formatDate(visit.expected_arrival)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(visit.status)}`}>
                              {visit.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">{formatDate(visit.checked_in_at)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{formatDate(visit.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

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
}

export default VisitorLog; 