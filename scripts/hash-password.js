#!/usr/bin/env node
// Run this locally to generate your ADMIN_PASSWORD_HASH env var
// Usage: node scripts/hash-password.js
// Then paste the output into your Vercel environment variables

const bcrypt = require('bcryptjs')
const readline = require('readline')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

rl.question('Enter admin password to hash: ', async (password) => {
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.')
    process.exit(1)
  }
  const hash = await bcrypt.hash(password, 12)
  console.log('\n✓ Add this to your Vercel environment variables:\n')
  console.log('ADMIN_PASSWORD_HASH=' + hash)
  console.log('\nNever share or commit this hash.')
  rl.close()
})
