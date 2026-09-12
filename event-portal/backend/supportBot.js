// Small canned-answer bot for the Support widget. It runs on every visitor
// message, before a human ever sees it: matches keywords and returns a short
// helpful reply. It never changes any account data (no self-service password
// resets) — for anything it can't resolve itself, it just says the team has
// been notified, since every message already lands in the /admin Support tab
// either way.

function describeAccess(access) {
  if (!access) return null;
  const days = [];
  if (access.day1) days.push('Day 1');
  if (access.day2) days.push('Day 2');
  if (access.day3) days.push('Day 3');
  if (days.length === 3) return '3-Day Pass (all days)';
  return days.length ? days.join(' + ') : 'no days currently active';
}

const RULES = [
  {
    keywords: ['password', 'forgot', 'reset', 'locked out', "can't log in", 'cant log in', "can't login", 'cant login', 'login problem', 'wrong password', 'not able to log in', "won't log in", 'wont log in'],
    reply: (ctx) => ctx.matched
      ? `I found an account under ${ctx.email}. I can't reset the password myself from here, but I've flagged this for our team — they'll send a fresh login password to that address shortly.`
      : `I couldn't find an account under ${ctx.email} — please double-check it's the exact address you registered with (no typos, right domain, check for a space at the end). If it still won't work, our team will help — just tell me a bit more about what's happening.`,
  },
  {
    keywords: ['stream', 'video', 'watch', 'buffer', 'buffering', 'black screen', 'blank screen', 'lag', "won't play", 'wont play', "isn't playing", 'audio', 'sound', 'no sound'],
    reply: () => `For stream issues: try refreshing the page, double-check you're on the correct day's tab, and confirm your internet connection is stable. If it's still not working after that, our team will jump in.`,
  },
  {
    keywords: ['ticket', 'pass', 'which day', 'which days', 'upgrade', 'access', 'my days'],
    reply: (ctx) => {
      const desc = describeAccess(ctx.access);
      return ctx.matched && desc
        ? `Your ticket currently covers: ${desc}. If you'd like to upgrade to more days, our team can sort that out for you.`
        : `I can't see your ticket details from here — our team will check your access and get back to you.`;
    },
  },
  {
    keywords: ['cpd', 'certificate', 'attendance'],
    reply: () => `CPD points are based on how much of each day you watched, and are calculated after the event — your certificate will follow once the attendance report is finalised.`,
  },
  {
    keywords: ['refund', 'cancel', 'cancellation', 'invoice', 'payment'],
    reply: () => `Billing, refund and cancellation requests need to go through our team directly — I've flagged your message and they'll be in touch.`,
  },
  {
    keywords: ['human', 'real person', 'agent', 'someone', 'talk to', 'speak to'],
    reply: () => `No problem — I've let our team know. They'll reply here as soon as they're available.`,
  },
];

// Runs after every visitor message. ctx: { matched, name, email, attendeeName, access }
function autoReply(text, ctx) {
  const lower = String(text || '').toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) {
      return rule.reply(ctx);
    }
  }
  return `Thanks — I've let our support team know. They'll reply here as soon as they can.`;
}

// Sent once, right when a brand-new conversation is created.
function welcomeMessage(ctx) {
  if (ctx.matched) {
    const first = (ctx.attendeeName || ctx.name || '').trim().split(/\s+/)[0] || 'there';
    const desc = describeAccess(ctx.access);
    return `Hi ${first}! I found your ticket${desc ? ` (${desc})` : ''}. What can I help you with — logins, streaming, tickets, or something else?`;
  }
  const first = (ctx.name || '').trim().split(/\s+/)[0] || 'there';
  return `Hi ${first}! I couldn't find an account under ${ctx.email} yet, but that's okay — tell me what's going on and our team will help.`;
}

module.exports = { autoReply, welcomeMessage, describeAccess };
