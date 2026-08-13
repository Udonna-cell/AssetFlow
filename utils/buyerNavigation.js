const history = new Map();

const buyerNavigation = {
  push: (ctx, action) => {
    if (!history.has(ctx.from.id)) {
      history.set(ctx.from.id, []);
    }
    const userHistory = history.get(ctx.from.id);
    userHistory.push(action);
  },

  pop: (ctx) => {
    const userHistory = history.get(ctx.from.id);
    if (!userHistory || userHistory.length === 0) return 'home_menu'; // Default fallback
    
    // Pop the current action
    userHistory.pop();
    // Pop the one we want to go back to
    const target = userHistory.pop();
    return target || 'home_menu';
  },

  clear: (ctx) => {
    history.delete(ctx.from.id);
  }
};

module.exports = buyerNavigation;
