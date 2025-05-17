const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Block = require('./Block');
const Apartment = require('./Apartment');

const Flat = sequelize.define('Flat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  number: {
    type: DataTypes.STRING,
    allowNull: false
  },
  blockId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Block,
      key: 'id'
    }
  },
  apartmentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Apartment,
      key: 'id'
    }
  }
}, {
  timestamps: true
});

// Define relationships
Flat.belongsTo(Block, { foreignKey: 'blockId' });
Block.hasMany(Flat, { foreignKey: 'blockId' });
Flat.belongsTo(Apartment, { foreignKey: 'apartmentId' });
Apartment.hasMany(Flat, { foreignKey: 'apartmentId' });

module.exports = Flat; 