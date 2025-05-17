exports.up = function(knex) {
  return knex.schema.alterTable('visits', (table) => {
    table.text('purpose');
    table.timestamp('expected_arrival');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('visits', (table) => {
    table.dropColumn('purpose');
    table.dropColumn('expected_arrival');
  });
}; 