const history = new Map();

const adminNavigation = {
  push: (ctx, action) => {
    if (!history.has(ctx.from.id)) {
      history.set(ctx.from.id, []);
    }
    const userHistory = history.get(ctx.from.id);
    userHistory.push(action);
  },

  pop: (ctx) => {
    const userHistory = history.get(ctx.from.id);
    if (!userHistory || userHistory.length === 0) return 'admin_home'; // Default fallback
    
    // Pop the current action (which is the one we are in)
    userHistory.pop();
    // Pop the one we want to go back to
    const target = userHistory.pop();
    return target || 'admin_home';
  },

  clear: (ctx) => {
    history.delete(ctx.from.id);
  }
};

module.exports = adminNavigation;
