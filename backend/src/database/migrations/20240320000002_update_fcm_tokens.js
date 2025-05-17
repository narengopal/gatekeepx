exports.up = async function(knex) {
  // First check if columns exist
  const hasDeviceType = await knex.schema.hasColumn('fcm_tokens', 'device_type');
  const hasIsActive = await knex.schema.hasColumn('fcm_tokens', 'is_active');

  return knex.schema.alterTable('fcm_tokens', function(table) {
    if (!hasDeviceType) {
      table.string('device_type').defaultTo('web');
    }
    if (!hasIsActive) {
      table.boolean('is_active').defaultTo(true);
    }
  });
};

exports.down = async function(knex) {
  const hasDeviceType = await knex.schema.hasColumn('fcm_tokens', 'device_type');
  const hasIsActive = await knex.schema.hasColumn('fcm_tokens', 'is_active');

  return knex.schema.alterTable('fcm_tokens', function(table) {
    if (hasDeviceType) {
      table.dropColumn('device_type');
    }
    if (hasIsActive) {
      table.dropColumn('is_active');
    }
  });
}; 