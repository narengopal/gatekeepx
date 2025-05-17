exports.up = function(knex) {
  return knex.schema.alterTable('flats', function(table) {
    table.integer('apartment_id').nullable();
    table.foreign('apartment_id').references('apartments.id').onDelete('CASCADE');
  });
};

exports.down = async function(knex) {
  // Check if the column exists before dropping foreign key and column
  const hasColumn = await knex.schema.hasColumn('flats', 'apartment_id');
  if (hasColumn) {
    // Drop the foreign key constraint only if it exists
    const result = await knex.raw(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'flats' AND constraint_name = 'flats_apartment_id_foreign'
    `);
    if (result.rows.length > 0) {
      await knex.schema.alterTable('flats', function(table) {
        table.dropForeign('apartment_id', 'flats_apartment_id_foreign');
      });
    }
    await knex.schema.alterTable('flats', function(table) {
      table.dropColumn('apartment_id');
    });
  }
}; 