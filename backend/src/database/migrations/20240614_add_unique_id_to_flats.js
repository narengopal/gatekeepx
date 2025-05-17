exports.up = async function(knex) {
  // 1. Add the column as nullable
  await knex.schema.alterTable('flats', function(table) {
    table.string('unique_id');
  });

  // 2. Backfill unique_id for existing flats
  const flats = await knex('flats');
  for (const flat of flats) {
    // If block_id exists, fetch block name
    let uniqueId = flat.number;
    if (flat.block_id) {
      const block = await knex('blocks').where({ id: flat.block_id }).first();
      if (block && block.name) {
        uniqueId = `${block.name}${flat.number}`;
      }
    }
    await knex('flats').where({ id: flat.id }).update({ unique_id: uniqueId });
  }

  // 3. Alter the column to be not nullable and unique
  await knex.schema.alterTable('flats', function(table) {
    table.string('unique_id').notNullable().unique().alter();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('flats', function(table) {
    table.dropColumn('unique_id');
  });
}; 