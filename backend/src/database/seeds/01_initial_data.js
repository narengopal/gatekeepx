const bcrypt = require('bcryptjs');

exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('notifications').del();
  await knex('visits').del();
  await knex('guests').del();
  await knex('users').del();
  await knex('flats').del();
  await knex('blocks').del();
  await knex('apartments').del();

  // Create an apartment
  const [apartment] = await knex('apartments').insert({ name: 'Test Apartment' }).returning('*');

  // Create blocks linked to the apartment
  const [blockA] = await knex('blocks').insert([
    { name: 'Block A', apartment_id: apartment.id },
    { name: 'Block B', apartment_id: apartment.id }
  ]).returning('*');

  // Create flats linked to block and apartment
  const [flatA101] = await knex('flats').insert([
    { number: 'A101', block_id: blockA.id, apartment_id: apartment.id, unique_id: 'A101' },
    { number: 'A102', block_id: blockA.id, apartment_id: apartment.id, unique_id: 'A102' }
  ]).returning('*');

  // Create users (password is 'password123' hashed)
  const hashedPassword = await bcrypt.hash('password123', 10);
  const [admin, resident, security, pendingResident] = await knex('users').insert([
    {
      name: 'Admin User',
      phone: '1234567890',
      password: hashedPassword,
      role: 'admin',
      is_approved: true
    },
    {
      name: 'Resident User',
      phone: '9876543210',
      password: hashedPassword,
      role: 'resident',
      is_approved: true
    },
    {
      name: 'Security Guard',
      phone: '5555555555',
      password: hashedPassword,
      role: 'security',
      is_approved: true
    },
    {
      name: 'Pending Resident',
      phone: '2222222222',
      password: hashedPassword,
      role: 'resident',
      is_approved: false,
      flat_id: flatA101.id,
      apartment_id: apartment.id
    }
  ]).returning('*');

  // Create a guest
  const [guest] = await knex('guests').insert([
    {
      name: 'Test Guest',
      phone: '1111111111',
      invited_by: resident.id,
      is_daily_pass: false
    }
  ]).returning('*');

  // Create a visit
  await knex('visits').insert([
    {
      guest_id: guest.id,
      flat_id: flatA101.id,
      checked_by: security.id,
      status: 'checked_in',
      checked_in_at: new Date()
    }
  ]);
}; 