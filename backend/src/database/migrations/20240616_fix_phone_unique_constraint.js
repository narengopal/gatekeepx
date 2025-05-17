exports.up = async function(knex) {
  // Check if the unique constraint exists
  const result = await knex.raw(`
    SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_unique'
  `);
  const exists = result.rows.length > 0;

  if (!exists) {
    await knex.schema.alterTable('users', function(table) {
      table.unique('phone', 'users_phone_unique');
    });
  }
};

exports.down = async function(knex) {
  // Check if the unique constraint exists
  const result = await knex.raw(`
    SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_unique'
  `);
  const exists = result.rows.length > 0;

  if (exists) {
    await knex.schema.alterTable('users', function(table) {
      table.dropUnique('phone', 'users_phone_unique');
    });
  }
}; 