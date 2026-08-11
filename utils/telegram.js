function escapeMarkdown(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

module.exports = { escapeMarkdown };
