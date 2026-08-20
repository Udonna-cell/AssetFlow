function formatNumber(num) {
  if (num < 1000) return num.toString();
  return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
}

module.exports = { formatNumber };
