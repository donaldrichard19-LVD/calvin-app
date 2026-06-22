'use strict';

const PATTERNS = [
  { test: /doordash/i, assistant_name: 'Ask DoorDash', merchant_domain: 'doordash.com' },
  { test: /amazon|rufus/i, assistant_name: 'Amazon Rufus', merchant_domain: 'amazon.com' },
  { test: /chatgpt|openai/i, assistant_name: 'ChatGPT', merchant_domain: null },
  { test: /claude|anthropic/i, assistant_name: 'Claude', merchant_domain: null },
];

function parseAssistantFromUA(userAgentString) {
  if (!userAgentString) return { assistant_name: 'Unknown', merchant_domain: null };
  for (const { test, assistant_name, merchant_domain } of PATTERNS) {
    if (test.test(userAgentString)) return { assistant_name, merchant_domain };
  }
  return { assistant_name: 'Unknown', merchant_domain: null };
}

module.exports = { parseAssistantFromUA };
