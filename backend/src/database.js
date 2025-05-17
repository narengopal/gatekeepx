const { Pool } = require('pg');
const knex = require('knex');
const config = require('../knexfile')[process.env.NODE_ENV || 'development'];

const pool = new Pool(config.connection);

const db = knex({
  client: 'pg',
  connection: config.connection,
  pool: config.pool
});

// Remove all schema/table/constraint creation code from here.
// All schema management should be done via migrations only.

module.exports = db; 