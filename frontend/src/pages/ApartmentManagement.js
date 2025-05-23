import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

function ApartmentManagement() {
  const { user } = useAuth();
  const [apartments, setApartments] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [flats, setFlats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedApartment, setSelectedApartment] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [showAddApartment, setShowAddApartment] = useState(false);
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [showAddFlat, setShowAddFlat] = useState(false);
  const [newApartment, setNewApartment] = useState({ name: '' });
  const [newBlock, setNewBlock] = useState({ name: '' });
  const [newFlat, setNewFlat] = useState({ number: '' });
  const [apartmentFlowChoice, setApartmentFlowChoice] = useState(null); // 'block' or 'noBlock'
  const [editingApartmentId, setEditingApartmentId] = useState(null);
  const [editingApartmentName, setEditingApartmentName] = useState('');
  const [editingFlatId, setEditingFlatId] = useState(null);
  const [editingFlatNumber, setEditingFlatNumber] = useState('');

  // Fetch apartments
  const fetchApartments = async () => {
    try {
      const response = await axios.get('/api/admin/apartments');
      setApartments(response.data);
      setLoading(false);
    } catch (error) {
      setError('Failed to fetch apartments');
      setLoading(false);
    }
  };

  // Fetch blocks for an apartment
  const fetchBlocks = async (apartmentId) => {
    try {
      const response = await axios.get(`/api/admin/apartments/${apartmentId}/blocks`);
      setBlocks(response.data);
    } catch (error) {
      setError('Failed to fetch blocks');
    }
  };

  // Fetch flats for a block
  const fetchFlats = async (blockId) => {
    try {
      const response = await axios.get(`/api/admin/blocks/${blockId}/flats`);
      setFlats(response.data);
    } catch (error) {
      setError('Failed to fetch flats');
    }
  };

  // Add this new function after fetchFlats
  const fetchApartmentFlats = async (apartmentId) => {
    try {
      const response = await axios.get(`/api/admin/apartments/${apartmentId}/flats`);
      setFlats(response.data);
    } catch (error) {
      setError('Failed to fetch apartment flats');
    }
  };

  useEffect(() => {
    fetchApartments();
  }, []);

  // Handle apartment selection
  const handleApartmentSelect = async (apartment) => {
    setSelectedApartment(apartment);
    setSelectedBlock(null);
    setFlats([]);
    await fetchBlocks(apartment.id);
    setApartmentFlowChoice(null); // Reset choice when selecting a different apartment
  };

  // Handle block selection
  const handleBlockSelect = async (block) => {
    setSelectedBlock(block);
    await fetchFlats(block.id);
  };

  // Create new apartment (Super Admin only)
  const handleCreateApartment = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/admin/apartments', newApartment);
      setApartments([...apartments, response.data]);
      setShowAddApartment(false);
      setNewApartment({ name: '' });
      setApartmentFlowChoice(null); // Reset choice on new apartment
    } catch (error) {
      setError('Failed to create apartment');
    }
  };

  // Create new block
  const handleCreateBlock = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`/api/admin/apartments/${selectedApartment.id}/blocks`, newBlock);
      setBlocks([...blocks, response.data]);
      setShowAddBlock(false);
      setNewBlock({ name: '' });
    } catch (error) {
      setError('Failed to create block');
    }
  };

  // Create new flat (apartment-level or block-level)
  const handleCreateFlat = async (e, block) => {
    e.preventDefault();
    try {
      let response;
      if (block) {
        response = await axios.post(`/api/admin/blocks/${block.id}/flats`, { number: newFlat.number });
        setFlats([...flats, response.data]);
      } else if (selectedApartment) {
        response = await axios.post(`/api/admin/apartments/${selectedApartment.id}/flats`, { number: newFlat.number });
        setFlats([...(flats || []), response.data]);
      }
      setShowAddFlat(false);
      setNewFlat({ number: '' });
    } catch (error) {
      setError('Failed to create flat');
    }
  };

  // Delete apartment (Super Admin only)
  const handleDeleteApartment = async (apartmentId) => {
    if (!window.confirm('Are you sure you want to delete this apartment? This will delete all blocks and flats.')) return;
    try {
      await axios.delete(`/api/admin/apartments/${apartmentId}`);
      setApartments(apartments.filter(a => a.id !== apartmentId));
      if (selectedApartment?.id === apartmentId) {
        setSelectedApartment(null);
        setBlocks([]);
        setFlats([]);
      }
    } catch (error) {
      setError('Failed to delete apartment');
    }
  };

  // Delete block
  const handleDeleteBlock = async (blockId) => {
    if (!window.confirm('Are you sure you want to delete this block? This will delete all flats.')) return;
    try {
      await axios.delete(`/api/admin/blocks/${blockId}`);
      setBlocks(blocks.filter(b => b.id !== blockId));
      if (selectedBlock?.id === blockId) {
        setSelectedBlock(null);
        setFlats([]);
      }
    } catch (error) {
      setError('Failed to delete block');
    }
  };

  // Delete flat
  const handleDeleteFlat = async (flatId) => {
    if (!window.confirm('Are you sure you want to delete this flat?')) return;
    try {
      await axios.delete(`/api/admin/flats/${flatId}`);
      setFlats(flats.filter(f => f.id !== flatId));
    } catch (error) {
      setError('Failed to delete flat');
    }
  };

  // Edit apartment
  const handleEditApartment = (apartment) => {
    setEditingApartmentId(apartment.id);
    setEditingApartmentName(apartment.name);
  };
  const handleUpdateApartment = async (apartmentId) => {
    try {
      await axios.put(`/api/admin/apartments/${apartmentId}`, { name: editingApartmentName });
      setApartments(apartments.map(a => a.id === apartmentId ? { ...a, name: editingApartmentName } : a));
      setEditingApartmentId(null);
      setEditingApartmentName('');
    } catch (error) {
      setError('Failed to update apartment');
    }
  };

  // Edit flat
  const handleEditFlat = (flat) => {
    setEditingFlatId(flat.id);
    setEditingFlatNumber(flat.number);
  };
  const handleUpdateFlat = async (flatId) => {
    try {
      await axios.put(`/api/admin/flats/${flatId}`, { number: editingFlatNumber });
      setFlats(flats.map(f => f.id === flatId ? { ...f, number: editingFlatNumber, unique_id: f.block_id ? (blocks.find(b => b.id === f.block_id)?.name || '') + editingFlatNumber : editingFlatNumber } : f));
      setEditingFlatId(null);
      setEditingFlatNumber('');
    } catch (error) {
      setError('Failed to update flat');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Apartment Management</h1>
        
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Apartments Section */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Apartments</h2>
            {(user?.role === 'admin' || user?.role === 'super_admin') && (
              <button
                onClick={() => setShowAddApartment(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
              >
                Add Apartment
              </button>
            )}
          </div>

          {showAddApartment && (
            <div className="mb-4 p-4 border rounded-md">
              <form onSubmit={handleCreateApartment} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Apartment Name</label>
                  <input
                    type="text"
                    value={newApartment.name}
                    onChange={(e) => setNewApartment({ name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddApartment(false)}
                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apartments.map((apartment) => (
              <div
                key={apartment.id}
                className={`p-4 border rounded-md shadow cursor-pointer ${selectedApartment?.id === apartment.id ? 'border-indigo-500 bg-indigo-50' : ''}`}
                onClick={() => handleApartmentSelect(apartment)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    {editingApartmentId === apartment.id ? (
                      <form onSubmit={e => { e.preventDefault(); handleUpdateApartment(apartment.id); }} className="flex gap-2">
                        <input
                          type="text"
                          value={editingApartmentName}
                          onChange={e => setEditingApartmentName(e.target.value)}
                          className="border p-1 rounded"
                          required
                        />
                        <button type="submit" className="bg-green-600 text-white px-2 py-1 rounded">Save</button>
                        <button type="button" className="bg-gray-300 px-2 py-1 rounded" onClick={() => setEditingApartmentId(null)}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <h3 className="font-medium text-gray-900">{apartment.name}</h3>
                        <p className="text-sm text-gray-500">Created: {new Date(apartment.created_at).toLocaleDateString()}</p>
                      </>
                    )}
                  </div>
                  {user?.role === 'super_admin' && (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); handleEditApartment(apartment); }}
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >Edit</button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteApartment(apartment.id); }}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Blocks Section */}
        {selectedApartment && apartmentFlowChoice === null && (
          <div className="mb-4 flex gap-4">
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              onClick={() => setApartmentFlowChoice('block')}
            >
              Add Block
            </button>
            <button
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              onClick={async () => {
                setApartmentFlowChoice('noBlock');
                await fetchApartmentFlats(selectedApartment.id);
              }}
            >
              Continue Without Blocks
            </button>
          </div>
        )}

        {/* Block creation and flat creation within block */}
        {selectedApartment && apartmentFlowChoice === 'block' && (
          <>
            {/* Block creation UI */}
            <div className="mb-4">
              <button
                className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
                onClick={() => setShowAddBlock(true)}
              >
                Add Block
              </button>
              {showAddBlock && (
                <form onSubmit={handleCreateBlock} className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={newBlock.name}
                    onChange={e => setNewBlock({ name: e.target.value })}
                    placeholder="Block Name"
                    className="border p-2 rounded"
                    required
                  />
                  <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Create Block</button>
                </form>
              )}
            </div>
            {/* Block selection and flat creation */}
            <div className="mb-4">
              <label className="block mb-1">Select Block</label>
              <select
                value={selectedBlock ? selectedBlock.id : ''}
                onChange={e => {
                  const block = blocks.find(b => b.id === parseInt(e.target.value));
                  handleBlockSelect(block);
                }}
                className="border p-2 rounded"
              >
                <option value="">-- Select Block --</option>
                {blocks.map(block => (
                  <option key={block.id} value={block.id}>{block.name}</option>
                ))}
              </select>
            </div>
            {selectedBlock && (
              <div className="mb-4">
                <button
                  className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
                  onClick={() => setShowAddFlat(true)}
                >
                  Add Flat to Block
                </button>
                {showAddFlat && (
                  <form onSubmit={e => handleCreateFlat(e, selectedBlock)} className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={newFlat.number}
                      onChange={e => setNewFlat({ number: e.target.value })}
                      placeholder="Flat Number"
                      className="border p-2 rounded"
                      required
                    />
                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Create Flat</button>
                  </form>
                )}
              </div>
            )}
            {/* List flats in selected block */}
            {selectedBlock && (
              <div>
                <h3 className="font-semibold mb-2">Flats in Block {selectedBlock.name}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {flats.map(flat => (
                    <div key={flat.id} className="p-4 border rounded-md shadow flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-semibold">{flat.unique_id || flat.number}</div>
                          <div className="text-gray-500 text-xs">Flat Number: {flat.number}</div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleEditFlat(flat)}
                            className="text-blue-600 hover:text-blue-800 text-xs"
                          >Edit</button>
                          <button
                            onClick={() => handleDeleteFlat(flat.id)}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >Delete</button>
                        </div>
                      </div>
                      {editingFlatId === flat.id && (
                        <form onSubmit={e => { e.preventDefault(); handleUpdateFlat(flat.id); }} className="flex gap-2 mt-2">
                          <input
                            type="text"
                            value={editingFlatNumber}
                            onChange={e => setEditingFlatNumber(e.target.value)}
                            className="border p-1 rounded"
                            required
                          />
                          <button type="submit" className="bg-green-600 text-white px-2 py-1 rounded">Save</button>
                          <button type="button" className="bg-gray-300 px-2 py-1 rounded" onClick={() => setEditingFlatId(null)}>Cancel</button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Flat creation directly under apartment (no block) */}
        {selectedApartment && apartmentFlowChoice === 'noBlock' && (
          <>
            <div className="mb-4">
              <button
                className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
                onClick={() => setShowAddFlat(true)}
              >
                Add Flat
              </button>
              {showAddFlat && (
                <form onSubmit={e => handleCreateFlat(e, null)} className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={newFlat.number}
                    onChange={e => setNewFlat({ number: e.target.value })}
                    placeholder="Flat Number"
                    className="border p-2 rounded"
                    required
                  />
                  <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Create Flat</button>
                </form>
              )}
            </div>
            {/* List flats directly under apartment */}
            <div>
              <h3 className="font-semibold mb-2">Flats in Apartment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                {flats.map(flat => (
                  <div key={flat.id} className="p-4 border rounded-md shadow flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-semibold">{flat.unique_id || flat.number}</div>
                        <div className="text-gray-500 text-xs">Flat Number: {flat.number}</div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleEditFlat(flat)}
                          className="text-blue-600 hover:text-blue-800 text-xs"
                        >Edit</button>
                        <button
                          onClick={() => handleDeleteFlat(flat.id)}
                          className="text-red-600 hover:text-red-800 text-xs"
                        >Delete</button>
                      </div>
                    </div>
                    {editingFlatId === flat.id && (
                      <form onSubmit={e => { e.preventDefault(); handleUpdateFlat(flat.id); }} className="flex gap-2 mt-2">
                        <input
                          type="text"
                          value={editingFlatNumber}
                          onChange={e => setEditingFlatNumber(e.target.value)}
                          className="border p-1 rounded"
                          required
                        />
                        <button type="submit" className="bg-green-600 text-white px-2 py-1 rounded">Save</button>
                        <button type="button" className="bg-gray-300 px-2 py-1 rounded" onClick={() => setEditingFlatId(null)}>Cancel</button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ApartmentManagement; 