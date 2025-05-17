const bcrypt = require('bcryptjs');

exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('users').del();

  // Create test users (password is 'test123' hashed)
  const hashedPassword = await bcrypt.hash('test123', 10);
  
  // Admin users
  await knex('users').insert([
    {
      name: 'Super Admin',
      phone: '9999999999',
      password: hashedPassword,
      role: 'admin',
      is_approved: true
    },
    {
      name: 'Admin Assistant',
      phone: '8888888888',
      password: hashedPassword,
      role: 'admin',
      is_approved: true
    }
  ]);

  // Security users
  await knex('users').insert([
    {
      name: 'Main Security Guard',
      phone: '7777777777',
      password: hashedPassword,
      role: 'security',
      is_approved: true
    },
    {
      name: 'Night Security Guard',
      phone: '6666666666',
      password: hashedPassword,
      role: 'security',
      is_approved: true
    }
  ]);

  // Resident users
  await knex('users').insert([
    {
      name: 'John Resident',
      phone: '5555555555',
      password: hashedPassword,
      role: 'resident',
      is_approved: true
    },
    {
      name: 'Jane Resident',
      phone: '4444444444',
      password: hashedPassword,
      role: 'resident',
      is_approved: true
    },
    {
      name: 'Pending Resident',
      phone: '3333333333',
      password: hashedPassword,
      role: 'resident',
      is_approved: false
    }
  ]);
}; 