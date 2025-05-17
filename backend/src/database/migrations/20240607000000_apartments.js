exports.up = function(knex) {
  return knex.schema
    .createTable('apartments', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable().unique();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .table('blocks', (table) => {
      table.integer('apartment_id').references('id').inTable('apartments').onDelete('CASCADE');
    });
};

exports.down = function(knex) {
  return knex.schema
    .table('flats', (table) => {
      table.dropForeign('apartment_id');
      table.dropColumn('apartment_id');
    })
    .table('blocks', (table) => {
      table.dropColumn('apartment_id');
    })
    .dropTableIfExists('apartments');
}; 