import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

function ManageBlocks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newBlock, setNewBlock] = useState({ name: '' });
  const [newFlat, setNewFlat] = useState({ block_id: '', number: '' });

  useEffect(() => {
    fetchBlocks();
  }, []);

  const fetchBlocks = async () => {
    try {
      const response = await axios.get('/api/admin/blocks');
      setBlocks(response.data);
    } catch (err) {
      setError('Failed to fetch blocks');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBlock = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/admin/blocks', newBlock);
      setBlocks(prev => [...prev, response.data]);
      setNewBlock({ name: '' });
    } catch (err) {
      setError('Failed to add block');
    }
  };

  const handleAddFlat = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/admin/flats', newFlat);
      setBlocks(prev =>
        prev.map(block =>
          block.id === response.data.block_id
            ? { ...block, flats: [...block.flats, response.data] }
            : block
        )
      );
      setNewFlat({ block_id: '', number: '' });
    } catch (err) {
      setError('Failed to add flat');
    }
  };

  const handleDeleteBlock = async (blockId) => {
    if (!window.confirm('Are you sure you want to delete this block?')) return;
    try {
      await axios.delete(`/api/admin/blocks/${blockId}`);
      setBlocks(prev => prev.filter(block => block.id !== blockId));
    } catch (err) {
      setError('Failed to delete block');
    }
  };

  const handleDeleteFlat = async (flatId) => {
    if (!window.confirm('Are you sure you want to delete this flat?')) return;
    try {
      await axios.delete(`/api/admin/flats/${flatId}`);
      setBlocks(prev =>
        prev.map(block => ({
          ...block,
          flats: block.flats.filter(flat => flat.id !== flatId)
        }))
      );
    } catch (err) {
      setError('Failed to delete flat');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Manage Blocks and Flats
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Add, edit, or remove blocks and flats
          </p>
        </div>

        <div className="mt-8 space-y-8">
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium text-gray-900">Add New Block</h3>
              <form onSubmit={handleAddBlock} className="mt-4">
                <div className="flex space-x-4">
                  <input
                    type="text"
                    value={newBlock.name}
                    onChange={(e) => setNewBlock({ name: e.target.value })}
                    placeholder="Block Name"
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-md border border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    required
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Add Block
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium text-gray-900">Add New Flat</h3>
              <form onSubmit={handleAddFlat} className="mt-4">
                <div className="flex space-x-4">
                  <select
                    value={newFlat.block_id}
                    onChange={(e) => setNewFlat(prev => ({ ...prev, block_id: e.target.value }))}
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-md border border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    required
                  >
                    <option value="">Select Block</option>
                    {blocks.map(block => (
                      <option key={block.id} value={block.id}>
                        {block.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newFlat.number}
                    onChange={(e) => setNewFlat(prev => ({ ...prev, number: e.target.value }))}
                    placeholder="Flat Number"
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-md border border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    required
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Add Flat
                  </button>
                </div>
              </form>
            </div>
          </div>

          {loading ? (
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
              <p className="mt-2 text-sm text-gray-500">Loading blocks...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {blocks.map(block => (
                <div key={block.id} className="bg-white shadow sm:rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900">
                        {block.name}
                      </h3>
                      <button
                        onClick={() => handleDeleteBlock(block.id)}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        Delete Block
                      </button>
                    </div>
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-500">Flats</h4>
                      <ul className="mt-2 divide-y divide-gray-200">
                        {block.flats.map(flat => (
                          <li key={flat.id} className="py-3 flex items-center justify-between">
                            <span className="text-sm text-gray-900">{flat.number}</span>
                            <button
                              onClick={() => handleDeleteFlat(flat.id)}
                              className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                            >
                              Delete
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
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
}

export default ManageBlocks; 