exports.up = async function(knex) {
  // Drop the existing foreign key
  await knex.schema.alterTable('notifications', function(table) {
    table.dropForeign('user_id');
  });
  // Re-add with ON DELETE CASCADE
  await knex.schema.alterTable('notifications', function(table) {
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
};

exports.down = async function(knex) {
  // Drop the CASCADE foreign key
  await knex.schema.alterTable('notifications', function(table) {
    table.dropForeign('user_id');
  });
  // Re-add without CASCADE (default RESTRICT)
  await knex.schema.alterTable('notifications', function(table) {
    table.foreign('user_id').references('users.id');
  });
}; 