const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Apartment = require('./Apartment');

const Block = sequelize.define('Block', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  apartmentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Apartment,
      key: 'id'
    }
  }
}, {
  timestamps: true
});

// Define relationships
Block.belongsTo(Apartment, { foreignKey: 'apartmentId' });
Apartment.hasMany(Block, { foreignKey: 'apartmentId' });

module.exports = Block; 