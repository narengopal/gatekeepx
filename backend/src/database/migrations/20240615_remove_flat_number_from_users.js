exports.up = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.dropColumn('flat_number');
  });
};
 
exports.down = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.string('flat_number');
  });
}; 