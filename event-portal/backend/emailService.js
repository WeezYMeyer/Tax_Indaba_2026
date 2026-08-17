const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const DAY_DATES = {
  1: process.env.EVENT_DAY1_DATE || 'Monday, 14 September',
  2: process.env.EVENT_DAY2_DATE || 'Tuesday, 15 September',
  3: process.env.EVENT_DAY3_DATE || 'Wednesday, 16 September',
};

function accessRow(dayNum, included) {
  const date = DAY_DATES[dayNum];
  const label = process.env[`EVENT_DAY${dayNum}_LABEL`] || `Day ${dayNum}`;
  const icon = included ? '&#10003;' : '&#10005;';
  const iconColor = included ? '#e6c876' : '#4a5a75';
  const textColor = included ? '#f4efe2' : '#5b6b85';
  return `
    <tr>
      <td style="padding:7px 0;border-bottom:1px solid rgba(201,154,60,0.15);font-family:Arial,Helvetica,sans-serif;">
        <span style="display:inline-block;width:20px;color:${iconColor};font-weight:700;font-size:13px;">${icon}</span>
        <span style="color:${textColor};font-size:14px;">${label} &mdash; ${date}</span>
      </td>
    </tr>`;
}

// access: { day1: bool, day2: bool, day3: bool }. Defaults to full access if
// not provided, so nothing breaks for any code path that doesn't pass it yet.
async function sendLoginEmail({ to, name, password, access }) {
  const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
  const loginUrl = `${baseUrl}/login?email=${encodeURIComponent(to)}`;
  const logoUrl = `${baseUrl}/tax-indaba-logo.png`;

  const acc = access || { day1: true, day2: true, day3: true };
  const accessRows = [1, 2, 3].map((n) => accessRow(n, acc[`day${n}`])).join('');

  const html = `
  <div style="background:#071324;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
      <tr>
        <td style="border-radius:12px;overflow:hidden;background:#0e2748;border:1px solid rgba(201,154,60,0.3);">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="height:4px;background:#c99a3c;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:32px 32px 4px;">
                <img src="${logoUrl}" alt="Tax Indaba" height="56" style="height:56px;width:auto;display:block;margin-bottom:22px;" />
                <p style="color:#e6c876;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;font-weight:bold;">Attendee Access</p>
                <h1 style="color:#f4efe2;font-size:22px;font-weight:normal;margin:0 0 14px;">You're in, ${name || 'there'}!</h1>
                <p style="color:#93a8c7;font-size:14px;line-height:1.6;margin:0 0 8px;">
                  Your account for the 13th Annual Tax Indaba has been created. Use the password below to log in and access your chat and stream.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 32px 4px;">
                <p style="color:#e6c876;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin:0 0 8px;font-weight:bold;">Your access</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${accessRows}
                </table>
                <p style="color:#5b6b85;font-size:12px;margin:10px 0 0;">Days marked with a cross aren't included in your ticket. Contact the organizers if you'd like to upgrade.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(7,19,36,0.6);border:1px solid rgba(201,154,60,0.25);border-radius:8px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <p style="color:#93a8c7;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin:0 0 4px;">Email</p>
                      <p style="color:#f4efe2;font-size:14px;margin:0 0 16px;">${to}</p>
                      <p style="color:#93a8c7;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin:0 0 6px;">Password</p>
                      <table role="presentation" cellpadding="0" cellspacing="0" style="background:#071324;border:1px dashed rgba(201,154,60,0.4);border-radius:6px;">
                        <tr>
                          <td style="padding:12px 18px;">
                            <span style="color:#e6c876;font-size:22px;font-weight:bold;font-family:'Courier New',Courier,monospace;letter-spacing:2px;">${password}</span>
                          </td>
                        </tr>
                      </table>
                      <p style="color:#5b6b85;font-size:11px;margin:8px 0 0;">Tap and hold (or double-click) the password above to select and copy it.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 32px 32px;text-align:center;">
                <a href="${loginUrl}" style="display:inline-block;background:#e6c876;color:#2a1c05;text-decoration:none;font-weight:bold;font-size:14px;padding:13px 30px;border-radius:8px;">Log in now</a>
                <p style="color:#5b6b85;font-size:12px;margin:16px 0 0;">Your email is already filled in on that link &mdash; just enter your password.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid rgba(201,154,60,0.15);text-align:center;">
                <p style="color:#5b6b85;font-size:11px;margin:0;">13th Annual Tax Indaba &middot; 14&ndash;16 September 2026 &middot; The Capital On The Park, Sandton</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;

  if (!resend) {
    console.warn(`[emailService] RESEND_API_KEY not set — skipping email to ${to}. Password: ${password}`);
    return { skipped: true };
  }

  return resend.emails.send({
    from: process.env.EMAIL_FROM || 'Event <onboarding@resend.dev>',
    to,
    subject: 'Your Tax Indaba login details',
    html,
  });
}

module.exports = { sendLoginEmail };
