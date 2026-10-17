// Detection is deliberately conservative. It never converts prose into an
// affirmative deal fact or authorizes outreach. Original text stays untouched.
export function unsupportedBuyerRestrictions(...values) {
  const text = values.filter(value => typeof value === 'string').join('\n')
    // A supported ARV deduction is a financial rule, not an unhandled condition.
    .replace(/\b\d+(?:\.\d+)?\s*(?:%?\s*(?:[–—-]|to)\s*\d+(?:\.\d+)?)?\s*%\s*(?:of\s+)?ARV\s*(?:minus\b|less\b|[-–—−])\s*(?:the\s+)?(?:estimated\s+)?(?:repairs?|rehab(?:ilitation)?|renovations?)(?:\s+costs?)?\b/gi, '');
  const rules = [
    ['Negative or exclusive criteria', /\b(?:no|not|without|avoid\w*|exclud\w*|only|must|required?|prohibit\w*)\b/i],
    ['Location or structural restriction', /\bflood\w*\b|\bbusy\s+(?:roads?|streets?)\b|\bstructural\b|\bfoundation\b/i],
    ['Property condition requires review', /\b(?:cosmetic|gut|boarded|tear[ -]?down|rent[ -]?ready|heavy|moderate)\b|\b(?:rehab|renovation|repair|roof|kitchen|condition)s?\b/i],
    ['Financing or return terms require review', /\bfinanc\w*|\bseller\s+carry\b|\bsubject[ -]?to\b|\bsubto\b|\bdown\s*payment\b|\b(?:cash[ -]?flow|cap rate|yield|DSCR|balloon)\b/i],
    ['Qualified preference requires review', /\bprefer\w*|\bif\b|\bwhen\b|\bdepending\b|\bgenerally\b|\bapproximately\b/i],
  ];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}
