exports.up = function(knex) {
  return knex.schema
    // Users table
    .createTable('users', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('phone').notNullable().unique();
      table.string('password').notNullable();
      table.enum('role', ['resident', 'admin', 'security']).notNullable();
      table.string('flat_number').notNullable();
      table.boolean('is_approved').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })

    // Blocks table
    .createTable('blocks', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })

    // Flats table
    .createTable('flats', (table) => {
      table.increments('id').primary();
      table.string('number').notNullable();
      table.integer('block_id').references('id').inTable('blocks').onDelete('CASCADE');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })

    // Guests table
    .createTable('guests', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('phone');
      table.string('vehicle_number');
      table.integer('invited_by').references('id').inTable('users').onDelete('CASCADE');
      table.boolean('is_daily_pass').defaultTo(false);
      table.timestamp('valid_from');
      table.timestamp('valid_until');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })

    // Visits table
    .createTable('visits', (table) => {
      table.increments('id').primary();
      table.integer('guest_id').references('id').inTable('guests').onDelete('CASCADE');
      table.integer('flat_id').references('id').inTable('flats').onDelete('CASCADE');
      table.integer('checked_by').references('id').inTable('users').onDelete('SET NULL');
      table.enum('status', ['pending', 'approved', 'rejected', 'checked_in']).defaultTo('pending');
      table.string('qr_token').unique();
      table.boolean('is_qr_used').defaultTo(false);
      table.timestamp('checked_in_at');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })

    // Notifications table
    .createTable('notifications', (table) => {
      table.increments('id').primary();
      table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.string('type').notNullable();
      table.text('message').notNullable();
      table.boolean('is_read').defaultTo(false);
      table.json('metadata');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('notifications')
    .dropTableIfExists('visits')
    .dropTableIfExists('guests')
    .dropTableIfExists('flats')
    .dropTableIfExists('blocks')
    .dropTableIfExists('users');
}; 