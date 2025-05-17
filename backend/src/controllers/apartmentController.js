const Apartment = require('../models/Apartment');
const Block = require('../models/Block');
const Flat = require('../models/Flat');

// Get all apartments
exports.getAllApartments = async (req, res) => {
  try {
    const apartments = await Apartment.findAll();
    res.json(apartments);
  } catch (error) {
    console.error('Error fetching apartments:', error);
    res.status(500).json({ message: 'Error fetching apartments' });
  }
};

// Create new apartment (Super Admin only)
exports.createApartment = async (req, res) => {
  try {
    const { name } = req.body;
    const apartment = await Apartment.create({ name });
    res.status(201).json(apartment);
  } catch (error) {
    console.error('Error creating apartment:', error);
    res.status(500).json({ message: 'Error creating apartment' });
  }
};

// Delete apartment (Super Admin only)
exports.deleteApartment = async (req, res) => {
  try {
    const { id } = req.params;
    await Apartment.destroy({ where: { id } });
    res.json({ message: 'Apartment deleted successfully' });
  } catch (error) {
    console.error('Error deleting apartment:', error);
    res.status(500).json({ message: 'Error deleting apartment' });
  }
};

// Get blocks for an apartment
exports.getBlocks = async (req, res) => {
  try {
    const { apartmentId } = req.params;
    const blocks = await Block.findAll({ where: { apartmentId } });
    res.json(blocks);
  } catch (error) {
    console.error('Error fetching blocks:', error);
    res.status(500).json({ message: 'Error fetching blocks' });
  }
};

// Create new block
exports.createBlock = async (req, res) => {
  try {
    const { apartmentId } = req.params;
    const { name } = req.body;
    const block = await Block.create({ name, apartmentId });
    res.status(201).json(block);
  } catch (error) {
    console.error('Error creating block:', error);
    res.status(500).json({ message: 'Error creating block' });
  }
};

// Delete block
exports.deleteBlock = async (req, res) => {
  try {
    const { id } = req.params;
    await Block.destroy({ where: { id } });
    res.json({ message: 'Block deleted successfully' });
  } catch (error) {
    console.error('Error deleting block:', error);
    res.status(500).json({ message: 'Error deleting block' });
  }
};

// Get flats for a block
exports.getFlats = async (req, res) => {
  try {
    const { blockId } = req.params;
    const flats = await Flat.findAll({ where: { blockId } });
    res.json(flats);
  } catch (error) {
    console.error('Error fetching flats:', error);
    res.status(500).json({ message: 'Error fetching flats' });
  }
};

// Create new flat
exports.createFlat = async (req, res) => {
  try {
    const { blockId } = req.params;
    const { number, apartmentId } = req.body;
    let flat;
    if (blockId && blockId !== 'null') {
      flat = await Flat.create({ number, blockId });
    } else if (apartmentId) {
      flat = await Flat.create({ number, apartmentId });
    } else {
      return res.status(400).json({ message: 'Must provide blockId or apartmentId' });
    }
    res.status(201).json(flat);
  } catch (error) {
    console.error('Error creating flat:', error);
    res.status(500).json({ message: 'Error creating flat' });
  }
};

// Delete flat
exports.deleteFlat = async (req, res) => {
  try {
    const { id } = req.params;
    await Flat.destroy({ where: { id } });
    res.json({ message: 'Flat deleted successfully' });
  } catch (error) {
    console.error('Error deleting flat:', error);
    res.status(500).json({ message: 'Error deleting flat' });
  }
};

// Create flat directly under apartment (no block)
exports.createFlatForApartment = async (req, res) => {
  try {
    const { apartmentId } = req.params;
    const { number } = req.body;
    const flat = await Flat.create({ number, apartmentId });
    res.status(201).json(flat);
  } catch (error) {
    console.error('Error creating flat for apartment:', error);
    res.status(500).json({ message: 'Error creating flat for apartment' });
  }
}; 