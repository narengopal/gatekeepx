exports.up = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.integer('apartment_id').unsigned().references('id').inTable('apartments').onDelete('SET NULL');
    table.integer('flat_id').unsigned().references('id').inTable('flats').onDelete('SET NULL');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.dropColumn('apartment_id');
    table.dropColumn('flat_id');
  });
}; 