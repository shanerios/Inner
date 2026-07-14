module.exports = function removeConsoleInProduction() {
  return {
    name: 'remove-console-in-production',
    visitor: {
      CallExpression(path) {
        const callee = path.node.callee;
        if (
          callee?.type === 'MemberExpression' &&
          callee.object?.type === 'Identifier' &&
          callee.object.name === 'console'
        ) {
          path.remove();
        }
      },
    },
  };
};
