import React, { useEffect, useState } from 'react';
import axios from 'axios';

function ApartmentManagement() {
  const [apartments, setApartments] = useState([]);
  const [selectedApartment, setSelectedApartment] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [flats, setFlats] = useState([]);
  const [apartmentForm, setApartmentForm] = useState({ name: '' });
  const [blockForm, setBlockForm] = useState({ name: '' });
  const [flatForm, setFlatForm] = useState({ number: '' });
  const [editingApartment, setEditingApartment] = useState(null);
  const [editingBlock, setEditingBlock] = useState(null);
  const [editingFlat, setEditingFlat] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch all apartments
  const fetchApartments = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/apartments');
      setApartments(res.data);
    } catch (err) {
      setError('Failed to fetch apartments');
    } finally {
      setLoading(false);
    }
  };

  // Fetch blocks for an apartment
  const fetchBlocks = async (apartmentId) => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/admin/apartments/${apartmentId}/blocks`);
      setBlocks(res.data);
    } catch (err) {
      setError('Failed to fetch blocks');
    } finally {
      setLoading(false);
    }
  };

  // Fetch flats for a block
  const fetchFlats = async (blockId) => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/admin/blocks/${blockId}/flats`);
      setFlats(res.data);
    } catch (err) {
      setError('Failed to fetch flats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApartments();
  }, []);

  useEffect(() => {
    if (selectedApartment) {
      fetchBlocks(selectedApartment.id);
      setSelectedBlock(null);
      setFlats([]);
    } else {
      setBlocks([]);
      setSelectedBlock(null);
      setFlats([]);
    }
  }, [selectedApartment]);

  useEffect(() => {
    if (selectedBlock) fetchFlats(selectedBlock.id);
    else setFlats([]);
  }, [selectedBlock]);

  // Apartment CRUD
  const handleApartmentFormChange = (e) => {
    setApartmentForm({ ...apartmentForm, [e.target.name]: e.target.value });
  };
  const handleCreateApartment = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await axios.post('/api/admin/apartments', apartmentForm);
      setApartmentForm({ name: '' });
      setSuccess('Apartment created');
      fetchApartments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create apartment');
    }
  };
  const handleEditApartment = (apartment) => {
    setEditingApartment(apartment);
    setApartmentForm({ name: apartment.name });
  };
  const handleUpdateApartment = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await axios.put(`/api/admin/apartments/${editingApartment.id}`, apartmentForm);
      setEditingApartment(null);
      setApartmentForm({ name: '' });
      setSuccess('Apartment updated');
      fetchApartments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update apartment');
    }
  };
  const handleDeleteApartment = async (apartmentId) => {
    if (!window.confirm('Delete this apartment and all its blocks?')) return;
    setError(''); setSuccess('');
    try {
      await axios.delete(`/api/admin/apartments/${apartmentId}`);
      setSuccess('Apartment deleted');
      if (selectedApartment && selectedApartment.id === apartmentId) setSelectedApartment(null);
      fetchApartments();
    } catch (err) {
      setError('Failed to delete apartment');
    }
  };

  // Block CRUD
  const handleBlockFormChange = (e) => {
    setBlockForm({ ...blockForm, [e.target.name]: e.target.value });
  };
  const handleCreateBlock = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await axios.post(`/api/admin/apartments/${selectedApartment.id}/blocks`, blockForm);
      setBlockForm({ name: '' });
      setSuccess('Block added');
      fetchBlocks(selectedApartment.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add block');
    }
  };
  const handleEditBlock = (block) => {
    setEditingBlock(block);
    setBlockForm({ name: block.name });
  };
  const handleUpdateBlock = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await axios.put(`/api/admin/blocks/${editingBlock.id}`, blockForm);
      setEditingBlock(null);
      setBlockForm({ name: '' });
      setSuccess('Block updated');
      fetchBlocks(selectedApartment.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update block');
    }
  };
  const handleDeleteBlock = async (blockId) => {
    if (!window.confirm('Delete this block and all its flats?')) return;
    setError(''); setSuccess('');
    try {
      await axios.delete(`/api/admin/blocks/${blockId}`);
      setSuccess('Block deleted');
      if (selectedBlock && selectedBlock.id === blockId) setSelectedBlock(null);
      fetchBlocks(selectedApartment.id);
    } catch (err) {
      setError('Failed to delete block');
    }
  };

  // Flat CRUD
  const handleFlatFormChange = (e) => {
    setFlatForm({ ...flatForm, [e.target.name]: e.target.value });
  };
  const handleCreateFlat = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await axios.post(`/api/admin/blocks/${selectedBlock.id}/flats`, flatForm);
      setFlatForm({ number: '' });
      setSuccess('Flat added');
      fetchFlats(selectedBlock.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add flat');
    }
  };
  const handleEditFlat = (flat) => {
    setEditingFlat(flat);
    setFlatForm({ number: flat.number });
  };
  const handleUpdateFlat = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await axios.put(`/api/admin/flats/${editingFlat.id}`, flatForm);
      setEditingFlat(null);
      setFlatForm({ number: '' });
      setSuccess('Flat updated');
      fetchFlats(selectedBlock.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update flat');
    }
  };
  const handleDeleteFlat = async (flatId) => {
    if (!window.confirm('Delete this flat?')) return;
    setError(''); setSuccess('');
    try {
      await axios.delete(`/api/admin/flats/${flatId}`);
      setSuccess('Flat deleted');
      fetchFlats(selectedBlock.id);
    } catch (err) {
      setError('Failed to delete flat');
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8">
      <h2 className="text-2xl font-bold mb-6">Apartment Management</h2>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {success && <div className="text-green-600 mb-2">{success}</div>}
      {/* Apartment Management */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-2">Apartments</h3>
        <form onSubmit={editingApartment ? handleUpdateApartment : handleCreateApartment} className="flex gap-2 mb-4">
          <input
            type="text"
            name="name"
            value={apartmentForm.name}
            onChange={handleApartmentFormChange}
            placeholder="Apartment name"
            className="border px-2 py-1 rounded w-full"
            required
          />
          <button type="submit" className="px-4 py-1 rounded bg-indigo-600 text-white">
            {editingApartment ? 'Update' : 'Add'}
          </button>
          {editingApartment && (
            <button type="button" onClick={() => { setEditingApartment(null); setApartmentForm({ name: '' }); }} className="px-2 py-1 rounded bg-gray-300">Cancel</button>
          )}
        </form>
        <ul className="divide-y divide-gray-200">
          {apartments.map((apartment) => (
            <li key={apartment.id} className={`py-2 flex items-center justify-between ${selectedApartment && selectedApartment.id === apartment.id ? 'bg-indigo-50' : ''}`}>
              <span className="cursor-pointer font-medium" onClick={() => setSelectedApartment(apartment)}>{apartment.name}</span>
              <div className="flex gap-2">
                <button onClick={() => handleEditApartment(apartment)} className="text-blue-600">Edit</button>
                <button onClick={() => handleDeleteApartment(apartment.id)} className="text-red-600">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {/* Block Management */}
      {selectedApartment && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-2">Blocks <span className="text-sm text-gray-500">in {selectedApartment.name}</span></h3>
          <form onSubmit={editingBlock ? handleUpdateBlock : handleCreateBlock} className="flex gap-2 mb-4">
            <input
              type="text"
              name="name"
              value={blockForm.name}
              onChange={handleBlockFormChange}
              placeholder="Block name"
              className="border px-2 py-1 rounded w-full"
              required
            />
            <button type="submit" className="px-4 py-1 rounded bg-indigo-600 text-white">
              {editingBlock ? 'Update' : 'Add'}
            </button>
            {editingBlock && (
              <button type="button" onClick={() => { setEditingBlock(null); setBlockForm({ name: '' }); }} className="px-2 py-1 rounded bg-gray-300">Cancel</button>
            )}
          </form>
          <ul className="divide-y divide-gray-200">
            {blocks.map((block) => (
              <li key={block.id} className={`py-2 flex items-center justify-between ${selectedBlock && selectedBlock.id === block.id ? 'bg-indigo-50' : ''}`}>
                <span className="cursor-pointer font-medium" onClick={() => setSelectedBlock(block)}>{block.name}</span>
                <div className="flex gap-2">
                  <button onClick={() => handleEditBlock(block)} className="text-blue-600">Edit</button>
                  <button onClick={() => handleDeleteBlock(block.id)} className="text-red-600">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Flat Management */}
      {selectedBlock && (
        <div>
          <h3 className="text-lg font-semibold mb-2">Flats <span className="text-sm text-gray-500">in {selectedBlock.name}</span></h3>
          <form onSubmit={editingFlat ? handleUpdateFlat : handleCreateFlat} className="flex gap-2 mb-4">
            <input
              type="text"
              name="number"
              value={flatForm.number}
              onChange={handleFlatFormChange}
              placeholder="Flat number"
              className="border px-2 py-1 rounded w-full"
              required
            />
            <button type="submit" className="px-4 py-1 rounded bg-indigo-600 text-white">
              {editingFlat ? 'Update' : 'Add'}
            </button>
            {editingFlat && (
              <button type="button" onClick={() => { setEditingFlat(null); setFlatForm({ number: '' }); }} className="px-2 py-1 rounded bg-gray-300">Cancel</button>
            )}
          </form>
          <ul className="divide-y divide-gray-200">
            {flats.map((flat) => (
              <li key={flat.id} className="py-2 flex items-center justify-between">
                <span>{flat.number}</span>
                <div className="flex gap-2">
                  <button onClick={() => handleEditFlat(flat)} className="text-blue-600">Edit</button>
                  <button onClick={() => handleDeleteFlat(flat.id)} className="text-red-600">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ApartmentManagement; 