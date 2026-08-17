const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendLoginEmail({ to, name, password }) {
  const loginUrl = `${process.env.PUBLIC_URL || 'http://localhost:3000'}/login`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>You're in! Here's your event login</h2>
      <p>Hi ${name || 'there'},</p>
      <p>Your account for the event portal has been created. Use the details below to log in, chat with other attendees, and watch the stream.</p>
      <table style="margin: 16px 0;">
        <tr><td><strong>Email:</strong></td><td>${to}</td></tr>
        <tr><td><strong>Password:</strong></td><td>${password}</td></tr>
      </table>
      <p><a href="${loginUrl}" style="background:#111;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;">Log in now</a></p>
      <p style="color:#666;font-size:13px;">You can change your password after logging in. See you there!</p>
    </div>
  `;

  if (!resend) {
    console.warn(`[emailService] RESEND_API_KEY not set — skipping email to ${to}. Password: ${password}`);
    return { skipped: true };
  }

  return resend.emails.send({
    from: process.env.EMAIL_FROM || 'Event <onboarding@resend.dev>',
    to,
    subject: 'Your event login details',
    html,
  });
}

module.exports = { sendLoginEmail };
