'use strict';

const ORDER_CONFIRMATION_PATTERNS = [
  /order\s*(confirmation|confirmed|received|placed)/i,
  /your\s*order\s*(has been|is)\s*(placed|confirmed|received)/i,
  /thank\s*you\s*for\s*your\s*order/i,
  /order\s*#?\s*\d/i,
  /delivery\s*(confirmation|confirmed|scheduled)/i,
  /your\s*delivery\s*is\s*(on the way|scheduled|confirmed)/i,
  /receipt\s*for\s*your\s*(order|purchase)/i,
  /purchase\s*confirmation/i,
  /we('re|'ve|\s*are|\s*have)\s*(preparing|received|got)\s*your\s*order/i,
  /order\s*summary/i,
];

const MERCHANT_DOMAIN_MAP = {
  'doordash.com': 'DoorDash',
  'amazon.com': 'Amazon',
  'target.com': 'Target',
  'walmart.com': 'Walmart',
  'instacart.com': 'Instacart',
  'ubereats.com': 'Uber Eats',
  'grubhub.com': 'Grubhub',
  'kroger.com': 'Kroger',
  'costco.com': 'Costco',
};

function extractDomain(from) {
  const match = (from || '').match(/@([\w.-]+)/);
  return match ? match[1].toLowerCase() : null;
}

function lookupMerchant(domain) {
  if (!domain) return null;
  for (const [key, name] of Object.entries(MERCHANT_DOMAIN_MAP)) {
    if (domain.includes(key)) return name;
  }
  return null;
}

function detectOrderEmail(email) {
  const subject = email.subject || '';
  const snippet = email.snippet || '';
  const text = `${subject} ${snippet}`;

  const isOrder = ORDER_CONFIRMATION_PATTERNS.some((p) => p.test(text));
  if (!isOrder) return null;

  const domain = extractDomain(email.from);
  const merchant_name = lookupMerchant(domain) || domain?.split('.')[0] || 'Unknown';

  const totalMatch = text.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  const order_total = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : null;

  const item_summary = snippet.slice(0, 120) || null;
  const order_date = email.date ? new Date(email.date).toISOString() : new Date().toISOString();

  return {
    email_id: email.id,
    merchant_name,
    sender_domain: domain,
    order_total,
    item_summary,
    order_date,
    raw_subject: subject.slice(0, 500),
  };
}

async function isDuplicateOrder(supabase, householdId, emailId, merchantName, orderTotal, orderDate) {
  const { data: byEmail } = await supabase
    .from('detected_order_emails')
    .select('id')
    .eq('household_id', householdId)
    .eq('email_id', emailId)
    .limit(1);
  if (byEmail?.length) return true;

  if (merchantName && orderTotal && orderDate) {
    const windowStart = new Date(new Date(orderDate).getTime() - 5 * 60000).toISOString();
    const windowEnd = new Date(new Date(orderDate).getTime() + 5 * 60000).toISOString();
    const { data: bySimilar } = await supabase
      .from('detected_order_emails')
      .select('id')
      .eq('household_id', householdId)
      .eq('merchant_name', merchantName)
      .gte('order_date', windowStart)
      .lte('order_date', windowEnd)
      .limit(1);
    if (bySimilar?.length) {
      const tolerance = orderTotal * 0.05;
      const { data: byTotal } = await supabase
        .from('detected_order_emails')
        .select('id')
        .eq('household_id', householdId)
        .eq('merchant_name', merchantName)
        .gte('order_total', orderTotal - tolerance)
        .lte('order_total', orderTotal + tolerance)
        .gte('order_date', windowStart)
        .lte('order_date', windowEnd)
        .limit(1);
      if (byTotal?.length) return true;
    }
  }

  return false;
}

module.exports = { ORDER_CONFIRMATION_PATTERNS, MERCHANT_DOMAIN_MAP, detectOrderEmail, isDuplicateOrder };
