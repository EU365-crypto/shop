require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = require('../../src/mail/store-mailer').createStoreMailer(nodemailer);

async function testEmail() {
  try {
    if (process.argv.includes('--verify')) {
      await transporter.verify();
      console.log('SMTP connection and authentication verified.');
      return;
    }
    await transporter.sendMail({
      to: transporter.address,
      subject: "Hongkong Supermarket Test",
      text: "Your email verification system is working!"
    });

    console.log("Email sent successfully!");
  } catch (error) {
    console.error("Email failed:", error.code || 'EMAIL_ERROR', error.responseCode || '');
    process.exitCode = 1;
  }
}

testEmail();
