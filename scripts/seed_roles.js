// scripts/seed_roles.js
// Seed script: set missing roles to 'reviewer' and create admin/manager users if absent.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Profile = require('../database/models/Profile');

async function main() {
  if (!process.env.MONGO_URL) {
    console.error('MONGO_URL not set. Set it in .env before running this script.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URL);
  console.log('Connected to DB for seeding roles.');

  // Set role='reviewer' where role is missing
  const updateRes = await Profile.updateMany({ role: { $exists: false } }, { $set: { role: 'reviewer' } });
  console.log(`Updated ${updateRes.modifiedCount || updateRes.nModified || 0} existing documents to role='reviewer' (if any missing).`);

  // Create admin and manager users if they don't exist
  const allowedQuestions = [
    "What is the name of a childhood friend that no one else would know?",
    "What is your favorite fictional location from a book or movie?",
    "What is/was the name of your first pet?"
  ];

  const accounts = [
    { 
      name: process.env.SEED_ADMIN_NAME || 'admin', 
      pass: process.env.SEED_ADMIN_PASS || 'ChangeMe123!', 
      role: 'admin',
      recoveryQuestion: allowedQuestions[0],
      recoveryAnswer: 'admin_recovery_answer'
    },
    { 
      name: process.env.SEED_MANAGER_NAME || 'manager', 
      pass: process.env.SEED_MANAGER_PASS || 'ChangeMe123!', 
      role: 'manager',
      recoveryQuestion: allowedQuestions[1],
      recoveryAnswer: 'manager_recovery_answer'
    }
  ];

  for (const acct of accounts) {
    const existing = await Profile.findOne({ name: acct.name });
    if (existing) {
      if (existing.role !== acct.role) {
        existing.role = acct.role;
        await existing.save();
        console.log(`Updated role for existing user '${acct.name}' to '${acct.role}'.`);
      } else {
        console.log(`User '${acct.name}' already exists with role '${acct.role}'.`);
      }
      continue;
    }

    // Hash password and recovery answer
    const hashedPassword = await bcrypt.hash(acct.pass, 10);
    const hashedAnswer = await bcrypt.hash(acct.recoveryAnswer.toLowerCase().trim(), 10);

    const user = new Profile({ 
      name: acct.name, 
      password: hashedPassword, 
      role: acct.role,
      recoveryQuestion: acct.recoveryQuestion,
      recoveryAnswerHash: hashedAnswer,
      previousPasswords: [],
      lastPasswordChange: new Date(),
      failedLoginAttempts: 0,
      lockUntil: null,
      lastLoginAttempt: null,
      lastSuccessfulLogin: null
    });
    
    await user.save();
    console.log(`Created ${acct.role} account '${acct.name}' with temporary password '${acct.pass}'.`);
    console.log(`  Recovery question: "${acct.recoveryQuestion}"`);
    console.log(`  Recovery answer: "${acct.recoveryAnswer}" (for testing only)`);
    console.log(`  Please change password immediately after first login!`);
  }

  await mongoose.disconnect();
  console.log('Seeding complete. Disconnected.');
}

main().catch(err => { console.error('Seed failed:', err); process.exit(1); });
